import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadServerConfigs } from './config'

const directories: string[] = []

function setup(): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-mcp-config-'))
  directories.push(directory)
  return { directory, file: join(directory, 'mcp.json') }
}

function writeConfig(directory: string, data: unknown): string {
  const path = join(directory, 'mcp.json')
  writeFileSync(path, JSON.stringify(data), 'utf8')
  return path
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('loadServerConfigs', () => {
  it('returns an empty list for a missing file', () => {
    const { directory } = setup()
    expect(loadServerConfigs(join(directory, 'does-not-exist.json'))).toEqual([])
  })

  it('is lenient about a missing servers key', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { unrelated: true })
    expect(loadServerConfigs(path)).toEqual([])
  })

  it('is lenient about a non-object top level', () => {
    const { file } = setup()
    writeFileSync(file, '[]', 'utf8')
    expect(loadServerConfigs(file)).toEqual([])
  })

  it('is lenient about malformed JSON', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')
    expect(loadServerConfigs(file)).toEqual([])
  })

  it('expands environment variables', () => {
    vi.stubEnv('MCP_SECRET', 's3cret')
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        gh: { transport: 'http', url: 'https://x.test/${MCP_SECRET}' }
      }
    })

    const configs = loadServerConfigs(path)

    expect(configs).toHaveLength(1)
    expect(configs[0].url).toBe('https://x.test/s3cret')
  })

  it('expands PYTHON variables to the running interpreter for compatibility', () => {
    vi.stubEnv('PYTHON', 'ignored')
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        one: { command: '${PYTHON}' },
        two: { command: '${PYTHON_EXE}' }
      }
    })

    const configs = loadServerConfigs(path)

    expect(configs.map((config) => config.command)).toEqual([
      process.execPath,
      process.execPath
    ])
  })

  it('expands an unknown variable to an empty string', () => {
    vi.stubEnv('MCP_NOT_SET', '')
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { s: { command: 'run-${MCP_NOT_SET}-now' } }
    })

    expect(loadServerConfigs(path)[0].command).toBe('run--now')
  })

  it('expands args, env, cwd, url and headers', () => {
    vi.stubEnv('ROOT', '/opt/app')
    vi.stubEnv('KEY', 'abc')
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        s: {
          command: '${PYTHON}',
          args: ['--root', '${ROOT}'],
          env: { TOKEN: '${KEY}' },
          cwd: '${ROOT}/sub'
        },
        h: {
          transport: 'http',
          url: 'https://${KEY}.test',
          headers: { Authorization: 'Bearer ${KEY}' }
        }
      }
    })

    const byName = new Map(
      loadServerConfigs(path).map((config) => [config.name, config])
    )

    expect(byName.get('s')?.args).toEqual(['--root', '/opt/app'])
    expect(byName.get('s')?.env).toEqual({ TOKEN: 'abc' })
    expect(byName.get('s')?.cwd).toBe('/opt/app/sub')
    expect(byName.get('h')?.url).toBe('https://abc.test')
    expect(byName.get('h')?.headers).toEqual({ Authorization: 'Bearer abc' })
  })

  it('skips disabled servers', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        keep: { command: 'a' },
        drop: { command: 'b', enabled: false }
      }
    })

    expect(loadServerConfigs(path).map((config) => config.name)).toEqual([
      'keep'
    ])
  })

  it('does not validate disabled servers', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { drop: { transport: 'http', enabled: false } }
    })

    expect(loadServerConfigs(path)).toEqual([])
  })

  it('defaults transport to stdio when a command is present', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { servers: { s: { command: 'npx' } } })

    expect(loadServerConfigs(path)[0].transport).toBe('stdio')
  })

  it('defaults transport to http when no command is present', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { s: { url: 'https://x.test' } }
    })

    expect(loadServerConfigs(path)[0].transport).toBe('http')
  })

  it('respects an explicit transport', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { s: { transport: 'http', url: 'https://x.test' } }
    })

    expect(loadServerConfigs(path)[0].transport).toBe('http')
  })

  it('rejects a stdio server without a command', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { broken: { transport: 'stdio' } }
    })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'broken' uses stdio but has no command."
    )
  })

  it('rejects an http server without a url', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { broken: { transport: 'http' } }
    })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'broken' uses http but has no url."
    )
  })

  it('rejects an unknown transport with the exact message', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { broken: { transport: 'smtp', command: 'x' } }
    })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'broken' has unknown transport 'smtp'."
    )
  })

  it('rejects a non-object server entry', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { servers: { broken: 'nope' } })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'broken' must be a JSON object."
    )
  })

  it('defaults boolean flags to false and enabled', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { servers: { s: { command: 'x' } } })

    const config = loadServerConfigs(path)[0]

    expect(config.enabled).toBe(true)
    expect(config.autoApprove).toBe(false)
    expect(config.readOnly).toBe(false)
  })

  it('reads explicit boolean flags', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        s: { command: 'x', auto_approve: true, read_only: true }
      }
    })

    const config = loadServerConfigs(path)[0]

    expect(config.autoApprove).toBe(true)
    expect(config.readOnly).toBe(true)
  })

  it('reads write_tools from config', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        notion: {
          command: 'x',
          write_tools: ['API-post-page', 'API-delete-a-block']
        }
      }
    })

    const config = loadServerConfigs(path)[0]

    expect(config.writeTools).toEqual(
      new Set(['API-post-page', 'API-delete-a-block'])
    )
  })

  it('defaults write_tools to an empty set', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { servers: { s: { command: 'x' } } })

    expect(loadServerConfigs(path)[0].writeTools).toEqual(new Set())
  })

  it('rejects invalid write_tools', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { notion: { command: 'x', write_tools: 'nope' } }
    })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'notion' has invalid write_tools (expected a list of strings)."
    )
  })

  it('reads the tools allowlist from config', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: {
        notion: {
          command: 'x',
          tools: ['API-post-search', 'API-post-page']
        }
      }
    })

    expect(loadServerConfigs(path)[0].tools).toEqual([
      'API-post-search',
      'API-post-page'
    ])
  })

  it('defaults tools to null', () => {
    const { directory } = setup()
    const path = writeConfig(directory, { servers: { s: { command: 'x' } } })

    expect(loadServerConfigs(path)[0].tools).toBeNull()
  })

  it('rejects invalid tools', () => {
    const { directory } = setup()
    const path = writeConfig(directory, {
      servers: { notion: { command: 'x', tools: 'nope' } }
    })

    expect(() => loadServerConfigs(path)).toThrow(
      "MCP server 'notion' has invalid tools (expected a list of strings)."
    )
  })

  it('rejects invalid args and mapping fields', () => {
    const { directory } = setup()
    const badArgs = writeConfig(directory, {
      servers: { broken: { command: 'x', args: 'nope' } }
    })
    expect(() => loadServerConfigs(badArgs)).toThrow(
      "MCP server 'broken' has invalid args."
    )

    const badEnv = writeConfig(directory, {
      servers: { broken: { command: 'x', env: [] } }
    })
    expect(() => loadServerConfigs(badEnv)).toThrow(
      "MCP server 'broken' has an invalid mapping field."
    )
  })
})
