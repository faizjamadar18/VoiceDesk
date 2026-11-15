/**
 * Voice-facing Notion tools.
 *
 * Composio exposes Notion through the `notion` toolkit, a wide surface of raw
 * tool slugs (NOTION_SEARCH_NOTION_PAGE, NOTION_FETCH_BLOCK_CONTENTS,
 * NOTION_QUERY_DATABASE, NOTION_APPEND_TEXT_BLOCKS, ...). Handing those slugs
 * straight to the language model invites it to guess parameter names and chain
 * calls. These four tools instead present a small, spoken-shaped contract: each
 * one translates a single spoken request into the one or two Composio calls it
 * needs, so the model never sees Composio's raw surface.
 */

import type { Tool, ToolOutcome, ToolPreparation } from '../types'
import type { NotchNotionCard } from '../../../shared/types'
import type { CallTool, InvokeResult } from './support'
import {
  MESSAGE_LIMIT,
  SPOKEN_LIMIT,
  createInvoker,
  dryRun,
  isRecord,
  objectSchema,
  optionalInteger,
  optionalString,
  specFor,
  stringOf,
  truncate
} from './support'

export interface NotionItem {
  readonly id: string
  readonly title: string
  readonly type: 'page' | 'database'
}

/** The Notion object kinds a spoken name can point at. */
export type NotionKind = 'page' | 'database'

export interface NotionToolOptions {
  /** Calls one Composio tool by its exact slug over MCP. */
  callTool: CallTool
}

/** Composio slugs, kept in one place so no raw name leaks into a prompt. */
const SLUG = {
  search: 'NOTION_SEARCH_NOTION_PAGE',
  blocks: 'NOTION_FETCH_BLOCK_CONTENTS',
  query: 'NOTION_QUERY_DATABASE',
  create: 'NOTION_CREATE_NOTION_PAGE'
} as const

const RESULT_LIMIT = 25
const SPOKEN_RESULT_LIMIT = 5
const BLOCK_PAGE_SIZE = 100
const ROW_PROPERTY_LIMIT = 3

const UUID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/** The id itself when `value` is already a Notion id, otherwise `null`. */
export function notionId(value: string): string | null {
  const trimmed = value.trim()
  return UUID.test(trimmed) ? trimmed : null
}

// --- pure parsing helpers (exported for tests) -------------------------

/**
 * Finds the item array anywhere in the payload, preferring a `results` key. A
 * Notion search or query response normally arrives as `{ results: [ ... ] }`
 * inside `data`, but a bare array is accepted too.
 */
function findItemArray(value: unknown): unknown[] | null {
  if (isRecord(value)) {
    const results = value['results']
    if (Array.isArray(results)) return results
  }
  if (Array.isArray(value)) return value
  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      const found = findItemArray(child)
      if (found !== null) return found
    }
  }
  return null
}

/** The first non-empty `plain_text` in a rich-text array. */
function firstPlainText(rich: unknown): string | null {
  if (!Array.isArray(rich)) return null
  for (const entry of rich) {
    if (!isRecord(entry)) continue
    const text = stringOf(entry['plain_text'])
    if (text !== null) return text
  }
  return null
}

/** Every `plain_text` in a rich-text array, joined as Notion renders it. */
function joinedPlainText(rich: unknown): string | null {
  if (!Array.isArray(rich)) return null
  const parts: string[] = []
  for (const entry of rich) {
    if (!isRecord(entry)) continue
    const text = stringOf(entry['plain_text'])
    if (text !== null) parts.push(text)
  }
  return parts.length === 0 ? null : parts.join('')
}

/** The best title a Notion page or database payload offers. */
function titleOf(item: Record<string, unknown>): string {
  const direct = stringOf(item['title'])
  if (direct !== null) return direct

  const properties = item['properties']
  if (isRecord(properties)) {
    const titleProperty = properties['title']
    if (isRecord(titleProperty)) {
      const fromTitleProperty = firstPlainText(titleProperty['title'])
      if (fromTitleProperty !== null) return fromTitleProperty
    }
  }

  const fromTitleArray = firstPlainText(item['title'])
  if (fromTitleArray !== null) return fromTitleArray

  if (isRecord(properties)) {
    for (const value of Object.values(properties)) {
      if (!isRecord(value)) continue
      const fromProperty = firstPlainText(value['title'])
      if (fromProperty !== null) return fromProperty
    }
  }

  return '(untitled)'
}

