/**
 * Voice-facing Gmail tools.
 *
 * Composio exposes Gmail as a wide surface of raw tool slugs
 * (GMAIL_FETCH_EMAILS, GMAIL_SEND_EMAIL, GMAIL_REPLY_TO_THREAD, ...). Handing
 * those slugs straight to the language model invites it to guess parameter
 * names and chain calls. These five tools instead present a small,
 * spoken-shaped contract: each one translates a single spoken request into the
 * one or two Composio calls it needs, so the model never sees Composio's raw
 * surface.
 */

import type { Tool, ToolOutcome, ToolPreparation } from '../types'
import type { CallTool } from './support'
import {
  EMAIL,
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

export interface EmailMessage {
  readonly id: string
  readonly threadId: string | null
  /** Cleaned display subject: repeated Re:/Fwd:/Fw: prefixes stripped. */
  readonly subject: string
  /** Display name from `Name <addr>`, falling back to the address. */
  readonly sender: string
  /** The parsed address from the raw sender, or null. */
  readonly senderAddress: string | null
  readonly to: string
  readonly snippet: string
  readonly timestamp: string | null
}

export interface GmailToolOptions {
  /** Calls one Composio tool by its exact slug over MCP. */
  callTool: CallTool
  /** Injectable for tests. Defaults to the host clock when used. */
  now?: () => Date
  /** IANA zone, e.g. 'Asia/Kolkata'. Defaults to the host zone when used. */
  timezone?: () => string
}

/** Composio slugs, kept in one place so no raw name leaks into a prompt. */
const SLUG = {
  list: 'GMAIL_FETCH_EMAILS',
  read: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
  thread: 'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
  send: 'GMAIL_SEND_EMAIL',
  reply: 'GMAIL_REPLY_TO_THREAD',
  draft: 'GMAIL_CREATE_EMAIL_DRAFT'
} as const

const EMAIL_LIMIT = 20
const SPOKEN_EMAIL_LIMIT = 3
const READ_LIMIT = 1200
const SPOKEN_READ_LIMIT = 300
/** The list card and list tool always show the newest five threads. */
const LIST_ROWS = 5
/** How many emails are pulled from Composio before sorting and collapsing. */
const LIST_FETCH = 10
const ASK_FOR_ADDRESS = 'Who should I send it to? I need their email address.'

// --- pure parsing helpers (exported for tests) -------------------------

function scalarString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip repeated `Re:` / `Fwd:` / `Fw:` prefixes and collapse whitespace. */
export function cleanSubject(raw: string): string {
  let subject = raw.replace(/\s+/g, ' ').trim()
  while (/^(re|fwd|fw)\s*:/i.test(subject)) {
    subject = subject.replace(/^(re|fwd|fw)\s*:\s*/i, '').trim()
  }
  return subject
}

/**
 * Split a raw sender into a display name and an address. `Sam <sam@x.com>`
 * yields name "Sam"; a bare `sam@x.com` uses the address as the name.
 */
function splitSender(raw: string): { name: string; address: string | null } {
  const trimmed = raw.trim()
  if (trimmed === '') return { name: '', address: null }
  const angled = /^(.*?)<([^<>]+)>/.exec(trimmed)
  if (angled !== null) {
    const name = angled[1].replace(/"/g, ' ').replace(/\s+/g, ' ').trim()
    const address = angled[2].trim()
    return {
      name: name !== '' ? name : address,
      address: parseEmailAddress(address)
    }
  }
  return { name: trimmed, address: parseEmailAddress(trimmed) }
}

/** Unwrap `data.data` / `data` up to twice, so either shape parses. */
function unwrap(data: unknown): unknown {
  let value = data
  for (let depth = 0; depth < 2; depth += 1) {
    if (isRecord(value) && Object.hasOwn(value, 'data')) value = value['data']
    else break
  }
  return value
}

function messageArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (isRecord(value)) {
    for (const key of ['messages', 'emails', 'items']) {
      const candidate = value[key]
      if (Array.isArray(candidate)) return candidate
    }
  }
  return null
}

function snippetOf(item: Record<string, unknown>): string {
  const preview = item['preview']
  const fromPreview = isRecord(preview) ? stringOf(preview['body']) : null
  const raw =
    fromPreview ??
    stringOf(item['snippet']) ??
    stringOf(item['messageText']) ??
    stringOf(item['body']) ??
    stringOf(item['text'])
  return raw === null ? '' : stripHtml(raw)
}

function toMessage(item: Record<string, unknown>): EmailMessage | null {
  const id =
    scalarString(item['messageId']) ??
    scalarString(item['message_id']) ??
    scalarString(item['id'])
  if (id === null) return null
  const rawSender = stringOf(item['sender']) ?? stringOf(item['from']) ?? ''
  const parsedSender = splitSender(rawSender)
  return {
    id,
    threadId: scalarString(item['threadId']) ?? scalarString(item['thread_id']),
    subject: cleanSubject(stringOf(item['subject']) ?? ''),
    sender: parsedSender.name,
    senderAddress: parsedSender.address,
    to: stringOf(item['to']) ?? stringOf(item['recipient']) ?? '',
    snippet: snippetOf(item),
    timestamp:
      scalarString(item['messageTimestamp']) ??
      scalarString(item['internalDate']) ??
      scalarString(item['date']) ??
      scalarString(item['timestamp'])
  }
}

export function extractEmails(data: unknown): EmailMessage[] {
  const list = messageArray(unwrap(data))
  if (list === null) return []
  const messages: EmailMessage[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const message = toMessage(item)
    if (message === null) continue
    messages.push(message)
    if (messages.length >= EMAIL_LIMIT) break
  }
  return messages
}

/** Epoch milliseconds for a message time, or 0 when missing/unparseable. */
export function messageTime(message: EmailMessage): number {
  const raw = message.timestamp
  if (raw === null) return 0
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const date =
    /^\d+$/.test(trimmed) ? new Date(Number(trimmed)) : new Date(trimmed)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Stable newest-first order. Messages with an equal or unknown time keep the
 * order they arrived in.
 */
export function sortNewestFirst(
  messages: readonly EmailMessage[]
): EmailMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const delta = messageTime(b.message) - messageTime(a.message)
      return delta !== 0 ? delta : a.index - b.index
    })
    .map((entry) => entry.message)
}

