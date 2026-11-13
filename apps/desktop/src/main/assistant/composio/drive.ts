/**
 * Voice-facing Google Drive tools.
 *
 * Composio exposes Google Drive through the `googlesuper` toolkit, a wide
 * surface of raw tool slugs (GOOGLESUPER_FIND_FILE,
 * GOOGLESUPER_CREATE_FILE_FROM_TEXT, GOOGLESUPER_CREATE_PERMISSION, ...).
 * Handing those slugs straight to the language model invites it to guess
 * parameter names and chain calls. These four tools instead present a small,
 * spoken-shaped contract: each one translates a single spoken request into the
 * one or two Composio calls it needs, so the model never sees Composio's raw
 * surface.
 */

import type { Tool, ToolContext, ToolOutcome } from '../types'
import type { CallTool } from './support'
import {
  EMAIL,
  MESSAGE_LIMIT,
  SPOKEN_LIMIT,
  createInvoker,
  dryRun,
  isRecord,
  joinNames,
  objectSchema,
  optionalInteger,
  optionalString,
  specFor,
  stringOf,
  truncate
} from './support'

export { parseComposioResult, readableError } from './support'

export interface DriveFile {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly webViewLink: string | null
  readonly modifiedTime: string | null
  readonly isFolder: boolean
}

export interface DriveToolOptions {
  /** Calls one Composio tool by its exact slug over MCP. */
  callTool: CallTool
}

/** Composio slugs, kept in one place so no raw name leaks into a prompt. */
const SLUG = {
  find: 'GOOGLESUPER_FIND_FILE',
  createFile: 'GOOGLESUPER_CREATE_FILE_FROM_TEXT',
  permission: 'GOOGLESUPER_CREATE_PERMISSION',
  remove: 'GOOGLESUPER_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION'
} as const

const FILE_LIMIT = 50
const SPOKEN_FILE_LIMIT = 5
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_FIELDS = 'files(id,name,mimeType,parents,modifiedTime,webViewLink)'

/** Drive query clauses for the type keywords a person can say. */
const TYPE_CLAUSES: Record<string, string> = {
  folder: `mimeType = '${FOLDER_MIME}'`,
  document: `mimeType = 'application/vnd.google-apps.document'`,
  doc: `mimeType = 'application/vnd.google-apps.document'`,
  spreadsheet: `mimeType = 'application/vnd.google-apps.spreadsheet'`,
  sheet: `mimeType = 'application/vnd.google-apps.spreadsheet'`,
  presentation: `mimeType = 'application/vnd.google-apps.presentation'`,
  slides: `mimeType = 'application/vnd.google-apps.presentation'`,
  pdf: `mimeType = 'application/pdf'`,
  image: `mimeType contains 'image/'`,
  video: `mimeType contains 'video/'`,
  audio: `mimeType contains 'audio/'`,
  text: `mimeType contains 'text/'`
}

// --- pure parsing helpers (exported for tests) -------------------------

function looksLikeFile(item: unknown): boolean {
  if (!isRecord(item)) return false
  if (stringOf(item['id']) === null) return false
  return (
    stringOf(item['name']) !== null || stringOf(item['mimeType']) !== null
  )
}

function toFile(item: Record<string, unknown>): DriveFile {
  const mimeType = stringOf(item['mimeType']) ?? ''
  return {
    id: stringOf(item['id']) ?? '',
    name: stringOf(item['name']) ?? '',
    mimeType,
    webViewLink: stringOf(item['webViewLink']),
    modifiedTime: stringOf(item['modifiedTime']),
    isFolder: mimeType === FOLDER_MIME
  }
}

/**
 * Finds a file array anywhere in the payload, preferring a `files` key. A
 * Drive v3 list response normally arrives as `{ files: [ ... ] }` inside
 * `data`, but a bare array is accepted too.
 */
function findFileArray(
  value: unknown
): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord)
    if (records.length > 0 && records.some(looksLikeFile)) return records
    for (const item of value) {
      const found = findFileArray(item)
      if (found !== null) return found
    }
    return null
  }
  if (isRecord(value)) {
    const files = value['files']
    if (Array.isArray(files)) {
      const records = files.filter(isRecord)
      if (records.length > 0 && records.some(looksLikeFile)) return records
    }
    for (const child of Object.values(value)) {
      const found = findFileArray(child)
      if (found !== null) return found
    }
  }
  return null
}

