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
import type { NotchDriveCard, NotchDriveFormat } from '../../../shared/types'
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

/** Names a person uses for the top of Drive rather than a real subfolder. */
const ROOT_FOLDER_NAMES = new Set([
  'drive',
  'google drive',
  'my drive',
  'my google drive',
  'my drive root',
  'root',
  'the root',
  'top level',
  'top-level'
])

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

/**
 * Pure. Turns "in my Google Drive" into the Drive root, and "My Drive/Docs"
 * into the real folder "Docs". A folder name that is a root alias never
 * reaches a Drive search, because no file is named "My Drive".
 */
export function folderTarget(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim().replace(/^["']+|["']+$/g, '').replace(/[.!?]+$/, '').trim()
  if (trimmed === '') return null

  const bare = trimmed.toLowerCase().replace(/\s+/g, ' ')
  if (ROOT_FOLDER_NAMES.has(bare)) return null

  const nested =
    /^(?:my\s+google\s+drive|google\s+drive|my\s+drive|drive)\s*[\\/>]+\s*(?<folder>.+)$/i.exec(
      trimmed
    )
  if (nested !== null) {
    const folder = nested.groups?.folder?.trim() ?? ''
    return folder === '' ? null : folder
  }
  return trimmed
}

/** Reads a file type out of natural speech, e.g. "Google Sheets" or "md". */
function formatFromText(text: string): string | null {
  const said = text
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (/\b(?:markdown|md)\b/.test(said)) return 'markdown'
  if (
    /\b(?:google\s+sheets?|spreadsheets?|sheets?|gsheets?|excel|xlsx?|csv)\b/.test(
      said
    )
  ) {
    return 'spreadsheet'
  }
  if (
    /\b(?:google\s+slides?|presentations?|slides?|pptx?|powerpoint)\b/.test(said)
  ) {
    return 'presentation'
  }
  if (/\b(?:google\s+docs?|gdocs?|documents?|docs?|docx?|word)\b/.test(said)) {
    return 'document'
  }
  if (/\b(?:text\s+files?|plain\s+text|txt|text)\b/.test(said)) return 'text'
  return null
}

/** Reads a file type from a name's extension, e.g. "notes.md". */
function formatFromName(name: string): string | null {
  const lower = name.trim().toLowerCase()
  if (/\.(?:md|markdown)$/.test(lower)) return 'markdown'
  if (/\.(?:txt|text)$/.test(lower)) return 'text'
  if (/\.(?:docx?|gdoc)$/.test(lower)) return 'document'
  if (/\.(?:xlsx?|csv|gsheet)$/.test(lower)) return 'spreadsheet'
  if (/\.(?:pptx?|gslides)$/.test(lower)) return 'presentation'
  return null
}

/**
 * Canonical format word for what the user asked to create.
 *
 * The user's own words win over the planner's `format` argument: a small model
 * sometimes labels a "Google Docs" request as plain text. A file extension in
 * the name is the most explicit signal and wins over everything else.
 */
export function resolveFormat(
  format: string | null,
  transcript?: string,
  name?: string
): string {
  return (
    formatFromName(name ?? '') ??
    formatFromText(transcript ?? '') ??
    formatFromText(format ?? '') ??
    'text'
  )
}

/** The human name for a canonical format. */
function formatLabel(format: string): string {
  if (format === 'document') return 'Google Doc'
  if (format === 'spreadsheet') return 'Google Sheet'
  if (format === 'presentation') return 'Google Slides presentation'
  if (format === 'markdown') return 'Markdown file'
  return 'text file'
}

function mimeFor(format: string | null): string {
  const key = (format ?? 'text').toLowerCase().trim()
  if (key === 'document' || key === 'doc') {
    return 'application/vnd.google-apps.document'
  }
  if (key === 'spreadsheet' || key === 'sheet') {
    return 'application/vnd.google-apps.spreadsheet'
  }
  if (key === 'presentation' || key === 'slides') {
    return 'application/vnd.google-apps.presentation'
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
  'Create a Google Doc, Sheet, Slides presentation, Markdown, or text file in ' +
  'Drive. Content is optional; a blank file is fine.'

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
    // "My Drive" and friends are how people name the root, not a real folder.
    const target = folderTarget(name)
    if (target === null) return { ok: true, id: null }

    const searched = await findRaw(
      `trashed = false and mimeType = '${FOLDER_MIME}' and ${nameClause(target)}`,
      action
    )
    if (!searched.ok) return searched

    const matched = matchFiles(target, searched.files)
    if (matched.ok) return { ok: true, id: matched.file.id }

    const message =
      matched.reason === 'not_found'
        ? `I couldn't find a folder called "${target}".`
        : `More than one folder matches "${target}": ${joinNames(
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
          name: {
            type: 'string',
            description: 'The file name. Do not include a folder path.'
          },
          content: {
            type: 'string',
            description: 'The body text. Leave empty to create a blank file.'
          },
          folder: {
            type: 'string',
            description: 'Subfolder name to create it in. Omit for My Drive.'
          },
          format: {
            type: 'string',
            description:
              'One of document, spreadsheet, presentation, markdown, or text. Defaults to text.'
          }
        },
        ['name']
      ),
      'write',
      true,
      'create a Google Drive file'
    ),
    async prepare(args, ctx) {
      const action = 'create a Google Drive file'
      const name = (optionalString(args, 'name') ?? '').trim()
      if (name === '') {
        const message = 'I need a name for the file.'
        return {
          arguments: args,
          outcome: { status: 'error', action, message, spokenResponse: message }
        }
      }

      const content = optionalString(args, 'content') ?? ''
      const format = resolveFormat(
        optionalString(args, 'format'),
        ctx.transcript,
        name
      )
      const folder = folderTarget(optionalString(args, 'folder'))

      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: format as NotchDriveFormat,
        name,
        content,
        folder
      }

      // A dry run must not touch Drive; `run` reports what would happen.
      if (ctx.dryRun) {
        return {
          arguments: { name, content, format },
          display: name,
          card: card as unknown as Record<string, unknown>
        }
      }

      let parentId: string | null = null
      if (folder !== null) {
        const resolved = await resolveFolder(folder, action)
        if (!resolved.ok) return { arguments: args, outcome: resolved.outcome }
        parentId = resolved.id
      }

      const prepared: Record<string, unknown> = { name, content, format }
      if (parentId !== null) prepared['parent_id'] = parentId

      const message =
        parentId !== null
          ? `Create "${name}" in Google Drive inside "${folder}"?`
          : `Create "${name}" in Google Drive?`
      return {
        arguments: prepared,
        display: name,
        message,
        card: card as unknown as Record<string, unknown>
      }
    },
    async run(args, ctx) {
      const action = 'create a Google Drive file'
      const skipped = dryRun(ctx, action, 'drive_create_file')
      if (skipped !== null) return skipped

      const name = (optionalString(args, 'name') ?? '').trim()
      if (name === '') {
        const message = 'I need a name for the file.'
        return { status: 'error', action, message, spokenResponse: message }
      }

      // Content is optional: "create a doc named X" means a blank document.
      const content = optionalString(args, 'content') ?? ''
      const format = resolveFormat(
        optionalString(args, 'format'),
        ctx.transcript,
        name
      )
      const folder = folderTarget(optionalString(args, 'folder'))

      // `prepare` already resolved the folder; only search when it did not.
      let parentId = optionalString(args, 'parent_id')
      if (parentId === null && folder !== null) {
        const resolved = await resolveFolder(folder, action)
        if (!resolved.ok) return resolved.outcome
        parentId = resolved.id
      }

      const callArgs: Record<string, unknown> = {
        file_name: name,
        text_content: content,
        mime_type: mimeFor(format)
      }
      if (parentId !== null) callArgs['parent_id'] = parentId

      const created = await invoke(SLUG.createFile, callArgs, action)
      if (!created.ok) return created.outcome

      const where =
        parentId !== null && folder !== null ? ` inside "${folder}"` : ''
      const message =
        content.trim() === ''
          ? `Created a blank ${formatLabel(format)} named "${name}" in Google Drive${where}.`
          : `Created "${name}" in Google Drive${where}.`
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
