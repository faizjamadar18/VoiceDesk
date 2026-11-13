import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ActionExecutionError } from './actions'
import {
  LocationNotFound,
  TargetExists,
  UnsafeLocation
} from './files'
import {
  CreateFileTool,
  CreateFolderTool,
  CurrentDateTool,
  CurrentTimeTool,
  DeleteFileTool,
  GetWeatherTool,
  OpenAppTool,
  SearchFilesTool,
  TypeTextTool,
  WebSearchTool,
  buildDefaultRegistry,
  builtinToolNames,
  builtinTools
} from './tools'
import type {
  FileOpsLike,
  FileSearch,
  ToolContext,
  ToolSpec,
  WeatherClientLike
} from './types'
import { WindowsSearchUnavailable } from './windows-search'

const FIXED_NOW = new Date(2026, 10, 7, 9, 41, 12)

const TOOL_NAMES = new Set([
  'open_app',
  'web_search',
  'type_text',
  'current_time',
  'current_date',
  'search_files',
  'create_folder',
  'create_file',
  'delete_file',
  'get_weather'
])

interface Recorder {
  apps: string[]
  urls: string[]
}

function makeFileOps(overrides: Partial<FileOpsLike> = {}): FileOpsLike {
  return {
    createFolder: async () => {
      throw new Error('createFolder was not stubbed')
    },
    createFile: async () => {
      throw new Error('createFile was not stubbed')
    },
    deleteFile: async () => {
      throw new Error('deleteFile was not stubbed')
    },
    resolveDeleteTarget: async (target) => target,
    removeCreated: async () => undefined,
    ...overrides
  }
}

function makeFileSearch(
  results: Array<Record<string, unknown>> = []
): FileSearch {
  return {
    search: async () => [...results]
  }
}