/**
 * One message per thread, keeping the newest. When `threadId` is null the
 * message id is the key. Assumes the input is already newest-first.
 */
export function collapseThreads(
  messages: readonly EmailMessage[]
): EmailMessage[] {
  const seen = new Set<string>()
  const collapsed: EmailMessage[] = []
  for (const message of messages) {
    const key = message.threadId ?? message.id
    if (seen.has(key)) continue
    seen.add(key)
    collapsed.push(message)
  }
  return collapsed
}

/**
 * 1-based pick over a newest-first list, clamped into range: `position <= 1`
 * is the first, anything past the end is the last.
 */
export function selectEmail(
  messages: readonly EmailMessage[],
  position: number
): EmailMessage | null {
  if (messages.length === 0) return null
  const safe = Number.isFinite(position) ? Math.trunc(position) : 1
  const index = Math.min(Math.max(safe, 1), messages.length) - 1
  return messages[index]
}

/** The one message a full-message fetch returned, or `null`. */
function extractSingle(data: unknown): EmailMessage | null {
  const many = extractEmails(data)
  if (many.length > 0) return many[0]
  const value = unwrap(data)
  return isRecord(value) ? toMessage(value) : null
}

function partText(node: unknown): string | null {
  if (!isRecord(node)) return null
  const body = node['body']
  if (!isRecord(body)) return null
  const raw = body['data']
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    return decoded.trim() === '' ? null : decoded
  } catch {
    return null
  }
}

function collectBodies(
  node: unknown,
  plain: string[],
  html: string[]
): void {
  if (!isRecord(node)) return
  const text = partText(node)
  if (text !== null) {
    const mime = stringOf(node['mimeType'])
    if (mime === 'text/html') html.push(text)
    else if (mime === 'text/plain') plain.push(text)
  }
  const parts = node['parts']
  if (Array.isArray(parts)) {
    for (const part of parts) collectBodies(part, plain, html)
  }
}

function directBody(value: unknown): string | null {
  if (typeof value === 'string') return stringOf(value)
  if (isRecord(value)) {
    return (
      stringOf(value['messageText']) ??
      stringOf(value['body']) ??
      stringOf(value['text']) ??
      stringOf(value['snippet'])
    )
  }
  return null
}

function joinBodies(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n')
}

