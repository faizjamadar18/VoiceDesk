/**
 * Tool registry and built-in tools for Kestrel.
 *
 * A *tool* is a small, named capability with a JSON-Schema signature that a
 * model can call. The registry is the single source of truth for what Kestrel
 * can do, and it produces Google-style function declarations for the planner.
 */

import path from 'node:path'
import { ActionExecutionError } from './actions'
import { appLabel } from './app-catalog'
import {
  FileNotFoundError,
  InvalidNameError,
  LocationNotFound,
  TargetExists,
  UnsafeLocation
} from './files'
import { ToolRegistry } from './registry'
import type {
  JsonSchema,
  Tool,
  ToolContext,
  ToolOutcome,
  ToolPreparation,
  ToolSpec
} from './types'
import { weatherToCard } from './weather'
import { WindowsSearchUnavailable } from './windows-search'

function objectSchema(
  properties: Record<string, unknown>,
  required: string[]
): JsonSchema {
  return {
    type: 'object',
    properties,
    required
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function searchFilesError(error: unknown): ToolOutcome | null {
  if (error instanceof WindowsSearchUnavailable) {
    return {
      status: 'error',
      action: 'search_files',
      message:
        "I couldn't search your files because Windows Search " +
        'is not available on this PC.'
    }
  }
  return null
}

export class OpenAppTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'open_app',
    description:
      "Open any application installed on the user's Windows PC, " +
      'including Start menu, Microsoft Store, and desktop apps. Use the ' +
      "name people say, such as 'Notion', 'WhatsApp', 'Visual Studio " +
      "Code', or 'Calculator'. Do not use for websites, files, or " +
      'folders.',
    parameters: objectSchema(
      {
        app: {
          type: 'string',
          description: "The installed application's common name."
        }
      },
      ['app']
    ),
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'open_app'
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const app = String(arguments_['app']).trim()
    if (!ctx.dryRun) {
      try {
        await ctx.executor.openApp(app)
      } catch (error) {
        if (error instanceof ActionExecutionError) {
          return {
            status: 'error',
            action: 'open_app',
            message: error.message,
            target: app
          }
        }
        throw error
      }
    }
    return {
      status: 'ok',
      action: 'open_app',
      message: `Opening ${appLabel(app)}.`,
      target: app
    }
  }
}

export class WebSearchTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'web_search',
    description: "Search the web using the user's default browser.",
    parameters: objectSchema(
      { query: { type: 'string', description: 'The search query.' } },
      ['query']
    ),
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'browser'
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const query = String(arguments_['query'])
    const url = `https://www.google.com/search?q=${quotePlus(query)}`
    if (!ctx.dryRun) {
      await ctx.executor.openUrl(url)
    }
    return {
      status: 'ok',
      action: 'browser',
      message: `Searching the web for ${query}.`,
      url
    }
  }
}

export class TypeTextTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'type_text',
    description: 'Type text into the app the user is currently focused on.',
    parameters: objectSchema(
      { text: { type: 'string', description: 'The text to type.' } },
      ['text']
    ),
    risk: 'write',
    requiresConfirmation: false,
    actionLabel: 'type'
  }

  run(arguments_: Record<string, unknown>, _ctx: ToolContext): ToolOutcome {
    return {
      status: 'ok',
      action: 'type',
      message: 'Typing that into the focused app.',
      text: String(arguments_['text'])
    }
  }
}

export class CurrentTimeTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'current_time',
    description: 'Tell the user the current local time.',
    parameters: objectSchema({}, []),
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'answer'
  }

  run(_arguments: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
    const now = ctx.clock()
    return {
      status: 'ok',
      action: 'answer',
      message: `It's ${pad2(now.getHours())}:${pad2(now.getMinutes())}.`
    }
  }
}

export class CurrentDateTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'current_date',
    description: "Tell the user today's local date.",
    parameters: objectSchema({}, []),
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'answer'
  }

  run(_arguments: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
    const now = ctx.clock()
    const year = now.getFullYear().toString().padStart(4, '0')
    return {
      status: 'ok',
      action: 'answer',
      message: `Today is ${year}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.`
    }
  }
}