function makeWeather(): WeatherClientLike {
  return {
    fetch: async (location) => ({
      location,
      temperature: '20\u00b0C',
      low: '10\u00b0',
      high: '22\u00b0',
      condition: 'Clear',
      icon: 'sun',
      spoken: 'Clear skies today.'
    })
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): {
  ctx: ToolContext
  recorder: Recorder
} {
  const recorder: Recorder = { apps: [], urls: [] }
  const ctx: ToolContext = {
    executor: {
      openApp: async (app) => {
        recorder.apps.push(app)
      },
      openUrl: async (url) => {
        recorder.urls.push(url)
      }
    },
    clock: () => FIXED_NOW,
    fileRoots: [],
    dryRun: false,
    fileOps: makeFileOps(),
    fileSearch: makeFileSearch(),
    weather: makeWeather(),
    ...overrides
  }
  return { ctx, recorder }
}

function specOf(name: string): ToolSpec {
  const tool = buildDefaultRegistry().get(name)
  if (tool === undefined) {
    throw new Error(`missing tool ${name}`)
  }
  return tool.spec
}

describe('built-in tool registry', () => {
  it('exposes all default tools', () => {
    const registry = buildDefaultRegistry()

    expect(new Set(registry.specs().map((spec) => spec.name))).toEqual(
      TOOL_NAMES
    )
  })

  it('returns undefined for an unknown tool', () => {
    expect(buildDefaultRegistry().get('no_such_tool')).toBeUndefined()
  })

  it('exposes built-in names and fresh tool instances', () => {
    expect(new Set(builtinToolNames())).toEqual(TOOL_NAMES)
    expect(builtinTools().map((tool) => tool.spec.name)).toEqual([
      'open_app',
      'web_search',
      'type_text',
      'current_time',
      'current_date',
      'search_files',
      'create_folder',
      'create_file',
      'delete_file',
      'get_weather'
    ])
  })

  it('creates folders without confirmation and with undo', () => {
    const spec = specOf('create_folder')

    expect(spec.risk).toBe('write')
    expect(spec.requiresConfirmation).toBe(false)
    expect(spec.undo).toBe('remove_created')
  })

  it('creates files without confirmation and with undo', () => {
    const spec = specOf('create_file')

    expect(spec.risk).toBe('write')
    expect(spec.requiresConfirmation).toBe(false)
    expect(spec.undo).toBe('remove_created')
  })

  it('deletes files with confirmation and no undo', () => {
    const spec = specOf('delete_file')

    expect(spec.risk).toBe('write')
    expect(spec.requiresConfirmation).toBe(true)
    expect(spec.undo).toBeUndefined()
  })

  it('searches files read-only', () => {
    const spec = specOf('search_files')

    expect(spec.risk).toBe('read')
    expect(spec.requiresConfirmation).toBe(false)
  })

  it('types text as an unconfirmed write', () => {
    const spec = specOf('type_text')

    expect(spec.risk).toBe('write')
    expect(spec.requiresConfirmation).toBe(false)
  })

  it('accepts any installed app name', () => {
    const spec = specOf('open_app')
    const properties = spec.parameters['properties'] as Record<
      string,
      Record<string, unknown>
    >
    const appParameter = properties['app']

    expect(appParameter['type']).toBe('string')
    expect(appParameter['enum']).toBeUndefined()
    expect(spec.description.toLowerCase()).toContain('installed')
  })

  it('produces Google-style function declarations', () => {
    const declarations = buildDefaultRegistry().functionDeclarations()

    expect(declarations).toHaveLength(TOOL_NAMES.size)
    for (const declaration of declarations) {
      expect(new Set(Object.keys(declaration))).toEqual(
        new Set(['name', 'description', 'parameters'])
      )
      expect(typeof declaration.description).toBe('string')
      expect(declaration.parameters['type']).toBe('object')
      expect(typeof declaration.parameters['properties']).toBe('object')
    }
  })

  it('keeps every built-in description short', () => {
    for (const tool of builtinTools()) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })

  it('keeps the weather action label capitalised', () => {
    expect(specOf('get_weather').actionLabel).toBe('Weather')
  })
})

describe('OpenAppTool', () => {
  it('opens an app and reports a friendly label', async () => {
    const { ctx, recorder } = makeContext()

    const outcome = await new OpenAppTool().run({ app: 'calculator' }, ctx)

    expect(outcome).toEqual({
      status: 'ok',
      action: 'open_app',
      message: 'Opening Calculator.',
      target: 'calculator'
    })
    expect(recorder.apps).toEqual(['calculator'])
  })

  it('does not execute in dry-run mode', async () => {
    const { ctx, recorder } = makeContext({ dryRun: true })

    const outcome = await new OpenAppTool().run({ app: 'notepad' }, ctx)

    expect(outcome.status).toBe('ok')
    expect(recorder.apps).toEqual([])
  })

  it('reports a missing app without throwing', async () => {
    const { ctx } = makeContext({
      executor: {
        openApp: async () => {
          throw new ActionExecutionError(
            'Notion is not installed on this PC.'
          )
        },
        openUrl: async () => undefined
      }
    })

    const outcome = await new OpenAppTool().run({ app: 'notion' }, ctx)

    expect(outcome.status).toBe('error')
    expect(outcome.action).toBe('open_app')
    expect(outcome.message).toBe('Notion is not installed on this PC.')
    expect(outcome.target).toBe('notion')
  })
})

describe('WebSearchTool', () => {
  it('opens a Google search in the browser', async () => {
    const { ctx, recorder } = makeContext()

    const outcome = await new WebSearchTool().run({ query: 'kestrel voice' }, ctx)

    expect(outcome.message).toBe('Searching the web for kestrel voice.')
    expect(outcome.url).toBe(
      'https://www.google.com/search?q=kestrel+voice'
    )
    expect(recorder.urls).toEqual([
      'https://www.google.com/search?q=kestrel+voice'
    ])
  })

  it('does not open the browser in dry-run mode', async () => {
    const { ctx, recorder } = makeContext({ dryRun: true })

    await new WebSearchTool().run({ query: 'kestrel' }, ctx)

    expect(recorder.urls).toEqual([])
  })
})

describe('TypeTextTool', () => {
  it('returns the text for the focused app', () => {
    const { ctx } = makeContext()

    const outcome = new TypeTextTool().run({ text: 'Hello world' }, ctx)

    expect(outcome).toEqual({
      status: 'ok',
      action: 'type',
      message: 'Typing that into the focused app.',
      text: 'Hello world'
    })
  })
})

describe('clock tools', () => {
  it('formats the local time', () => {
    const { ctx } = makeContext()

    expect(new CurrentTimeTool().run({}, ctx).message).toBe("It's 09:41.")
  })

  it('formats the local date', () => {
    const { ctx } = makeContext()

    expect(new CurrentDateTool().run({}, ctx).message).toBe(
      'Today is 2026-11-07.'
    )
  })
})

describe('SearchFilesTool', () => {
  const found = [
    {
      name: 'scan-001.pdf',
      path: 'C:\\Users\\me\\Documents\\2025 Tax Returns\\scan-001.pdf',
      sizeBytes: 1234,
      modified: '2026-11-07T09:41:12+00:00'
    }
  ]

  it('returns found files in the result shape', async () => {
    const { ctx } = makeContext({ fileSearch: makeFileSearch(found) })

    const outcome = await new SearchFilesTool().run(
      { query: 'tax returns' },
      ctx
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.action).toBe('search_files')
    expect(outcome.message).toBe(
      'I found 1 file(s) matching "tax returns".'
    )
    expect(outcome.results).toEqual(found)
  })

  it('reports Windows Search being unavailable honestly', async () => {
    const { ctx } = makeContext({
      fileSearch: {
        search: () => {
          throw new WindowsSearchUnavailable('nope')
        }
      }
    })

    const outcome = await new SearchFilesTool().run({ query: 'budget' }, ctx)

    expect(outcome.status).toBe('error')
    expect(outcome.action).toBe('search_files')
    expect(outcome.results).toBeUndefined()
    expect(outcome.message.toLowerCase()).toContain('windows search')
  })
})

describe('CreateFolderTool', () => {
  it('reports a dry-run creation without touching disk', async () => {
    const { ctx } = makeContext({ dryRun: true })

    const outcome = await new CreateFolderTool().run(
      { name: 'Kestrel Notes' },
      ctx
    )

    expect(outcome).toEqual({
      status: 'ok',
      action: 'create_folder',
      message: 'Created folder "Kestrel Notes".'
    })
  })

  it('creates a folder and offers undo', async () => {
    const target = path.join(path.sep, 'home', 'Desktop', 'Kestrel Notes')
    const { ctx } = makeContext({
      fileOps: makeFileOps({ createFolder: async () => target })
    })

    const outcome = await new CreateFolderTool().run(
      { name: 'Kestrel Notes' },
      ctx
    )

    expect(outcome).toEqual({
      status: 'ok',
      action: 'create_folder',
      message: `Created "Kestrel Notes" in ${path.dirname(target)}.`,
      target,
      canUndo: true
    })
  })

  it('turns file errors into outcome messages', async () => {
    const { ctx } = makeContext({
      fileOps: makeFileOps({
        createFolder: async () => {
          throw new TargetExists('"Notes" already exists in Desktop.')
        }
      })
    })

    const outcome = await new CreateFolderTool().run({ name: 'Notes' }, ctx)

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('"Notes" already exists in Desktop.')
  })

  it('passes errors that are not file errors through', async () => {
    const { ctx } = makeContext({
      fileOps: makeFileOps({
        createFolder: async () => {
          throw new LocationNotFound('gone')
        }
      })
    })

    const outcome = await new CreateFolderTool().run({ name: 'Notes' }, ctx)

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('gone')
  })
})

describe('CreateFileTool', () => {
  it('reports a dry-run creation', async () => {
    const { ctx } = makeContext({ dryRun: true })

    const outcome = await new CreateFileTool().run({ name: 'notes' }, ctx)

    expect(outcome).toEqual({
      status: 'ok',
      action: 'create_file',
      message: 'Created file "notes".'
    })
  })

  it('creates a file and offers undo', async () => {
    const target = path.join(path.sep, 'home', 'Desktop', 'notes.txt')
    const { ctx } = makeContext({
      fileOps: makeFileOps({ createFile: async () => target })
    })

    const outcome = await new CreateFileTool().run({ name: 'notes' }, ctx)

    expect(outcome.message).toBe(
      `Created "notes.txt" in ${path.dirname(target)}.`
    )
    expect(outcome.target).toBe(target)
    expect(outcome.canUndo).toBe(true)
  })

  it('reports an unsafe name', async () => {
    const { ctx } = makeContext({
      fileOps: makeFileOps({
        createFile: async () => {
          throw new UnsafeLocation('"../x" is not a plain name.')
        }
      })
    })

    const outcome = await new CreateFileTool().run({ name: '../x' }, ctx)

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('"../x" is not a plain name.')
  })
})

describe('DeleteFileTool', () => {
  it('asks which file when the query is blank', async () => {
    const { ctx } = makeContext()

    const preparation = await new DeleteFileTool().prepare({}, ctx)

    expect(preparation.outcome).toEqual({
      status: 'unhandled',
      action: 'delete_file',
      message: 'Which file should I delete?'
    })
  })

  it('reports when nothing matches', async () => {
    const { ctx } = makeContext()

    const preparation = await new DeleteFileTool().prepare(
      { query: 'unicorn' },
      ctx
    )

    expect(preparation.outcome?.status).toBe('unhandled')
    expect(preparation.outcome?.message).toBe(
      'I couldn\'t find a file matching "unicorn".'
    )
  })

  it('refuses an ambiguous name and lists the candidates', async () => {
    const { ctx } = makeContext({
      fileSearch: makeFileSearch([
        { name: 'report.pdf', path: 'C:\\files\\report.pdf' },
        { name: 'report.docx', path: 'C:\\files\\report.docx' }
      ])
    })

    const preparation = await new DeleteFileTool().prepare(
      { query: 'report' },
      ctx
    )

    expect(preparation.outcome?.status).toBe('unhandled')
    expect(preparation.outcome?.results).toHaveLength(2)
    expect(preparation.outcome?.message.toLowerCase()).toContain('which one')
  })

  it('resolves exactly one file for confirmation', async () => {
    const { ctx } = makeContext({
      fileSearch: makeFileSearch([
        { name: 'report.pdf', path: 'C:\\files\\report.pdf' }
      ])
    })

    const preparation = await new DeleteFileTool().prepare(
      { query: 'report' },
      ctx
    )

    expect(preparation.arguments).toEqual({ path: 'C:\\files\\report.pdf' })
    expect(preparation.display).toBe('C:\\files\\report.pdf')
    expect(preparation.message).toBe(
      'Delete "report.pdf"? Approval needed.'
    )
  })

  it('reports Windows Search being unavailable', async () => {
    const { ctx } = makeContext({
      fileSearch: {
        search: () => {
          throw new WindowsSearchUnavailable('nope')
        }
      }
    })

    const preparation = await new DeleteFileTool().prepare(
      { query: 'report' },
      ctx
    )

    expect(preparation.outcome?.status).toBe('error')
    expect(preparation.outcome?.message.toLowerCase()).toContain(
      'windows search'
    )
  })

  it('moves a confirmed file to the Recycle Bin', async () => {
    const target = path.join(path.sep, 'home', 'Desktop', 'report.pdf')
    const { ctx } = makeContext({
      fileOps: makeFileOps({ deleteFile: async () => target })
    })

    const outcome = await new DeleteFileTool().run({ path: target }, ctx)

    expect(outcome).toEqual({
      status: 'ok',
      action: 'delete_file',
      message: 'Moved "report.pdf" to the Recycle Bin.',
      target
    })
  })

  it('reports the dry-run message without deleting', async () => {
    const { ctx } = makeContext({ dryRun: true })

    const outcome = await new DeleteFileTool().run({ path: 'C:\\a.txt' }, ctx)

    expect(outcome).toEqual({
      status: 'ok',
      action: 'delete_file',
      message: 'Moved the file to the Recycle Bin.',
      target: 'C:\\a.txt'
    })
  })
})

describe('GetWeatherTool', () => {
  it('uses the injected weather client and exposes the card', async () => {
    const locations: string[] = []
    const { ctx } = makeContext({
      weather: {
        fetch: async (location) => {
          locations.push(location)
          return {
            location: 'London',
            temperature: '20\u00b0C',
            low: '12\u00b0',
            high: '24\u00b0',
            condition: 'Partly Cloudy',
            icon: 'cloud',
            spoken: 'Partly cloudy today.'
          }
        }
      }
    })

    const outcome = await new GetWeatherTool().run({ location: 'London' }, ctx)

    expect(locations).toEqual(['London'])
    expect(outcome.status).toBe('ok')
    expect(outcome.action).toBe('weather')
    expect(outcome.message).toBe(
      'Weather for London: 20\u00b0C, Partly Cloudy.'
    )
    expect(outcome.card).toEqual({
      kind: 'weather',
      location: 'London',
      temperature: '20\u00b0C',
      low: '12\u00b0',
      high: '24\u00b0',
      condition: 'Partly Cloudy',
      icon: 'cloud'
    })
    expect(outcome.spokenResponse).toBe('Partly cloudy today.')
  })

  it('defaults the location during preparation', () => {
    const preparation = new GetWeatherTool().prepare({ location: 'Paris' })

    expect(preparation).toEqual({ arguments: { location: 'Paris' } })
  })
})