/** Pulls the page and database list out of whatever shape Composio returned. */
export function extractItems(data: unknown): NotionItem[] {
  const found = findItemArray(data) ?? []
  const items: NotionItem[] = []
  for (const entry of found) {
    if (!isRecord(entry)) continue
    const id = stringOf(entry['id'])
    if (id === null) continue
    items.push({
      id,
      title: titleOf(entry),
      type: entry['object'] === 'database' ? 'database' : 'page'
    })
  }
  return items
}

/** Flattens a page's blocks into plain lines of text. */
export function extractBlockText(data: unknown): string {
  const found = findItemArray(data) ?? []
  const lines: string[] = []
  for (const entry of found) {
    if (!isRecord(entry)) continue
    const type = stringOf(entry['type'])
    if (type === null) continue
    const block = entry[type]
    if (!isRecord(block)) continue

    const text =
      type === 'child_page'
        ? stringOf(block['title'])
        : joinedPlainText(block['rich_text'])
    if (text === null || text.trim() === '') continue
    lines.push(text)
  }
  return lines.join('\n')
}

/** Renders one property value the way a person would read it, or `null`. */
function propertyValue(value: Record<string, unknown>): string | null {
  const rich = joinedPlainText(value['rich_text'])
  if (rich !== null) return rich

  const title = joinedPlainText(value['title'])
  if (title !== null) return title

  for (const key of ['select', 'status']) {
    const choice = value[key]
    if (isRecord(choice)) {
      const name = stringOf(choice['name'])
      if (name !== null) return name
    }
  }

  const number = value['number']
  if (typeof number === 'number') return String(number)

  const date = value['date']
  if (isRecord(date)) {
    const start = stringOf(date['start'])
    if (start !== null) return start
  }

  const checkbox = value['checkbox']
  if (typeof checkbox === 'boolean') return checkbox ? 'yes' : 'no'

  return null
}

/** Renders database rows as a title plus a few readable properties. */
export function extractRows(
  data: unknown
): Array<{ title: string; properties: string[] }> {
  const found = findItemArray(data) ?? []
  const rows: Array<{ title: string; properties: string[] }> = []
  for (const entry of found) {
    if (!isRecord(entry)) continue
    const title = titleOf(entry)
    const properties: string[] = []
    const source = entry['properties']
    if (isRecord(source)) {
      for (const [name, value] of Object.entries(source)) {
        if (!isRecord(value)) continue
        if (Array.isArray(value['title']) || value['type'] === 'title') continue
        const rendered = propertyValue(value)
        if (rendered === null) continue
        properties.push(`${name}: ${rendered}`)
        if (properties.length >= ROW_PROPERTY_LIMIT) break
      }
    }
    rows.push({ title, properties })
  }
  return rows
}

/**
 * Picks the one item a spoken name refers to. An exact title wins, then the
 * single title containing the query; anything else is not found or ambiguous.
 */
export function matchItem(
  items: readonly NotionItem[],
  wanted: string
): NotionItem | null {
  const lower = wanted.trim().toLowerCase()
  if (lower === '') return null

  const exact = items.filter((item) => item.title.toLowerCase() === lower)
  if (exact.length === 1) return exact[0]

  const containing = items.filter((item) =>
    item.title.toLowerCase().includes(lower)
  )
  if (containing.length === 1) return containing[0]

  const contained = items.filter((item) => {
    const title = item.title.trim().toLowerCase()
    return title !== '' && title !== '(untitled)' && lower.includes(title)
  })
  if (contained.length === 1) return contained[0]

  if (items.length === 1) return items[0]

  return null
}

const PAGE_HINTS = new Set(['page', 'pages', 'doc', 'docs'])
const DATABASE_HINTS = new Set([
  'database',
  'databases',
  'db',
  'dbs',
  'table',
  'tables'
])

/**
 * Splits a spoken name like "notes database" into the words Notion should
 * search ("notes") and the kind the user named, or null when they named none.
 * Trailing kind words are stripped, but never every word: a name of "docs"
 * alone keeps searching for "docs".
 */
export function parseSpokenTarget(name: string): {
  query: string
  kind: NotionKind | null
} {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  let end = tokens.length
  let kind: NotionKind | null = null
  while (end > 0) {
    const word = tokens[end - 1].toLowerCase().replace(/[.,!?;:]+$/, '')
    const found: NotionKind | null = PAGE_HINTS.has(word)
      ? 'page'
      : DATABASE_HINTS.has(word)
        ? 'database'
        : null
    if (found === null) break
    if (kind === null) kind = found
    if (end === 1) break
    end -= 1
  }
  return { query: tokens.slice(0, end).join(' '), kind }
}

// --- tool schemas ------------------------------------------------------