export class SearchFilesTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'search_files',
    description:
      "Search the user's local files by file name or folder path. " +
      'Read only.',
    parameters: objectSchema(
      {
        query: {
          type: 'string',
          description: 'Words to match in a file or folder name.'
        }
      },
      ['query']
    ),
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'search_files'
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const query = String(arguments_['query'])
    let found: Array<Record<string, unknown>>
    try {
      found = await ctx.fileSearch.search(query)
    } catch (error) {
      const failure = searchFilesError(error)
      if (failure !== null) {
        return failure
      }
      throw error
    }
    const results = found.map((item) => ({
      name: item['name'],
      path: item['path'],
      sizeBytes: item['sizeBytes'],
      modified: item['modified']
    }))
    return {
      status: 'ok',
      action: 'search_files',
      message: `I found ${results.length} file(s) matching "${query}".`,
      results
    }
  }
}

export class CreateFolderTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'create_folder',
    description:
      'Create one new folder where the user says, or on the Desktop. ' +
      'Fails if the folder already exists.',
    parameters: objectSchema(
      {
        name: { type: 'string', description: 'The new folder name.' },
        location: {
          type: 'string',
          description:
            "Where to create it, e.g. 'Desktop', 'Downloads', " +
            "'in my Documents'. Defaults to the Desktop."
        }
      },
      ['name']
    ),
    risk: 'write',
    requiresConfirmation: false,
    undo: 'remove_created',
    actionLabel: 'create_folder'
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const name = arguments_['name']
    const location = arguments_['location']
    if (ctx.dryRun) {
      return {
        status: 'ok',
        action: 'create_folder',
        message: `Created folder "${String(name)}".`
      }
    }
    let target: string
    try {
      target = await ctx.fileOps.createFolder(
        String(name),
        location === null || location === undefined ? null : String(location)
      )
    } catch (error) {
      if (isFileWriteError(error)) {
        return {
          status: 'error',
          action: 'create_folder',
          message: errorMessage(error)
        }
      }
      throw error
    }
    return {
      status: 'ok',
      action: 'create_folder',
      message: `Created "${path.basename(target)}" in ${path.dirname(target)}.`,
      target,
      canUndo: true
    }
  }
}

export class CreateFileTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'create_file',
    description:
      'Create one new, empty file where the user says, or on the ' +
      'Desktop. Fails if the file already exists.',
    parameters: objectSchema(
      {
        name: {
          type: 'string',
          description: "The new file name, e.g. 'notes.txt'."
        },
        location: {
          type: 'string',
          description:
            "Where to create it, e.g. 'Desktop', 'Downloads', " +
            "'in my Documents'. Defaults to the Desktop."
        }
      },
      ['name']
    ),
    risk: 'write',
    requiresConfirmation: false,
    undo: 'remove_created',
    actionLabel: 'create_file'
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const name = arguments_['name']
    const location = arguments_['location']
    if (ctx.dryRun) {
      return {
        status: 'ok',
        action: 'create_file',
        message: `Created file "${String(name)}".`
      }
    }
    let target: string
    try {
      target = await ctx.fileOps.createFile(
        String(name),
        location === null || location === undefined ? null : String(location)
      )
    } catch (error) {
      if (isFileWriteError(error)) {
        return {
          status: 'error',
          action: 'create_file',
          message: errorMessage(error)
        }
      }
      throw error
    }
    return {
      status: 'ok',
      action: 'create_file',
      message: `Created "${path.basename(target)}" in ${path.dirname(target)}.`,
      target,
      canUndo: true
    }
  }
}