export function extractEmailBody(data: unknown): string {
  try {
    const value = unwrap(data)
    const direct = directBody(value)
    if (direct !== null) return direct

    const plain: string[] = []
    const html: string[] = []
    const root =
      isRecord(value) && isRecord(value['payload']) ? value['payload'] : value
    collectBodies(root, plain, html)
    if (plain.length > 0) return joinBodies(plain)
    if (html.length > 0) return stripHtml(joinBodies(html))
    return ''
  } catch {
    return ''
  }
}

export function parseEmailAddress(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const angled = /<([^<>]+)>/.exec(trimmed)
  const value = (angled === null ? trimmed : angled[1]).trim()
  if (!EMAIL.test(value)) return null
  return value.toLowerCase()
}

export function senderEmail(message: EmailMessage): string | null {
  return message.senderAddress
}

export function pickEmail(
  messages: readonly EmailMessage[]
):
  | { ok: true; message: EmailMessage }
  | {
      ok: false
      reason: 'not_found' | 'ambiguous'
      candidates: EmailMessage[]
    } {
  const distinct: EmailMessage[] = []
  const seen = new Set<string>()
  for (const message of messages) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    distinct.push(message)
  }
  if (distinct.length === 0) {
    return { ok: false, reason: 'not_found', candidates: [] }
  }
  if (distinct.length === 1) return { ok: true, message: distinct[0] }
  return { ok: false, reason: 'ambiguous', candidates: distinct.slice(0, 3) }
}

/** Lowercase, keep letters/digits/spaces, and collapse whitespace. */
function normaliseForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The email addresses in `messages` that belong to `name`: a candidate
 * matches when its display name contains the query, or its address (local
 * part and domain) contains it. Collected from both the sender and the
 * recipient of each message, deduped case-insensitively, order preserved.
 */
export function matchRecipient(
  name: string,
  messages: readonly EmailMessage[]
): string[] {
  const query = normaliseForMatch(name)
  if (query === '') return []

  const matches: string[] = []
  const seen = new Set<string>()
  const consider = (display: string, address: string | null): void => {
    if (address === null) return
    const email = address.trim().toLowerCase()
    if (email === '' || seen.has(email)) return
    if (!normaliseForMatch(display).includes(query) && !email.includes(query)) {
      return
    }
    seen.add(email)
    matches.push(email)
  }

  for (const message of messages) {
    consider(message.sender, message.senderAddress)
    const to = splitSender(message.to)
    consider(to.name, to.address)
  }
  return matches
}

export function describeTimestamp(
  value: string | null,
  now: Date,
  timeZone: string
): string {
  // `now` is part of the shared helper signature; absolute formatting ignores it.
  void now
  const raw = value === null ? '' : value.trim()
  if (raw === '') return ''
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date)
  } catch {
    return ''
  }
}

function hostZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** A compact list-card date such as `Nov 11`. */
function shortDate(value: string | null, timeZone: string): string {
  if (value === null) return ''
  const raw = value.trim()
  if (raw === '') return ''
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric'
    }).format(date)
  } catch {
    return ''
  }
}

// --- tools -------------------------------------------------------------

