import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const NEMO_MODEL_FILE = 'nemotron-speech-streaming-en-0.6b.q8_0.gguf'

export interface NemoPaths {
  home: string
  executablePath: string
  modelPath: string
}

export interface NemoServerOptions extends NemoPaths {
  startupTimeoutMs?: number
  healthIntervalMs?: number
  fetch?: FetchLike
}

/** Per-user install root. Override with KESTREL_HOME to test from another drive. */
export function defaultKestrelHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.KESTREL_HOME?.trim()
  if (override) return override
  const localAppData = env.LOCALAPPDATA?.trim()
  return localAppData ? join(localAppData, 'Kestrel') : join(homedir(), '.kestrel')
}

export function resolveNemoPaths(env: NodeJS.ProcessEnv = process.env): NemoPaths {
  const home = defaultKestrelHome(env)
  const executable = process.platform === 'win32' ? 'nemo-speech.exe' : 'nemo-speech'
  return {
    home,
    executablePath:
      env.KESTREL_NEMO_EXECUTABLE?.trim() ||
      join(home, 'bin', 'nemo-speech', 'bin', executable),
    modelPath:
      env.KESTREL_NEMO_MODEL?.trim() || join(home, 'models', NEMO_MODEL_FILE)
  }
}

/** Find an unused localhost port for the private engine instance. */
export function findFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ port: 0, host }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine a free port.')))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Owns the local NeMo-Speech HTTP/WebSocket server. The model stays loaded
 * between turns. Audio crosses the loopback interface in memory and is never
 * written to disk.
 */
export class NemoServer {
  private readonly options: Required<
    Pick<NemoServerOptions, 'startupTimeoutMs' | 'healthIntervalMs'>
  > &
    NemoServerOptions
  private readonly fetchImpl: FetchLike
  private child: ChildProcess | null = null
  private port: number | null = null
  private starting: Promise<string> | null = null
  private stopping = false
  private outputTail = ''

  constructor(options: NemoServerOptions) {
    this.options = {
      startupTimeoutMs: 120_000,
      healthIntervalMs: 250,
      ...options
    }
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))
  }

  get baseUrl(): string | null {
    return this.port === null ? null : `http://127.0.0.1:${this.port}`
  }

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  async start(): Promise<string> {
    if (this.starting) return this.starting
    if (this.baseUrl && this.running) return this.baseUrl

    this.starting = this.launch()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    this.port = null

    if (!child || child.exitCode !== null) {
      this.stopping = false
      return
    }

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // The process already exited.
        }
        resolve()
      }, 3_000)

      child.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
      })

      try {
        child.kill()
      } catch {
        clearTimeout(killTimer)
        resolve()
      }
    })

    this.stopping = false
  }

  private async launch(): Promise<string> {
    const { executablePath, modelPath, home } = this.options
    if (!existsSync(executablePath)) {
      throw new Error(
        `The NVIDIA Nemotron engine was not found at ${executablePath}. ` +
          `Install it under ${home} or set KESTREL_HOME.`
      )
    }
    if (!existsSync(modelPath)) {
      throw new Error(
        `The NVIDIA Nemotron model was not found at ${modelPath}. ` +
          `Download ${NEMO_MODEL_FILE} into ${join(home, 'models')}.`
      )
    }

    const port = await findFreePort()
    const child = spawn(
      executablePath,
      [
        'serve',
        '--asr-model',
        modelPath,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--no-ui'
      ],
      {
        cwd: dirname(executablePath),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    this.child = child
    this.port = port
    this.outputTail = ''

    const capture = (chunk: Buffer): void => {
      this.outputTail = `${this.outputTail}${chunk.toString('utf8')}`.slice(-4_000)
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)

    let exited = false
    child.once('exit', (code, signal) => {
      exited = true
      if (this.child === child) {
        this.child = null
        this.port = null
      }
      if (!this.stopping) {
        console.warn(
          `[nemo] server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`
        )
      }
    })

    const startedAt = Date.now()
    while (Date.now() - startedAt < this.options.startupTimeoutMs) {
      if (exited) {
        throw new Error(`The NVIDIA Nemotron server stopped during startup. ${this.outputTail.trim()}`)
      }
      try {
        const response = await this.fetchImpl(`http://127.0.0.1:${port}/ready`)
        if (response.ok) {
          console.log(`[nemo] ready on 127.0.0.1:${port}`)
          return `http://127.0.0.1:${port}`
        }
      } catch {
        // The server is still loading the model.
      }
      await sleep(this.options.healthIntervalMs)
    }

    try {
      child.kill()
    } catch {
      // Ignore cleanup failure; the startup error is the useful signal.
    }
    this.child = null
    this.port = null
    throw new Error(
      `The NVIDIA Nemotron server did not become ready within ${this.options.startupTimeoutMs} ms. ${this.outputTail.trim()}`
    )
  }
}