export class DeleteFileTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'delete_file',
    description:
      'Move one file the user names to the Windows Recycle Bin. Never ' +
      'deletes permanently. Always asks for approval first.',
    parameters: objectSchema(
      {
        query: {
          type: 'string',
          description: 'Words from the name of the file to delete.'
        }
      },
      ['query']
    ),
    risk: 'write',
    requiresConfirmation: true,
    actionLabel: 'delete_file'
  }

  async prepare(
    arguments_: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolPreparation> {
    const rawQuery = arguments_['query']
    const query = (rawQuery === undefined ? '' : String(rawQuery)).trim()
    if (!query) {
      return {
        arguments: arguments_,
        outcome: {
          status: 'unhandled',
          action: 'delete_file',
          message: 'Which file should I delete?'
        }
      }
    }

    let found: Array<Record<string, unknown>>
    try {
      found = await ctx.fileSearch.search(query)
    } catch (error) {
      if (error instanceof WindowsSearchUnavailable) {
        return {
          arguments: arguments_,
          outcome: {
            status: 'error',
            action: 'delete_file',
            message:
              "I can't search your files because Windows Search is " +
              'not available on this PC.'
          }
        }
      }
      throw error
    }

    const existing: Array<Record<string, unknown>> = []
    for (const item of found) {
      let resolved: string
      try {
        resolved = await ctx.fileOps.resolveDeleteTarget(
          String(item['path'] ?? '')
        )
      } catch (error) {
        if (
          error instanceof UnsafeLocation ||
          error instanceof FileNotFoundError
        ) {
          continue
        }
        throw error
      }
      existing.push({
        name: item['name'] || path.basename(resolved),
        path: resolved,
        sizeBytes: item['sizeBytes'],
        modified: item['modified'] || ''
      })
    }

    if (existing.length === 0) {
      return {
        arguments: arguments_,
        outcome: {
          status: 'unhandled',
          action: 'delete_file',
          message: `I couldn't find a file matching "${query}".`
        }
      }
    }

    if (existing.length > 1) {
      return {
        arguments: arguments_,
        outcome: {
          status: 'unhandled',
          action: 'delete_file',
          message:
            `I found ${existing.length} files matching "${query}". ` +
            'Which one do you mean?',
          results: existing
        }
      }
    }

    const only = existing[0]
    return {
      arguments: { path: only['path'] },
      display: String(only['path']),
      message: `Delete "${String(only['name'])}"? Approval needed.`
    }
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const target = arguments_['path']
    if (ctx.dryRun) {
      return {
        status: 'ok',
        action: 'delete_file',
        message: 'Moved the file to the Recycle Bin.',
        target: String(target)
      }
    }

    let removed: string
    try {
      removed = await ctx.fileOps.deleteFile(String(target))
    } catch (error) {
      if (
        error instanceof UnsafeLocation ||
        error instanceof FileNotFoundError
      ) {
        return {
          status: 'error',
          action: 'delete_file',
          message: errorMessage(error)
        }
      }
      throw error
    }
    return {
      status: 'ok',
      action: 'delete_file',
      message: `Moved "${path.basename(removed)}" to the Recycle Bin.`,
      target: removed
    }
  }
}

export class GetWeatherTool implements Tool {
  readonly spec: ToolSpec = {
    name: 'get_weather',
    description:
      'Check real-time weather and forecast for any city, country, or location.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description:
            "City, state, or country name (e.g. 'India', 'San Francisco', 'London')."
        }
      },
      required: ['location']
    },
    risk: 'read',
    requiresConfirmation: false,
    actionLabel: 'Weather'
  }

  prepare(arguments_: Record<string, unknown>): ToolPreparation {
    return { arguments: arguments_ }
  }

  async run(arguments_: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const location = arguments_['location'] ?? 'Current Location'
    const weather = await ctx.weather.fetch(String(location))
    return {
      status: 'ok',
      action: 'weather',
      message: `Weather for ${weather.location}: ${weather.temperature}, ${weather.condition}.`,
      card: weatherToCard(weather),
      spokenResponse: weather.spoken
    }
  }
}

function isFileWriteError(error: unknown): boolean {
  return (
    error instanceof UnsafeLocation ||
    error instanceof LocationNotFound ||
    error instanceof TargetExists ||
    error instanceof InvalidNameError
  )
}

function quotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/%20/g, '+')
}

export function builtinTools(): Tool[] {
  return [
    new OpenAppTool(),
    new WebSearchTool(),
    new TypeTextTool(),
    new CurrentTimeTool(),
    new CurrentDateTool(),
    new SearchFilesTool(),
    new CreateFolderTool(),
    new CreateFileTool(),
    new DeleteFileTool(),
    new GetWeatherTool()
  ]
}

export function builtinToolNames(): ReadonlySet<string> {
  return new Set(builtinTools().map((tool) => tool.spec.name))
}

export function buildDefaultRegistry(_fileOps?: unknown): ToolRegistry {
  const registry = new ToolRegistry()
  for (const tool of builtinTools()) {
    registry.register(tool)
  }
  return registry
}