function flag(args: Record<string, unknown>, key: string): boolean {
  const value = args[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

function buildQuery(query: string | null, unreadOnly: boolean): string | null {
  if (query === null) return unreadOnly ? 'is:unread' : null
  return unreadOnly ? `is:unread ${query}` : query
}

function splitAddresses(raw: string | null): {
  valid: string[]
  dropped: string[]
} {
  if (raw === null) return { valid: [], dropped: [] }
  const valid: string[] = []
  const dropped: string[] = []
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  for (const entry of entries) {
    const address = parseEmailAddress(entry)
    if (address === null) dropped.push(entry)
    else valid.push(address)
  }
  return { valid, dropped }
}

/**
 * Recipients for the send tool, accepting either the prepared array or the
 * raw comma-separated string the model supplied.
 */
function ccFromArgs(args: Record<string, unknown>): {
  valid: string[]
  dropped: string[]
} {
  const value = args['cc']
  if (Array.isArray(value)) {
    const valid: string[] = []
    for (const entry of value) {
      if (typeof entry !== 'string') continue
      const address = parseEmailAddress(entry)
      if (address !== null) valid.push(address)
    }
    return { valid, dropped: [] }
  }
  return splitAddresses(optionalString(args, 'cc'))
}

const LIST_DESCRIPTION =
  "List the newest emails in the user's inbox, newest first, or only unread."

const READ_DESCRIPTION =
  'Read one email aloud; the newest matching email is position 1.'

const SEND_DESCRIPTION =
  'Send a new email with a subject and body; pass an address or just a name.'

const REPLY_DESCRIPTION =
  'Reply to an existing email by search words or position, newest is 1.'

const DRAFT_DESCRIPTION =
  'Save an email draft without sending it; pass an address or just a name.'

export function createGmailTools(options: GmailToolOptions): Tool[] {
  const zone = options.timezone ?? hostZone
  const invoke = createInvoker(
    options.callTool,
    'Gmail returned an error.',
    'Gmail'
  )

  /**
   * Resolve one email from the inbox: list with the built query, order newest
   * first, collapse threads, then pick by 1-based position.
   */
  async function locateMessage(
    query: string | null,
    unreadOnly: boolean,
    position: number,
    action: string
  ): Promise<
    { ok: true; message: EmailMessage } | { ok: false; outcome: ToolOutcome }
  > {
    const callArgs: Record<string, unknown> = {
      user_id: 'me',
      max_results: LIST_FETCH,
      verbose: true,
      include_payload: false
    }
    const effectiveQuery = buildQuery(query, unreadOnly)
    if (effectiveQuery !== null) callArgs['query'] = effectiveQuery

    const listed = await invoke(SLUG.list, callArgs, action)
    if (!listed.ok) return { ok: false, outcome: listed.outcome }

    const messages = collapseThreads(
      sortNewestFirst(extractEmails(listed.data))
    )
    const selected = selectEmail(messages, position)
    if (selected === null) {
      const message =
        query !== null
          ? `I couldn't find an email matching "${query}".`
          : unreadOnly
            ? 'You have no unread emails.'
            : 'Your inbox is empty.'
      return {
        ok: false,
        outcome: { status: 'error', action, message, spokenResponse: message }
      }
    }
    return { ok: true, message: selected }
  }

  /** Best-effort thread size; never fails the surrounding call. */
  async function threadCount(
    threadId: string,
    action: string
  ): Promise<number | null> {
    try {
      const fetched = await invoke(
        SLUG.thread,
        { user_id: 'me', thread_id: threadId },
        action
      )
      if (!fetched.ok) return null
      const messages = messageArray(unwrap(fetched.data))
      return messages === null ? null : messages.length
    } catch {
      return null
    }
  }

  /**
   * Turn a spoken recipient into a real address. A valid address is used as
   * given; otherwise the user's own mailbox is searched for a matching
   * person. Never invents or completes an address: no match, or several,
   * comes back as a spoken error for the user to resolve.
   */
  async function resolveRecipient(
    raw: string | null,
    action: string
  ): Promise<
    | { ok: true; email: string; label: string }
    | { ok: false; reason: 'none' | 'ambiguous'; outcome: ToolOutcome }
  > {
    const direct = parseEmailAddress(raw)
    if (direct !== null) return { ok: true, email: direct, label: direct }

    const name = raw === null ? '' : raw.trim()
    const askNone = (): {
      ok: false
      reason: 'none'
      outcome: ToolOutcome
    } => ({
      ok: false,
      reason: 'none',
      outcome: {
        status: 'error',
        action,
        message: ASK_FOR_ADDRESS,
        spokenResponse: ASK_FOR_ADDRESS
      }
    })
    if (name === '') return askNone()

    const listed = await invoke(
      SLUG.list,
      {
        user_id: 'me',
        query: name,
        max_results: 25,
        verbose: true,
        include_payload: false,
        include_spam_trash: false
      },
      action
    )
    if (!listed.ok) {
      return { ok: false, reason: 'none', outcome: listed.outcome }
    }

    const candidates = matchRecipient(name, extractEmails(listed.data))
    if (candidates.length === 1) {
      const email = candidates[0]
      return { ok: true, email, label: `${name} <${email}>` }
    }
    if (candidates.length === 0) return askNone()

    const shown = candidates.slice(0, 3).join(', ')
    const message = `I found more than one match for "${name}": ${shown}. Which one?`
    return {
      ok: false,
      reason: 'ambiguous',
      outcome: { status: 'error', action, message, spokenResponse: message }
    }
  }

  const listEmails: Tool = {
    spec: specFor(
      'gmail_list_emails',
      LIST_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: "Gmail search built from the user's words."
          },
          unread_only: {
            type: 'boolean',
            description: 'Only show unread emails.'
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of emails to return. Defaults to 10.'
          }
        },
        []
      ),
      'read',
      false,
      'check your email'
    ),
    async run(args, ctx) {
      const action = 'check your email'
      const skipped = dryRun(ctx, action, 'gmail_list_emails')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query')
      const unreadOnly = flag(args, 'unread_only')

      const callArgs: Record<string, unknown> = {
        user_id: 'me',
        max_results: LIST_FETCH,
        verbose: true,
        include_payload: false,
        include_spam_trash: false
      }
      const effectiveQuery = buildQuery(query, unreadOnly)
      if (effectiveQuery !== null) callArgs['query'] = effectiveQuery

      const listed = await invoke(SLUG.list, callArgs, action)
      if (!listed.ok) return listed.outcome

      const rows = collapseThreads(
        sortNewestFirst(extractEmails(listed.data))
      ).slice(0, LIST_ROWS)

      if (rows.length === 0) {
        const message =
          query !== null
            ? "I couldn't find any emails matching that."
            : unreadOnly
              ? 'You have no unread emails.'
              : 'Your inbox is empty.'
        return { status: 'ok', action, message, spokenResponse: message }
      }

      const count = rows.length
      const card: Record<string, unknown> = {
        kind: 'email_list',
        title: unreadOnly ? `Unread inbox: first ${count}` : 'Latest inbox emails',
        rows: rows.map((message) => ({
          title: message.sender,
          subtitle: message.subject !== '' ? message.subject : message.snippet,
          trailing: shortDate(message.timestamp, zone())
        }))
      }
      const message = unreadOnly
        ? `Here are your ${count} latest unread emails.`
        : `Here are your ${count} latest emails.`

      const items = rows
        .slice(0, SPOKEN_EMAIL_LIMIT)
        .map(
          (message) =>
            `${message.sender}, ${message.subject !== '' ? message.subject : 'no subject'}`
        )
      const more =
        count > SPOKEN_EMAIL_LIMIT
          ? ` And ${count - SPOKEN_EMAIL_LIMIT} more.`
          : ''
      const spokenHead = unreadOnly
        ? `Here are your ${count} latest unread emails`
        : `Here are your ${count} latest emails`
      const spoken = `${spokenHead}: ${items.join('; ')}.${more}`

      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(spoken, SPOKEN_LIMIT),
        card
      }
    }
  }

  const readEmail: Tool = {
    spec: specFor(
      'gmail_read_email',
      READ_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: 'The email as the user described it.'
          },
          message_id: {
            type: 'string',
            description: 'The email id, when it is already known.'
          },
          unread_only: {
            type: 'boolean',
            description: 'Only consider unread emails.'
          },
          position: {
            type: 'integer',
            description: 'Which one, newest first. 1 is the newest.'
          }
        },
        []
      ),
      'read',
      false,
      'read an email'
    ),
    async run(args, ctx) {
      const action = 'read an email'
      const skipped = dryRun(ctx, action, 'gmail_read_email')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query')
      const directId = optionalString(args, 'message_id')
      const unreadOnly = flag(args, 'unread_only')
      const position = optionalInteger(args, 'position') ?? 1

      let targetId: string
      let known: EmailMessage | null = null
      if (directId !== null) {
        targetId = directId
      } else {
        const located = await locateMessage(
          query,
          unreadOnly,
          position,
          action
        )
        if (!located.ok) return located.outcome
        targetId = located.message.id
        known = located.message
      }

      const fetched = await invoke(
        SLUG.read,
        { message_id: targetId, user_id: 'me', format: 'full' },
        action
      )
      if (!fetched.ok) return fetched.outcome

      const detail = extractSingle(fetched.data) ?? known
      const sender = detail?.sender ?? ''
      const subject = detail?.subject ?? ''
      const body = extractEmailBody(fetched.data)

      const head: string[] = []
      if (sender !== '') head.push(`From ${sender}.`)
      if (subject !== '') head.push(`Subject "${subject}".`)
      const message = `${head.join(' ')} ${truncate(body, READ_LIMIT)}`.trim()

      const spokenHead =
        subject !== '' && sender !== ''
          ? `Subject "${subject}", from ${sender}.`
          : subject !== ''
            ? `Subject "${subject}".`
            : sender !== ''
              ? `From ${sender}.`
              : ''
      const spoken = `${spokenHead} ${truncate(body, SPOKEN_READ_LIMIT)}`.trim()

      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(spoken, SPOKEN_LIMIT)
      }
    }
  }

  const sendEmail: Tool = {
    spec: specFor(
      'gmail_send_email',
      SEND_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description: "The recipient's email address."
          },
          subject: { type: 'string', description: 'The subject line.' },
          body: { type: 'string', description: 'The message body.' },
          cc: {
            type: 'string',
            description: 'Comma-separated cc email addresses, optional.'
          }
        },
        ['recipient', 'subject', 'body']
      ),
      'write',
      true,
      'send an email'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'send an email'
      if (ctx.dryRun) return { arguments: { ...args } }

      const resolved = await resolveRecipient(
        optionalString(args, 'recipient'),
        action
      )
      if (!resolved.ok) {
        return { arguments: { ...args }, outcome: resolved.outcome }
      }
      const recipient = resolved.email
      const label = resolved.label

      const subject = optionalString(args, 'subject') ?? ''
      const body = optionalString(args, 'body') ?? ''
      const cc = splitAddresses(optionalString(args, 'cc'))
      const card: Record<string, unknown> = {
        kind: 'email_compose',
        mode: 'send',
        title: 'New Message',
        to: [recipient],
        cc: cc.valid,
        bcc: [],
        subject,
        body,
        threadCount: null
      }
      return {
        arguments: {
          ...args,
          recipient_email: recipient,
          subject,
          body,
          cc: cc.valid
        },
        message: `Send "${subject}" to ${label}? Approval needed.`,
        display: label,
        card
      }
    },
    async run(args, ctx) {
      const action = 'send an email'
      const skipped = dryRun(ctx, action, 'gmail_send_email')
      if (skipped !== null) return skipped

      const recipient =
        parseEmailAddress(optionalString(args, 'recipient_email')) ??
        parseEmailAddress(optionalString(args, 'recipient'))
      if (recipient === null) {
        return { status: 'error', action, message: ASK_FOR_ADDRESS }
      }

      const subject = optionalString(args, 'subject') ?? ''
      const body = optionalString(args, 'body') ?? ''
      const cc = ccFromArgs(args)

      const callArgs: Record<string, unknown> = {
        user_id: 'me',
        recipient_email: recipient,
        subject,
        body,
        is_html: false
      }
      if (cc.valid.length > 0) callArgs['cc'] = cc.valid

      const sent = await invoke(SLUG.send, callArgs, action)
      if (!sent.ok) return sent.outcome

      const note =
        cc.dropped.length > 0
          ? ` I didn't add ${joinNames(cc.dropped)} because I need an email address.`
          : ''
      const message = `Sent "${subject}" to ${recipient}.${note}`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const replyEmail: Tool = {
    spec: specFor(
      'gmail_reply_email',
      REPLY_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: 'The email to reply to, as the user described it.'
          },
          message: { type: 'string', description: 'The reply text.' },
          unread_only: {
            type: 'boolean',
            description: 'Only consider unread emails.'
          },
          position: {
            type: 'integer',
            description: 'Which one, newest first. 1 is the newest.'
          },
          recipient: {
            type: 'string',
            description: 'Override the reply address, optional.'
          }
        },
        ['message']
      ),
      'write',
      true,
      'reply to an email'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'reply to an email'
      if (ctx.dryRun) return { arguments: { ...args } }

      const query = optionalString(args, 'query')
      const unreadOnly = flag(args, 'unread_only')
      const position = optionalInteger(args, 'position') ?? 1
      const body = optionalString(args, 'message') ?? ''

      const located = await locateMessage(query, unreadOnly, position, action)
      if (!located.ok) return { arguments: { ...args }, outcome: located.outcome }
      const original = located.message

      let threadId = original.threadId
      if (threadId === null) {
        const looked = await invoke(
          SLUG.read,
          { message_id: original.id, user_id: 'me', format: 'full' },
          action
        )
        threadId = looked.ok
          ? (extractSingle(looked.data)?.threadId ?? null)
          : null
      }
      if (threadId === null) {
        const message = "I couldn't find that email."
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message,
            spokenResponse: message
          }
        }
      }

      const explicit = optionalString(args, 'recipient')
      let recipient: string | null
      if (explicit !== null) {
        const resolved = await resolveRecipient(explicit, action)
        if (!resolved.ok) {
          return { arguments: { ...args }, outcome: resolved.outcome }
        }
        recipient = resolved.email
      } else {
        recipient = senderEmail(original)
      }
      if (recipient === null) {
        const message = 'I need an email address to reply to.'
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message,
            spokenResponse: message
          }
        }
      }

      const count = await threadCount(threadId, action)
      const subject = original.subject
      const card: Record<string, unknown> = {
        kind: 'email_compose',
        mode: 'reply',
        title: 'Reply',
        to: [recipient],
        cc: [],
        bcc: [],
        subject,
        body,
        threadCount: count
      }
      const sender = original.sender === '' ? 'them' : original.sender
      return {
        arguments: {
          ...args,
          thread_id: threadId,
          recipient_email: recipient,
          message_body: body,
          subject,
          sender
        },
        message: `Reply to "${subject}" from ${sender}? Approval needed.`,
        display: recipient,
        card
      }
    },
    async run(args, ctx) {
      const action = 'reply to an email'
      const skipped = dryRun(ctx, action, 'gmail_reply_email')
      if (skipped !== null) return skipped

      const threadId = optionalString(args, 'thread_id')
      const recipient = parseEmailAddress(optionalString(args, 'recipient_email'))
      const body =
        optionalString(args, 'message_body') ??
        optionalString(args, 'message') ??
        ''
      if (threadId === null || recipient === null) {
        const message = "I couldn't find that email."
        return { status: 'error', action, message, spokenResponse: message }
      }

      const replied = await invoke(
        SLUG.reply,
        {
          user_id: 'me',
          thread_id: threadId,
          recipient_email: recipient,
          message_body: body
        },
        action
      )
      if (!replied.ok) return replied.outcome

      const sender = optionalString(args, 'sender') ?? recipient
      const subject = optionalString(args, 'subject') ?? 'no subject'
      const message = `Replied to "${subject}" from ${sender}.`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const createDraft: Tool = {
    spec: specFor(
      'gmail_create_draft',
      DRAFT_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description: "The recipient's email address."
          },
          subject: { type: 'string', description: 'The subject line.' },
          body: { type: 'string', description: 'The draft body.' }
        },
        ['recipient', 'subject', 'body']
      ),
      'write',
      true,
      'save an email draft'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'save an email draft'
      if (ctx.dryRun) return { arguments: { ...args } }

      const resolved = await resolveRecipient(
        optionalString(args, 'recipient'),
        action
      )
      if (!resolved.ok) {
        return { arguments: { ...args }, outcome: resolved.outcome }
      }
      const recipient = resolved.email
      const label = resolved.label

      const subject = optionalString(args, 'subject') ?? ''
      const body = optionalString(args, 'body') ?? ''
      const card: Record<string, unknown> = {
        kind: 'email_compose',
        mode: 'draft',
        title: 'New Message',
        to: [recipient],
        cc: [],
        bcc: [],
        subject,
        body,
        threadCount: null
      }
      return {
        arguments: { ...args, recipient_email: recipient, subject, body },
        message: `Save a draft to ${label} with subject "${subject}"? Approval needed.`,
        display: label,
        card
      }
    },
    async run(args, ctx) {
      const action = 'save an email draft'
      const skipped = dryRun(ctx, action, 'gmail_create_draft')
      if (skipped !== null) return skipped

      const recipient =
        parseEmailAddress(optionalString(args, 'recipient_email')) ??
        parseEmailAddress(optionalString(args, 'recipient'))
      if (recipient === null) {
        return { status: 'error', action, message: ASK_FOR_ADDRESS }
      }

      const subject = optionalString(args, 'subject') ?? ''
      const body = optionalString(args, 'body') ?? ''

      const created = await invoke(
        SLUG.draft,
        {
          user_id: 'me',
          recipient_email: recipient,
          subject,
          body,
          is_html: false
        },
        action
      )
      if (!created.ok) return created.outcome

      const message = `Saved a draft to ${recipient} with subject "${subject}".`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  return [listEmails, readEmail, sendEmail, replyEmail, createDraft]
}