/** Pulls the file list out of whatever shape Composio returned. */
export function extractFiles(data: unknown): DriveFile[] {
  const found = findFileArray(data)
  if (found === null) return []
  const files: DriveFile[] = []
  for (const item of found) {
    if (!looksLikeFile(item)) continue
    files.push(toFile(item))
    if (files.length >= FILE_LIMIT) break
  }
  return files
}

/**
 * Pure. Picks the one file a spoken name refers to, or explains why it cannot:
 * an exact name wins, then a name containing the whole query, then a name
 * containing every word of the query.
 */
export function matchFiles(
  query: string,
  files: readonly DriveFile[]
):
  | { ok: true; file: DriveFile }
  | {
      ok: false
      reason: 'not_found' | 'ambiguous'
      candidates: DriveFile[]
    } {
  const trimmed = query.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'not_found', candidates: [] }
  }
  const lower = trimmed.toLowerCase()

  const exact = files.filter((file) => file.name.toLowerCase() === lower)
  if (exact.length === 1) return { ok: true, file: exact[0] }

  const containing = files.filter((file) =>
    file.name.toLowerCase().includes(lower)
  )
  if (containing.length === 1) return { ok: true, file: containing[0] }

  const tokens = lower.split(/\s+/).filter(Boolean)
  const everyToken = files.filter((file) => {
    const name = file.name.toLowerCase()
    return tokens.every((token) => name.includes(token))
  })
  if (everyToken.length === 1) return { ok: true, file: everyToken[0] }

  const candidates =
    exact.length > 1 ? exact : containing.length > 1 ? containing : everyToken
  if (candidates.length === 0) {
    return { ok: false, reason: 'not_found', candidates: [] }
  }
  return { ok: false, reason: 'ambiguous', candidates }
}

// --- query building ----------------------------------------------------

/** Drive escapes apostrophes in values, so the raw text is interpolated. */
function nameClause(query: string): string {
  return `name contains '${query}'`
}

function typeClause(type: string | null): string | null {
  if (type === null) return null
  return TYPE_CLAUSES[type.toLowerCase().trim()] ?? null
}

function mimeFor(format: string | null): string {
  const key = (format ?? 'text').toLowerCase().trim()
  if (key === 'document' || key === 'doc') {
    return 'application/vnd.google-apps.document'
  }
  if (key === 'markdown' || key === 'md') return 'text/markdown'
  return 'text/plain'
}

function roleFor(role: string | null): { role: string; label: string } {
  const key = (role ?? '').toLowerCase().trim()
  if (key === 'view' || key === 'viewer' || key === 'read' || key === 'reader') {
    return { role: 'reader', label: 'viewer' }
  }
  if (key === 'comment' || key === 'commenter') {
    return { role: 'commenter', label: 'commenter' }
  }
  if (
    key === 'edit' ||
    key === 'editor' ||
    key === 'write' ||
    key === 'writer'
  ) {
    return { role: 'writer', label: 'editor' }
  }
  return { role: 'reader', label: 'viewer' }
}

// --- tool schemas ------------------------------------------------------

const FIND_DESCRIPTION =
  'Search Google Drive by file name, content, type, or folder name.'

const CREATE_FILE_DESCRIPTION =
  'Create a new text file or document in Google Drive from given content.'

const SHARE_DESCRIPTION =
  'Share a Google Drive file with someone by email and access level.'

const DELETE_DESCRIPTION =
  'Permanently delete a file or folder from Google Drive; deleting a folder ' +
  'takes its contents.'