const SEARCH_DESCRIPTION =
  'Find Notion pages and databases by title, name, or keywords.'
const READ_DESCRIPTION =
  'Read the text, notes, and content on a Notion page. Use this when the user asks to read, see, or summarize a page by name or id.'
const QUERY_DESCRIPTION =
  'Read, search, and filter rows or entries from a Notion database or table.'
const CREATE_DESCRIPTION =
  'Create a new Notion page inside a parent page or database, with a title and optional text.'

export function createNotionTools(options: NotionToolOptions): Tool[] {
  const callTool = options.callTool
  const invoke = createInvoker(callTool, 'Notion returned an error.', 'Notion')

  async function searchPage(
    query: string,
    filter: NotionKind | null,
    action: string
  ): Promise<InvokeResult> {
    const callArgs: Record<string, unknown> = { page_size: RESULT_LIMIT }
    if (query !== '') callArgs['query'] = query
    if (filter !== null) callArgs['filter_value'] = filter
    return invoke(SLUG.search, callArgs, action)
  }

  /**
   * Runs the searches a spoken name needs and returns every distinct item
   * found. When the user named a kind, only that kind is searched; otherwise
   * the search is unfiltered, and if nothing turns up we also try databases
   * explicitly, because Composio's search defaults to pages.
   */
  async function searchForItems(
    query: string,
    kind: NotionKind | null,
    action: string
  ): Promise<
    { ok: true; items: NotionItem[] } | { ok: false; outcome: ToolOutcome }
  > {
    const attempts: Array<{ query: string; filter: NotionKind | null }> =
      kind !== null
        ? [
            { query, filter: kind },
            { query: '', filter: kind }
          ]
        : [
            { query, filter: null },
            { query: '', filter: null },
            { query, filter: 'database' },
            { query: '', filter: 'database' }
          ]

    const items: NotionItem[] = []
    const seen = new Set<string>()
    for (const attempt of attempts) {
      const found = await searchPage(attempt.query, attempt.filter, action)
      if (!found.ok) return { ok: false, outcome: found.outcome }
      const batch = extractItems(found.data)
      for (const item of batch) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
      }
      if (items.length > 0) break
    }
    return { ok: true, items }
  }

  /**
   * Turns a spoken name into an id, or uses the id directly when the argument
   * already looks like one. A resolved item also carries the title, so a reply
   * can name it back; a direct id has none. `preferredKind` narrows the search
   * when the user's words did not name a kind themselves.
   */
  async function resolveTarget(
    name: string,
    preferredKind: NotionKind | null,
    action: string
  ): Promise<
    | { ok: true; id: string; title: string | null; type: NotionKind }
    | { ok: false; outcome: ToolOutcome }
  > {
    const trimmed = name.trim()
    const direct = notionId(trimmed)
    if (direct !== null) {
      return { ok: true, id: direct, title: null, type: preferredKind ?? 'page' }
    }

    const spoken = parseSpokenTarget(trimmed)
    const kind = spoken.kind ?? preferredKind
    const searched = await searchForItems(spoken.query, kind, action)
    if (!searched.ok) return { ok: false, outcome: searched.outcome }

    const items = searched.items
    const wanted = spoken.query !== '' ? spoken.query : trimmed
    const matched =
      matchItem(items, wanted) ??
      (wanted !== trimmed ? matchItem(items, trimmed) : null)
    if (matched !== null) {
      return { ok: true, id: matched.id, title: matched.title, type: matched.type }
    }

    const noun =
      kind === 'database'
        ? 'database'
        : kind === 'page'
          ? 'page'
          : 'page or database'
    const lower = wanted.toLowerCase()
    const candidates = items.filter((item) =>
      item.title.toLowerCase().includes(lower)
    )
    const message =
      candidates.length > 1
        ? `More than one ${noun} matches "${trimmed}": ${candidates
            .slice(0, 3)
            .map((item) => `"${item.title}"`)
            .join(', ')}. Say the full name.`
        : `I couldn't find a Notion ${noun} called "${trimmed}".`
    return {
      ok: false,
      outcome: { status: 'error', action, message, spokenResponse: message }
    }
  }

  const search: Tool = {
    spec: specFor(
      'notion_search',
      SEARCH_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: 'What to search for; leave empty to list everything.'
          },
          type: {
            type: 'string',
            description: 'page, database, or any. Defaults to any.'
          }
        },
        []
      ),
      'read',
      false,
      'search Notion'
    ),
    async run(args, ctx) {
      const action = 'search Notion'
      const skipped = dryRun(ctx, action, 'notion_search')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query') ?? ''
      const type = (optionalString(args, 'type') ?? '').trim().toLowerCase()

      const callArgs: Record<string, unknown> = { page_size: RESULT_LIMIT }
      if (query.trim() !== '') callArgs['query'] = query.trim()
      if (type === 'page' || type === 'database') {
        callArgs['filter_value'] = type
      }

      const found = await invoke(SLUG.search, callArgs, action)
      if (!found.ok) return found.outcome

      const items = extractItems(found.data)
      if (items.length === 0) {
        const message =
          query.trim() === ''
            ? "I couldn't find anything in Notion."
            : `I couldn't find anything in Notion matching "${query.trim()}".`
        return { status: 'ok', action, message, spokenResponse: message }
      }

      const textToCheck = `${ctx.transcript ?? ''} ${query}`.toLowerCase()
      const wantsContent =
        /\b(summarize|summary|read|explain|tell me about|what is|what's)\b/i.test(
          textToCheck
        )
      if (items.length === 1 && items[0].type === 'page' && wantsContent) {
        const blocks = await invoke(
          SLUG.blocks,
          { block_id: items[0].id, page_size: BLOCK_PAGE_SIZE },
          action
        )
        if (blocks.ok) {
          const text = extractBlockText(blocks.data)
          if (text !== '') {
            const title = items[0].title
            const message = `${title}\n\n${text}`
            return {
              status: 'ok',
              action,
              message: truncate(message, MESSAGE_LIMIT),
              spokenResponse: truncate(`${title}: ${text}`, SPOKEN_LIMIT)
            }
          }
        }
      }

      const listed = items.map((item) => `- ${item.title} (${item.type})`)
      const titles = items
        .slice(0, SPOKEN_RESULT_LIMIT)
        .map((item) => item.title)
        .join(', ')
      const spoken = `Found ${items.length} results in Notion: ${titles}.`
      return {
        status: 'ok',
        action,
        message: truncate(listed.join('\n'), MESSAGE_LIMIT),
        spokenResponse: truncate(spoken, SPOKEN_LIMIT)
      }
    }
  }

  const readPage: Tool = {
    spec: specFor(
      'notion_read_page',
      READ_DESCRIPTION,
      objectSchema(
        {
          page: {
            type: 'string',
            description:
              "The page title or topic as the user named it (e.g. 'DP', 'Meeting Notes'), or its id."
          }
        },
        ['page']
      ),
      'read',
      false,
      'read a Notion page'
    ),
    async run(args, ctx) {
      const action = 'read a Notion page'
      const skipped = dryRun(ctx, action, 'notion_read_page')
      if (skipped !== null) return skipped

      const page = optionalString(args, 'page') ?? ''
      const resolved = await resolveTarget(page, 'page', action)
      if (!resolved.ok) return resolved.outcome

      const blocks = await invoke(
        SLUG.blocks,
        { block_id: resolved.id, page_size: BLOCK_PAGE_SIZE },
        action
      )
      if (!blocks.ok) return blocks.outcome

      const text = extractBlockText(blocks.data)
      if (text === '') {
        const message = 'That page looks empty.'
        return { status: 'ok', action, message, spokenResponse: message }
      }

      const title = resolved.title ?? page.trim()
      const message = `${title}\n\n${text}`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(`${title}: ${text}`, SPOKEN_LIMIT)
      }
    }
  }

  const queryDatabase: Tool = {
    spec: specFor(
      'notion_query_database',
      QUERY_DESCRIPTION,
      objectSchema(
        {
          database: {
            type: 'string',
            description: 'The database or table as the user named it, or its id.'
          },
          limit: {
            type: 'integer',
            description: 'How many rows to read. Defaults to 25.'
          }
        },
        ['database']
      ),
      'read',
      false,
      'read a Notion database'
    ),
    async run(args, ctx) {
      const action = 'read a Notion database'
      const skipped = dryRun(ctx, action, 'notion_query_database')
      if (skipped !== null) return skipped

      const database = optionalString(args, 'database') ?? ''
      const resolved = await resolveTarget(database, 'database', action)
      if (!resolved.ok) return resolved.outcome

      const requested = optionalInteger(args, 'limit') ?? RESULT_LIMIT
      const pageSize = Math.min(100, Math.max(1, Math.trunc(requested)))

      const queried = await invoke(
        SLUG.query,
        { database_id: resolved.id, page_size: pageSize },
        action
      )
      if (!queried.ok) return queried.outcome

      const rows = extractRows(queried.data)
      if (rows.length === 0) {
        const message = 'That database has no rows.'
        return { status: 'ok', action, message, spokenResponse: message }
      }

      const name = resolved.title ?? database.trim()
      const lines = rows.map((row) =>
        row.properties.length === 0
          ? row.title
          : `${row.title} (${row.properties.join(', ')})`
      )
      const message = `${rows.length} rows in "${name}":\n${lines.join('\n')}`
      const titles = rows
        .slice(0, SPOKEN_RESULT_LIMIT)
        .map((row) => row.title)
        .join(', ')
      const spoken = `${rows.length} rows in "${name}". ${titles}.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(spoken, SPOKEN_LIMIT)
      }
    }
  }

  const createPage: Tool = {
    spec: specFor(
      'notion_create_page',
      CREATE_DESCRIPTION,
      objectSchema(
        {
          title: { type: 'string', description: 'The page title.' },
          content: { type: 'string', description: 'Page body as markdown.' },
          parent: {
            type: 'string',
            description:
              'The parent page or database to put it under, as the user named it, or its id.'
          }
        },
        ['title']
      ),
      'write',
      true,
      'create a Notion page'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'create a Notion page'
      const title = (optionalString(args, 'title') ?? '').trim()
      if (title === '') {
        const message = 'I need a title for that page.'
        return {
          arguments: args,
          outcome: { status: 'error', action, message, spokenResponse: message }
        }
      }

      const parent = (optionalString(args, 'parent') ?? '').trim()
      if (parent === '') {
        const message = 'Where should I create that page?'
        return {
          arguments: args,
          outcome: { status: 'error', action, message, spokenResponse: message }
        }
      }

      const content = optionalString(args, 'content') ?? ''

      if (ctx.dryRun) {
        const card: NotchNotionCard = {
          kind: 'notion_page',
          mode: 'create',
          title,
          parentName: parent,
          isDatabase: false,
          content
        }
        return {
          arguments: { title, content, parent },
          display: `${title} under ${parent}`,
          card: card as unknown as Record<string, unknown>
        }
      }

      const resolved = await resolveTarget(parent, null, action)
      if (!resolved.ok) return { arguments: args, outcome: resolved.outcome }

      const parentId = resolved.id
      const parentName = resolved.title ?? parent
      const isDatabase = resolved.type === 'database'

      const card: NotchNotionCard = {
        kind: 'notion_page',
        mode: 'create',
        title,
        parentName,
        isDatabase,
        content,
        parentId
      }

      const prepared: Record<string, unknown> = {
        title,
        parent_id: parentId,
        parent: parentName,
        content
      }

      const message = `Create "${title}" in Notion under "${parentName}"?`
      return {
        arguments: prepared,
        display: `${title} under ${parentName}`,
        message,
        card: card as unknown as Record<string, unknown>
      }
    },
    applyEdits(args, edits): Record<string, unknown> {
      const next = { ...args }

      const title = optionalString(edits, 'title')
      if (title !== null) next['title'] = title

      if (typeof edits['content'] === 'string') next['content'] = edits['content']

      return next
    },
    async run(args, ctx) {
      const action = 'create a Notion page'
      const skipped = dryRun(ctx, action, 'notion_create_page')
      if (skipped !== null) return skipped

      const title = optionalString(args, 'title') ?? ''
      if (title.trim() === '') {
        const message = 'I need a title for that page.'
        return { status: 'error', action, message, spokenResponse: message }
      }

      let parentId = optionalString(args, 'parent_id')
      let parentName = optionalString(args, 'parent')

      if (parentId === null) {
        const parent = optionalString(args, 'parent') ?? ''
        if (parent.trim() === '') {
          const message = 'Where should I create that page?'
          return { status: 'error', action, message, spokenResponse: message }
        }

        const resolved = await resolveTarget(parent, null, action)
        if (!resolved.ok) return resolved.outcome
        parentId = resolved.id
        parentName = resolved.title
      }

      const callArgs: Record<string, unknown> = {
        title: title.trim(),
        parent_id: parentId
      }
      const content =
        optionalString(args, 'content') ?? optionalString(args, 'markdown')
      if (content !== null && content.trim() !== '') {
        callArgs['markdown'] = content
      }

      const created = await invoke(SLUG.create, callArgs, action)
      if (!created.ok) return created.outcome

      const message =
        parentName !== null && parentName !== undefined && parentName.trim() !== ''
          ? `Created "${title.trim()}" in Notion under "${parentName}".`
          : `Created "${title.trim()}" in Notion.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  return [search, readPage, queryDatabase, createPage]
}
