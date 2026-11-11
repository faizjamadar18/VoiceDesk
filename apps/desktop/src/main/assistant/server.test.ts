/**
 * Endpoint tests for the in-process assistant server.
 *
 * Ported from the FastAPI pytest specs that used `TestClient`: `test_callback`,
 * `test_transcription_api`, `test_act_responses`, `test_act_tools`, and
 * `test_screen_api`. Each test drives the real `AssistantServer` over HTTP so
 * routes, validation, status codes, headers, and response bodies are all
 * exercised the way the desktop and the smoke harness exercise them.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ActionExecutionError } from './actions'
import { FileOps } from './files'
import { RulePlanner } from './planner'
import { AssistantService, type AssistantServiceOptions } from './service'
import { AssistantServer, parseApiAddress } from './server'
import type {
  ActionExecutor,
  Directive,
  FileSearch,
  Planner
} from './types'
import type { Transcriber } from './transcribers'
import {
  VisionProviderError,
  VisionQuotaError,
  type VisionClient
} from './vision'
import { WeatherResult } from './weather'
import { WindowsSearchUnavailable } from './windows-search'

const FIXED_NOW = new Date(2026, 10, 8, 12, 0, 0)
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32)
])
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32)
])
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const AUDIO = Buffer.from('fake-audio-bytes')
const QUESTION = 'What does this error mean?'

// -- Env and server lifecycle -------------------------------------------

const envSnapshot = new Map<string, string | undefined>()
const runningServers: AssistantServer[] = []
const tempDirs: string[] = []

function setEnv(key: string, value: string): void {
  if (!envSnapshot.has(key)) envSnapshot.set(key, process.env[key])
  process.env[key] = value
}

function delEnv(key: string): void {
  if (!envSnapshot.has(key)) envSnapshot.set(key, process.env[key])
  delete process.env[key]
}

beforeEach(() => {
  delEnv('KESTREL_MCP_ENABLED')
})

afterEach(async () => {
  for (const [key, value] of envSnapshot) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  envSnapshot.clear()
  for (const server of runningServers.splice(0)) {
    await server.close()
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-api-'))
  tempDirs.push(dir)
  return dir
}

async function startServer(
  options: AssistantServiceOptions = {}
): Promise<string> {
  const service = new AssistantService(options)
  await service.initialize()
  const server = new AssistantServer({ service, host: '127.0.0.1', port: 0 })
  await server.listen()
  runningServers.push(server)
  return server.url()
}

async function postJson(
  baseUrl: string,
  path: string,
  payload: unknown
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return { status: response.status, body: await response.json() }
}

async function getJson(
  baseUrl: string,
  path: string
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`)
  return { status: response.status, body: await response.json() }
}

// -- Test doubles -------------------------------------------------------

function staticPlanner(directive: Directive): Planner {
  return { plan: async () => directive }
}

class RecordingExecutor implements ActionExecutor {
  readonly openedApps: string[] = []
  readonly openedUrls: string[] = []

  constructor(private readonly fail = false) {}

  openApp(app: string): void {
    if (this.fail) throw new Error('app launch failed')
    this.openedApps.push(app)
  }

  openUrl(url: string): void {
    if (this.fail) throw new Error('browser launch failed')
    this.openedUrls.push(url)
  }
}

class MissingAppExecutor extends RecordingExecutor {
  override openApp(app: string): void {
    const label = app.charAt(0).toUpperCase() + app.slice(1)
    throw new ActionExecutionError(`${label} is not installed on this PC.`)
  }
}

class TrashingFileOps extends FileOps {
  readonly removed: string[]

  constructor(home: string) {
    const removed: string[] = []
    const desktop = join(home, 'Desktop')
    mkdirSync(desktop, { recursive: true })
    super(home, {
      knownFolders: { desktop },
      trash: (target) => {
        removed.push(resolve(target))
        rmSync(target, { recursive: true, force: true })
      }
    })
    this.removed = removed
  }
}

class FakeWindowsSearch implements FileSearch {
  readonly queries: string[] = []

  constructor(
    private readonly results: Array<Record<string, unknown>> = [],
    private readonly error: Error | null = null
  ) {}

  search(query: string): Array<Record<string, unknown>> {
    this.queries.push(query)
    if (this.error !== null) throw this.error
    return [...this.results]
  }
}

class FakeVisionClient implements VisionClient {
  readonly model = 'test/vision-model'
  readonly calls: Array<Record<string, unknown>> = []

  constructor(
    private readonly answerText = 'The file could not be found.',
    private readonly error: Error | null = null
  ) {}

  async answer(request: {
    question: string
    imageBase64: string
    mimeType: string
    marked: boolean
  }): Promise<string> {
    this.calls.push({ ...request })
    if (this.error !== null) throw this.error
    return this.answerText
  }
}

class MinimalVisionClient implements VisionClient {
  async answer(): Promise<string> {
    return 'An answer.'
  }
}

class RuntimeError extends Error {}

class FailingTranscriber implements Transcriber {
  readonly name = 'failing'
  async transcribe(): Promise<string> {
    throw new RuntimeError(`provider exploded handling ${AUDIO.toString()}`)
  }
}

function encode(data: Buffer): string {
  return data.toString('base64')
}

function requestBody(
  options: { image?: string; question?: string; marked?: boolean } = {}
): Record<string, unknown> {
  return {
    question: options.question ?? QUESTION,
    image: options.image ?? encode(PNG_BYTES),
    marked: options.marked ?? true
  }
}

// -- Callback -----------------------------------------------------------

describe('callback routes', () => {
  it('GET /callback returns the login HTML', async () => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/callback`)
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').toContain('text/html')
    expect(text).toContain('Login Successful')
    expect(text).toContain('voicedesk://auth/callback')
    expect(text).toContain('Open VoiceDesk')
  })

  it('GET /auth/callback is an alias', async () => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/auth/callback`)
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').toContain('text/html')
    expect(text).toContain('Login Successful')
    expect(text).toContain('voicedesk://auth/callback')
    expect(text).toContain('Open VoiceDesk')
  })
})

// -- Health and transcription ------------------------------------------

describe('health and transcription', () => {
  it('reports the fake provider as configured', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    const baseUrl = await startServer()

    const { status, body } = await getJson(baseUrl, '/health')

    expect(status).toBe(200)
    expect(body).toEqual({ status: 'ok', provider: 'fake', configured: true })
  })

  it('reports groq without a key as not configured', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'groq')
    delEnv('GROQ_API_KEY')
    const baseUrl = await startServer()

    const { body } = await getJson(baseUrl, '/health')

    expect(body).toEqual({ status: 'ok', provider: 'groq', configured: false })
  })

  it('defaults the provider to groq', async () => {
    delEnv('KESTREL_ASR_PROVIDER')
    delEnv('GROQ_API_KEY')
    const baseUrl = await startServer()

    const { body } = await getJson(baseUrl, '/health')

    expect(body.provider).toBe('groq')
  })

  it.each(['audio/webm; codecs=opus', 'application/octet-stream'])(
    'transcribes with the fake provider for %s',
    async (contentType) => {
      setEnv('KESTREL_ASR_PROVIDER', 'fake')
      setEnv('KESTREL_FAKE_TRANSCRIPT', 'Hello from the fake transcriber.')
      const baseUrl = await startServer()

      const response = await fetch(`${baseUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: AUDIO
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.text).toBe('Hello from the fake transcriber.')
      expect(body.provider).toBe('fake')
      expect(Number.isInteger(body.latencyMs)).toBe(true)
      expect(body.latencyMs).toBeGreaterThanOrEqual(0)
    }
  )

  it('uses the default fake transcript', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    delEnv('KESTREL_FAKE_TRANSCRIPT')
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: AUDIO
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.text).toBe('Fake transcription from Kestrel.')
  })

  it('rejects an empty body with 400', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: Buffer.alloc(0)
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.detail).toBeTruthy()
  })

  it('rejects a non-audio content type with 415', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: AUDIO
    })
    const body = await response.json()

    expect(response.status).toBe(415)
    expect(String(body.detail).toLowerCase()).toContain('audio')
  })

  it('rejects an oversized body with 413', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: Buffer.alloc(MAX_AUDIO_BYTES + 1)
    })
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.detail).toBeTruthy()
  })

  it('maps a provider failure to 502 without leaking the audio', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'fake')
    const baseUrl = await startServer({
      transcriberFactory: () => new FailingTranscriber()
    })

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: AUDIO
    })
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(typeof body.detail).toBe('string')
    expect(body.detail).toBeTruthy()
    expect(body.detail).not.toContain(AUDIO.toString())
  })

  it('returns 503 for groq without a key', async () => {
    setEnv('KESTREL_ASR_PROVIDER', 'groq')
    delEnv('GROQ_API_KEY')
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: AUDIO
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.detail).toContain('GROQ_API_KEY')
  })
})

// -- Action planning responses -----------------------------------------

describe('act planning responses', () => {
  beforeEach(() => {
    delEnv('KESTREL_GROQ_API_KEY')
    delEnv('GROQ_API_KEY')
  })

  it('returns a weather card and final speech', async () => {
    const baseUrl = await startServer({
      clock: () => FIXED_NOW,
      planner: new RulePlanner(() => FIXED_NOW),
      weather: {
        fetch: async (location) =>
          new WeatherResult(
            location,
            '24°C',
            '18°',
            '27°',
            'Partly Cloudy',
            'cloud',
            'Partly cloudy today.'
          )
      }
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: "What's the weather in India today?"
    })

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.action).toBe('weather')
    expect(body.card.kind).toBe('weather')
    expect(body.card.location).toBe('India')
    expect(body.card.temperature).toContain('°C')
    expect(body.card.condition).not.toBe('')
    expect(body.spokenResponse).toBeTruthy()
  })

  it('includes final speech for an answer', async () => {
    const baseUrl = await startServer({
      clock: () => FIXED_NOW,
      planner: new RulePlanner(() => FIXED_NOW)
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'what time is it'
    })

    expect(body.status).toBe('ok')
    expect(body.action).toBe('answer')
    expect(body.spokenResponse).toBe(body.message)
  })

  it('includes final speech for an unhandled transcript', async () => {
    const baseUrl = await startServer({
      clock: () => FIXED_NOW,
      planner: new RulePlanner(() => FIXED_NOW)
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'sing an opera song'
    })

    expect(body.status).toBe('unhandled')
    expect(body.spokenResponse).toBe(body.message)
  })

  it('returns an empty message and no speech for a screen directive', async () => {
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'screen',
        question: 'what is this error?'
      })
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'what is this error?'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.action).toBe('look_at_screen')
    expect(body.message).toBe('')
    expect(body.spokenResponse).toBeNull()
  })
})

// -- Action tools -------------------------------------------------------

describe('act tools', () => {
  it('runs the tool chosen by the planner', async () => {
    const executor = new RecordingExecutor()
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'open_app', arguments: { app: 'calculator' } }
      }),
      actionExecutor: executor
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'open the calculator'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.action).toBe('open_app')
    expect(body.message).toBe('Opening Calculator.')
    expect(executor.openedApps).toEqual(['calculator'])
  })

  it('returns search results without a pending plan', async () => {
    const home = tempDir()
    writeFileSync(join(home, 'note.txt'), 'hello')
    writeFileSync(join(home, 'other.md'), 'x')
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'search_files', arguments: { query: 'note' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home]
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'find note' })

    expect(body.status).toBe('ok')
    expect(body.action).toBe('search_files')
    expect(body.results.map((item: { name: string }) => item.name)).toEqual([
      'note.txt'
    ])
    expect(body.planId).toBeNull()
  })

  it('uses the injected Windows Search provider', async () => {
    const found = [
      {
        name: 'scan-001.pdf',
        path: 'C:\\Users\\me\\Documents\\2025 Tax Returns\\scan-001.pdf',
        sizeBytes: 1234,
        modified: '2026-11-07T09:41:12+00:00'
      }
    ]
    const provider = new FakeWindowsSearch(found)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'search_files', arguments: { query: 'tax returns' } }
      }),
      actionExecutor: new RecordingExecutor(),
      windowsSearch: provider
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'find tax returns'
    })

    expect(body.status).toBe('ok')
    expect(body.action).toBe('search_files')
    expect(body.results).toEqual(found)
    expect(provider.queries).toEqual(['tax returns'])
  })

  it('reports Windows Search unavailable honestly', async () => {
    const provider = new FakeWindowsSearch(
      [],
      new WindowsSearchUnavailable('Windows Search is unavailable.')
    )
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'search_files', arguments: { query: 'budget' } }
      }),
      actionExecutor: new RecordingExecutor(),
      windowsSearch: provider
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'find my budget'
    })

    expect(body.status).toBe('error')
    expect(body.action).toBe('search_files')
    expect(body.results).toBeNull()
    expect(String(body.message).toLowerCase()).toContain('windows search')
  })

  it('ignores the Windows Search provider when roots are explicit', async () => {
    const home = tempDir()
    writeFileSync(join(home, 'note.txt'), 'hello')
    const provider = new FakeWindowsSearch(
      [],
      new Error('Windows Search must not run with explicit roots')
    )
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'search_files', arguments: { query: 'note' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      windowsSearch: provider
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'find note' })

    expect(body.status).toBe('ok')
    expect(body.results.map((item: { name: string }) => item.name)).toEqual([
      'note.txt'
    ])
    expect(provider.queries).toEqual([])
  })

  it('returns unhandled for a none directive', async () => {
    const baseUrl = await startServer({
      planner: staticPlanner({ kind: 'none', message: 'Nope.' }),
      actionExecutor: new RecordingExecutor()
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'do a backflip'
    })

    expect(body.status).toBe('unhandled')
    expect(body.action).toBe('none')
    expect(body.message).toBe('Nope.')
  })

  it('creates a folder directly and offers undo', async () => {
    const home = tempDir()
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'create_folder', arguments: { name: 'Kestrel Notes' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileOps
    })
    const target = join(home, 'Desktop', 'Kestrel Notes')

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'make a folder'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.action).toBe('create_folder')
    expect(body.canUndo).toBe(true)
    expect(body.target).toBe(resolve(target))
    expect(body.planId).toBeTruthy()

    const undo = await postJson(baseUrl, '/act/undo', { planId: body.planId })
    expect(undo.status).toBe(200)
    expect(undo.body.action).toBe('undo')
    expect(fileOps.removed).toEqual([resolve(target)])
  })

  it('creates a file directly and offers undo', async () => {
    const home = tempDir()
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'create_file', arguments: { name: 'notes' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileOps
    })

    const { body } = await postJson(baseUrl, '/act', {
      transcript: 'create a file'
    })
    expect(body.status).toBe('ok')
    expect(body.canUndo).toBe(true)

    await postJson(baseUrl, '/act/undo', { planId: body.planId })
  })

  it('pends a delete, then confirms to the recycle bin', async () => {
    const home = tempDir()
    const victim = join(home, 'report.pdf')
    writeFileSync(victim, 'x')
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'delete_file', arguments: { query: 'report' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps
    })

    const pending = await postJson(baseUrl, '/act', { transcript: 'delete report' })
    expect(pending.status).toBe(200)
    expect(pending.body.status).toBe('pending')
    expect(pending.body.action).toBe('delete_file')
    expect(pending.body.requiresConfirmation).toBe(true)
    expect(pending.body.risk).toBe('write')
    expect(pending.body.target).toBe(resolve(victim))
    expect(String(pending.body.message).toLowerCase()).toContain('approval needed')

    const confirmed = await postJson(baseUrl, '/act/confirm', {
      planId: pending.body.planId,
      approved: true
    })
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.status).toBe('ok')
    expect(String(confirmed.body.message).toLowerCase()).toContain('recycle bin')
    expect(confirmed.body.canUndo).toBeFalsy()
    expect(fileOps.removed).toEqual([resolve(victim)])
  })

  it('keeps the file when a delete is cancelled', async () => {
    const home = tempDir()
    const victim = join(home, 'report.pdf')
    writeFileSync(victim, 'x')
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'delete_file', arguments: { query: 'report' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps
    })

    const pending = await postJson(baseUrl, '/act', { transcript: 'delete report' })
    const response = await postJson(baseUrl, '/act/confirm', {
      planId: pending.body.planId,
      approved: false
    })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('cancelled')
    expect(fileOps.removed).toEqual([])
  })

  it('refuses an ambiguous delete', async () => {
    const home = tempDir()
    writeFileSync(join(home, 'report.pdf'), 'x')
    writeFileSync(join(home, 'report.docx'), 'y')
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'delete_file', arguments: { query: 'report' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps: new TrashingFileOps(home)
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'delete report' })

    expect(body.status).toBe('unhandled')
    expect(body.planId).toBeNull()
    expect(body.results).toHaveLength(2)
    expect(String(body.message).toLowerCase()).toContain('which one')
  })

  it('reports when a delete matches nothing', async () => {
    const home = tempDir()
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'delete_file', arguments: { query: 'unicorn' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps: new TrashingFileOps(home)
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'delete unicorn' })

    expect(body.status).toBe('unhandled')
    expect(String(body.message).toLowerCase()).toContain("couldn't find")
  })

  it('accepts any app name', async () => {
    const executor = new RecordingExecutor()
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'open_app', arguments: { app: 'Notion' } }
      }),
      actionExecutor: executor
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'open notion' })

    expect(body.status).toBe('ok')
    expect(body.message).toBe('Opening Notion.')
    expect(executor.openedApps).toEqual(['Notion'])
  })

  it('reports a missing app without a 502', async () => {
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'open_app', arguments: { app: 'Notion' } }
      }),
      actionExecutor: new MissingAppExecutor()
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'open notion'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('error')
    expect(body.message).toBe('Notion is not installed on this PC.')
    expect(body.spokenResponse).toBe(body.message)
  })

  it('is unhandled when a tool argument has the wrong type', async () => {
    const executor = new RecordingExecutor()
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'open_app', arguments: { app: 42 } }
      }),
      actionExecutor: executor
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'open something'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('unhandled')
    expect(executor.openedApps).toEqual([])
  })

  it('is unhandled when a required argument is missing', async () => {
    const home = tempDir()
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'create_folder', arguments: {} }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps
    })

    const { body } = await postJson(baseUrl, '/act', { transcript: 'make a folder' })

    expect(body.status).toBe('unhandled')
    expect(body.planId).toBeNull()
    expect(fileOps.removed).toEqual([])
  })

  it('returns 404 for an unknown confirm plan id', async () => {
    const baseUrl = await startServer({
      planner: staticPlanner({ kind: 'none', message: 'x' }),
      actionExecutor: new RecordingExecutor()
    })

    const { status } = await postJson(baseUrl, '/act/confirm', {
      planId: 'deadbeef',
      approved: true
    })

    expect(status).toBe(404)
  })

  it('returns 404 for an unknown undo plan id', async () => {
    const baseUrl = await startServer({
      planner: staticPlanner({ kind: 'none', message: 'x' }),
      actionExecutor: new RecordingExecutor()
    })

    const { status } = await postJson(baseUrl, '/act/undo', { planId: 'deadbeef' })

    expect(status).toBe(404)
  })

  it('pends nothing and touches nothing in dry-run', async () => {
    setEnv('KESTREL_ACTION_DRY_RUN', '1')
    const home = tempDir()
    const fileOps = new TrashingFileOps(home)
    const baseUrl = await startServer({
      planner: staticPlanner({
        kind: 'tool',
        call: { name: 'create_folder', arguments: { name: 'DryRun' } }
      }),
      actionExecutor: new RecordingExecutor(),
      fileRoots: [home],
      fileOps
    })

    const { status, body } = await postJson(baseUrl, '/act', {
      transcript: 'make a folder'
    })

    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.planId).toBeNull()
    expect(body.dryRun).toBe(true)
    expect(fileOps.removed).toEqual([])
  })

  it('reports rule planning without a Groq key', async () => {
    delEnv('KESTREL_GROQ_API_KEY')
    delEnv('GROQ_API_KEY')
    const baseUrl = await startServer({ actionExecutor: new RecordingExecutor() })

    const { status, body } = await getJson(baseUrl, '/planner')

    expect(status).toBe(200)
    expect(body.provider).toBe('rule')
    expect(body.configured).toBe(true)
    expect(body.model).toBeTruthy()
  })

  it('reports groq planning when a key is present', async () => {
    setEnv('GROQ_API_KEY', 'test-key')
    setEnv('KESTREL_GROQ_MODEL', 'openai/gpt-oss-20b')
    const baseUrl = await startServer({ actionExecutor: new RecordingExecutor() })

    const { status, body } = await getJson(baseUrl, '/planner')

    expect(status).toBe(200)
    expect(body.provider).toBe('groq')
    expect(body.configured).toBe(true)
    expect(body.model).toBe('openai/gpt-oss-20b')
  })
})

// -- Screen Q&A ---------------------------------------------------------

describe('screen/ask', () => {
  it('returns the answer, model, and latency', async () => {
    const fake = new FakeVisionClient()
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(200)
    expect(body.answer).toBe('The file could not be found.')
    expect(body.model).toBe('test/vision-model')
    expect(Number.isInteger(body.latencyMs)).toBe(true)
    expect(body.latencyMs).toBeGreaterThanOrEqual(0)
    expect(fake.calls).toEqual([
      {
        question: QUESTION,
        imageBase64: encode(PNG_BYTES),
        mimeType: 'image/png',
        marked: true
      }
    ])
  })

  it.each([
    [PNG_BYTES, 'image/png', true],
    [JPEG_BYTES, 'image/jpeg', false]
  ])('detects the image type from magic bytes', async (bytes, mime, marked) => {
    const fake = new FakeVisionClient()
    const baseUrl = await startServer({ visionClient: fake })

    const { status } = await postJson(
      baseUrl,
      '/screen/ask',
      requestBody({ image: encode(bytes as Buffer), marked: marked as boolean })
    )

    expect(status).toBe(200)
    expect(fake.calls[0].mimeType).toBe(mime)
    expect(fake.calls[0].marked).toBe(marked)
  })

  it('uses the configured model for the response', async () => {
    setEnv('KESTREL_GROQ_VISION_MODEL', 'vision/env-model')
    const baseUrl = await startServer({ visionClient: new MinimalVisionClient() })

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(200)
    expect(body.model).toBe('vision/env-model')
  })

  it.each([
    ['blank question', { ...requestBody(), question: '' }],
    ['whitespace question', { ...requestBody(), question: '   ' }],
    ['long question', { ...requestBody(), question: 'x'.repeat(2001) }],
    ['empty image', { ...requestBody(), image: '' }],
    ['missing image', (() => {
      const body = requestBody()
      delete body.image
      return body
    })()],
    ['non-base64 image', { ...requestBody(), image: 'not base64!' }],
    ['data URL image', { ...requestBody(), image: `data:image/png;base64,${encode(PNG_BYTES)}` }],
    ['non-boolean marked', { ...requestBody(), marked: 'yes' }]
  ])('rejects malformed input (%s) with 422', async (_label, payload) => {
    const fake = new FakeVisionClient()
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(baseUrl, '/screen/ask', payload)

    expect(status).toBe(422)
    expect(body.detail).toBeTruthy()
    expect(fake.calls).toEqual([])
  })

  it('rejects a missing marked flag with 422', async () => {
    const fake = new FakeVisionClient()
    const payload = requestBody()
    delete payload.marked
    const baseUrl = await startServer({ visionClient: fake })

    const { status } = await postJson(baseUrl, '/screen/ask', payload)

    expect(status).toBe(422)
    expect(fake.calls).toEqual([])
  })

  it('rejects an oversized image with 413', async () => {
    const fake = new FakeVisionClient()
    const oversized = Buffer.concat([
      PNG_BYTES,
      Buffer.alloc(MAX_IMAGE_BYTES - PNG_BYTES.length + 1)
    ])
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(
      baseUrl,
      '/screen/ask',
      requestBody({ image: encode(oversized) })
    )

    expect(status).toBe(413)
    expect(body.detail).toContain('12 MiB')
    expect(fake.calls).toEqual([])
  })

  it.each([
    Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]),
    Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(32)]),
    Buffer.alloc(16)
  ])('rejects unsupported image bytes with 415', async (bytes) => {
    const fake = new FakeVisionClient()
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(
      baseUrl,
      '/screen/ask',
      requestBody({ image: encode(bytes) })
    )

    expect(status).toBe(415)
    expect(body.detail).toContain('PNG or JPEG')
    expect(fake.calls).toEqual([])
  })

  it('returns 503 without a key', async () => {
    delEnv('KESTREL_GROQ_API_KEY')
    delEnv('GROQ_API_KEY')
    const baseUrl = await startServer()

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(503)
    expect(body.detail).toContain('KESTREL_GROQ_API_KEY')
    expect(body.detail).toContain('GROQ_API_KEY')
  })

  it('maps a quota failure to 503', async () => {
    const fake = new FakeVisionClient(
      'ignored',
      new VisionQuotaError('Vision quota exhausted (HTTP 429).')
    )
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(503)
    expect(String(body.detail).toLowerCase()).toContain('quota')
  })

  it('maps a provider failure to 502', async () => {
    const fake = new FakeVisionClient(
      'ignored',
      new VisionProviderError('Vision provider failed with HTTP 500.')
    )
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(502)
    expect(body.detail).toBe('Vision provider failed with HTTP 500.')
  })

  it('maps an empty answer to 502', async () => {
    const fake = new FakeVisionClient('   ')
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(baseUrl, '/screen/ask', requestBody())

    expect(status).toBe(502)
    expect(String(body.detail).toLowerCase()).toContain('empty answer')
  })

  it('maps an unexpected failure to 502 without leaking input', async () => {
    const question = 'What is my password hunter2?'
    const image = encode(PNG_BYTES)
    const fake = new FakeVisionClient(
      'ignored',
      new RuntimeError(`${question} ${image}`)
    )
    const baseUrl = await startServer({ visionClient: fake })

    const { status, body } = await postJson(
      baseUrl,
      '/screen/ask',
      requestBody({ image, question })
    )

    expect(status).toBe(502)
    expect(body.detail).toContain('RuntimeError')
    expect(body.detail).not.toContain(question)
    expect(body.detail).not.toContain(image)
  })
})

// -- MCP status and request validation ---------------------------------

describe('mcp status', () => {
  it('reports disabled when no manager is connected', async () => {
    const baseUrl = await startServer()

    const { status, body } = await getJson(baseUrl, '/mcp/status')

    expect(status).toBe(200)
    expect(body).toEqual({ enabled: false, servers: [] })
  })
})

describe('request validation', () => {
  it('rejects a blank transcript with 422', async () => {
    const baseUrl = await startServer()
    const { status, body } = await postJson(baseUrl, '/act', { transcript: '   ' })

    expect(status).toBe(422)
    expect(body.detail).toBeTruthy()
  })

  it('rejects a missing transcript with 422', async () => {
    const baseUrl = await startServer()
    const { status } = await postJson(baseUrl, '/act', {})

    expect(status).toBe(422)
  })

  it('rejects a missing plan id with 422', async () => {
    const baseUrl = await startServer()
    const { status } = await postJson(baseUrl, '/act/undo', {})

    expect(status).toBe(422)
  })

  it('returns 404 for an unknown route', async () => {
    const baseUrl = await startServer()
    const { status, body } = await getJson(baseUrl, '/nope')

    expect(status).toBe(404)
    expect(body.detail).toBe('Not Found')
  })
})

describe('parseApiAddress', () => {
  it('falls back to the default address', () => {
    expect(parseApiAddress(undefined)).toEqual({ host: '127.0.0.1', port: 8765 })
    expect(parseApiAddress('not a url')).toEqual({ host: '127.0.0.1', port: 8765 })
  })

  it('reads host and port from the URL', () => {
    expect(parseApiAddress('http://127.0.0.1:9000')).toEqual({
      host: '127.0.0.1',
      port: 9000
    })
    expect(parseApiAddress('http://localhost:8765/')).toEqual({
      host: 'localhost',
      port: 8765
    })
  })
})