export function createDriveTools(options: DriveToolOptions): Tool[] {
  const callTool = options.callTool
  const invoke = createInvoker(
    callTool,
    'Google Drive returned an error.',
    'Google Drive'
  )

  function findRaw(
    q: string,
    action: string
  ): Promise<
    { ok: true; files: DriveFile[] } | { ok: false; outcome: ToolOutcome }
  > {
    return invoke(
      SLUG.find,
      {
        q,
        pageSize: 25,
        fields: DRIVE_FIELDS,
        orderBy: 'modifiedTime desc',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      },
      action
    ).then((found) => {
      if (!found.ok) return { ok: false as const, outcome: found.outcome }
      return { ok: true as const, files: extractFiles(found.data) }
    })
  }

  async function resolveFile(
    query: string,
    action: string,
    ctx: ToolContext
  ): Promise<
    { ok: true; file: DriveFile } | { ok: false; outcome: ToolOutcome }
  > {
    // `ctx` is accepted for symmetry with the other resolvers even though a
    // Drive name lookup needs nothing from the tool context.
    void ctx
    const searched = await findRaw(
      `trashed = false and ${nameClause(query)}`,
      action
    )
    if (!searched.ok) return searched

    const matched = matchFiles(query, searched.files)
    if (matched.ok) return { ok: true, file: matched.file }

    const message =
      matched.reason === 'not_found'
        ? `I couldn't find a file matching "${query}" in Google Drive.`
        : `More than one file matches "${query}": ${joinNames(
            matched.candidates.slice(0, 3).map((file) => file.name)
          )}. Say which one.`
    return {
      ok: false,
      outcome: { status: 'error', action, message, spokenResponse: message }
    }
  }

  async function resolveFolder(
    name: string,
    action: string
  ): Promise<
    { ok: true; id: string | null } | { ok: false; outcome: ToolOutcome }
  > {
    if (name.trim() === '') return { ok: true, id: null }

    const searched = await findRaw(
      `trashed = false and mimeType = '${FOLDER_MIME}' and ${nameClause(name)}`,
      action
    )
    if (!searched.ok) return searched

    const matched = matchFiles(name, searched.files)
    if (matched.ok) return { ok: true, id: matched.file.id }

    const message =
      matched.reason === 'not_found'
        ? `I couldn't find a folder called "${name}".`
        : `More than one folder matches "${name}": ${joinNames(
            matched.candidates.slice(0, 3).map((file) => file.name)
          )}. Say which one.`
    return {
      ok: false,
      outcome: { status: 'error', action, message, spokenResponse: message }
    }
  }

  function summarizeFiles(
    files: readonly DriveFile[],
    action: string,
    query: string,
    type: string | null
  ): ToolOutcome {
    if (files.length === 0) {
      const message =
        query.trim() === ''
          ? 'Google Drive is empty.'
          : `I couldn't find anything matching "${query}" in Google Drive.`
      return { status: 'ok', action, message, spokenResponse: message }
    }

    const count = files.length
    const noun = count === 1 ? 'file' : 'files'
    const listed = joinNames(
      files.slice(0, SPOKEN_FILE_LIMIT).map((file) => file.name)
    )
    const more =
      count > SPOKEN_FILE_LIMIT ? `, and ${count - SPOKEN_FILE_LIMIT} more` : ''
    const typeWord = type !== null && type.trim() !== '' ? ` ${type.trim()}` : ''
    const text = `I found ${count}${typeWord} ${noun}: ${listed}${more}.`
    return {
      status: 'ok',
      action,
      message: truncate(text, MESSAGE_LIMIT),
      spokenResponse: truncate(text, SPOKEN_LIMIT)
    }
  }

  const findFiles: Tool = {
    spec: specFor(
      'drive_find_files',
      FIND_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description:
              'What to look for, as the user named it. Leave empty to list recent files.'
          },
          type: {
            type: 'string',
            description: 'File kind to filter on: pdf, document, sheet, slides, image, video, folder.'
          },
          folder: {
            type: 'string',
            description: 'Name of a folder to search inside.'
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of files to return. Defaults to 10.'
          }
        },
        []
      ),
      'read',
      false,
      'search Google Drive'
    ),
    async run(args, ctx) {
      const action = 'search Google Drive'
      const skipped = dryRun(ctx, action, 'drive_find_files')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query') ?? ''
      const type = optionalString(args, 'type')
      const folder = optionalString(args, 'folder')

      const clauses = ['trashed = false']
      if (query.trim() !== '') clauses.push(nameClause(query))
      const clause = typeClause(type)
      if (clause !== null) clauses.push(clause)
      if (folder !== null) {
        const resolved = await resolveFolder(folder, action)
        if (!resolved.ok) return resolved.outcome
        if (resolved.id !== null) clauses.push(`'${resolved.id}' in parents`)
      }

      const requested = optionalInteger(args, 'max_results') ?? 10
      const pageSize = Math.min(50, Math.max(1, Math.trunc(requested)))

      const found = await invoke(
        SLUG.find,
        {
          q: clauses.join(' and '),
          pageSize,
          fields: DRIVE_FIELDS,
          orderBy: 'modifiedTime desc',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true
        },
        action
      )
      if (!found.ok) return found.outcome
      return summarizeFiles(extractFiles(found.data), action, query, type)
    }
  }

  const createFile: Tool = {
    spec: specFor(
      'drive_create_file',
      CREATE_FILE_DESCRIPTION,
      objectSchema(
        {
          name: { type: 'string', description: 'The file name.' },
          content: { type: 'string', description: 'The full body of the file.' },
          folder: {
            type: 'string',
            description: 'Folder name to create it in.'
          },
          format: {
            type: 'string',
            description: "One of text, markdown, or document. Defaults to text."
          }
        },
        ['name', 'content']
      ),
      'write',
      true,
      'create a Google Drive file'
    ),
    async run(args, ctx) {
      const action = 'create a Google Drive file'
      const skipped = dryRun(ctx, action, 'drive_create_file')
      if (skipped !== null) return skipped

      const name = optionalString(args, 'name') ?? ''
      const content = optionalString(args, 'content') ?? ''
      if (name.trim() === '' || content.trim() === '') {
        const message = 'I need a file name and some content to create that.'
        return { status: 'error', action, message, spokenResponse: message }
      }

      const folder = optionalString(args, 'folder')
      let parentId: string | null = null
      if (folder !== null) {
        const resolved = await resolveFolder(folder, action)
        if (!resolved.ok) return resolved.outcome
        parentId = resolved.id
      }

      const callArgs: Record<string, unknown> = {
        file_name: name,
        text_content: content,
        mime_type: mimeFor(optionalString(args, 'format'))
      }
      if (parentId !== null) callArgs['parent_id'] = parentId

      const created = await invoke(SLUG.createFile, callArgs, action)
      if (!created.ok) return created.outcome

      const message =
        folder !== null && parentId !== null
          ? `Created "${name}" in Google Drive inside "${folder}".`
          : `Created "${name}" in Google Drive.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const shareFile: Tool = {
    spec: specFor(
      'drive_share_file',
      SHARE_DESCRIPTION,
      objectSchema(
        {
          file: {
            type: 'string',
            description: 'The file as the user named it.'
          },
          email: {
            type: 'string',
            description: 'Email address to share with.'
          },
          role: {
            type: 'string',
            description:
              'Access level: viewer, commenter, or editor. Defaults to viewer.'
          },
          message: {
            type: 'string',
            description: 'Optional note to include in the email.'
          }
        },
        ['file', 'email']
      ),
      'write',
      true,
      'share a Google Drive file'
    ),
    async run(args, ctx) {
      const action = 'share a Google Drive file'
      const skipped = dryRun(ctx, action, 'drive_share_file')
      if (skipped !== null) return skipped

      const file = optionalString(args, 'file') ?? ''
      const email = optionalString(args, 'email') ?? ''
      if (!EMAIL.test(email)) {
        const message = 'I need an email address to share that with.'
        return { status: 'error', action, message, spokenResponse: message }
      }

      const located = await resolveFile(file, action, ctx)
      if (!located.ok) return located.outcome

      const access = roleFor(optionalString(args, 'role'))
      const callArgs: Record<string, unknown> = {
        file_id: located.file.id,
        type: 'user',
        role: access.role,
        email_address: email,
        send_notification_email: true
      }
      const note = optionalString(args, 'message')
      if (note !== null) callArgs['email_message'] = note

      const shared = await invoke(SLUG.permission, callArgs, action)
      if (!shared.ok) return shared.outcome

      const message = `Shared "${located.file.name}" with ${email} as a ${access.label}.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const deleteFile: Tool = {
    spec: specFor(
      'drive_delete_file',
      DELETE_DESCRIPTION,
      objectSchema(
        {
          file: {
            type: 'string',
            description: 'The file or folder as the user named it.'
          }
        },
        ['file']
      ),
      'write',
      true,
      'delete a Google Drive file'
    ),
    async run(args, ctx) {
      const action = 'delete a Google Drive file'
      const skipped = dryRun(ctx, action, 'drive_delete_file')
      if (skipped !== null) return skipped

      const file = optionalString(args, 'file') ?? ''
      const located = await resolveFile(file, action, ctx)
      if (!located.ok) return located.outcome

      const removed = await invoke(
        SLUG.remove,
        { fileId: located.file.id, supportsAllDrives: true },
        action
      )
      if (!removed.ok) return removed.outcome

      const message = `Deleted "${located.file.name}" from Google Drive. This can't be undone.`
      const spoken = `Deleted "${located.file.name}" from Google Drive.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(spoken, SPOKEN_LIMIT)
      }
    }
  }

  return [findFiles, createFile, shareFile, deleteFile]
}
