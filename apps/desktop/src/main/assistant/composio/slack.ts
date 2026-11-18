/**
 * Voice-facing Slack tools.
 *
 * Composio exposes Slack as a wide surface of raw tool slugs
 * (SLACK_SEND_MESSAGE, SLACK_FETCH_CONVERSATION_HISTORY, SLACK_OPEN_DM, ...).
 * Handing those slugs straight to the language model invites it to guess
 * parameter names and chain calls. These five tools instead present a small,
 * spoken-shaped contract: each one translates a single spoken request into the
 * one or two Composio calls it needs, so the model never sees Composio's raw
 * surface.
 *
 * Slack text is not markdown. The dictation is sent exactly as spoken, and
 * Slack's own markup is stripped only when a message is read aloud.
 */

import type { Tool, ToolContext, ToolOutcome, ToolPreparation } from '../types'
import type {
  NotchSlackCard,
  NotchSlackRecentMessage,
  NotchSlackTargetItem
} from '../../../shared/types'
import type { CallTool } from './support'
import {
  EMAIL,
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

export interface SlackChannel {
  readonly id: string
  /** Channel name without the leading `#`. */
  readonly name: string
}

export interface SlackUser {
  readonly id: string
  /** Display name, falling back to the handle or the id. */
  readonly name: string
  /** Slack handle, when the payload carries one. */
  readonly handle: string | null
  readonly email: string | null
}

export interface SlackMessage {
  readonly user: string | null
  readonly text: string
  readonly ts: string
  readonly threadTs: string | null
}

export interface SlackToolOptions {
  /** Calls one Composio tool by its exact slug over MCP. */
  callTool: CallTool
  /** Injectable for tests. Defaults to the host clock when used. */
  now?: () => Date
  /** IANA zone, e.g. 'Asia/Kolkata'. Defaults to the host zone when used. */
  timezone?: () => string
}

/** Composio slugs, kept in one place so no raw name leaks into a prompt. */
const SLUG = {
  send: 'SLACK_SEND_MESSAGE',
  schedule: 'SLACK_SCHEDULE_MESSAGE',
  history: 'SLACK_FETCH_CONVERSATION_HISTORY',
  thread: 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION',
  findChannels: 'SLACK_FIND_CHANNELS',
  listChannels: 'SLACK_LIST_ALL_CHANNELS',
  findUsers: 'SLACK_FIND_USERS',
  findUserByEmail: 'SLACK_FIND_USER_BY_EMAIL_ADDRESS',
  openDm: 'SLACK_OPEN_DM',
  reminder: 'SLACK_CREATE_A_REMINDER',
  userInfo: 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION'
} as const

/** A Slack conversation id: channel, DM, or group. */
const CHANNEL_ID = /^[CDG][A-Z0-9]{6,}$/
const USER_ID = /^[UWB][A-Z0-9]{6,}$/
const ISO_MOMENT =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

const MINUTE_MS = 60 * 1000
const READ_LIMIT = 20
const MAX_READ_LIMIT = 100
const SPOKEN_MESSAGE_LIMIT = 3
const SPOKEN_LINE_LIMIT = 120
const CONFIRM_LIMIT = 160

const NEED_EXACT_TIME = 'I need an exact date and time for that.'
const NEED_MESSAGE = 'I need the message text.'
const NEED_REMINDER = 'I need the reminder text.'
const ASK_SEND_TARGET = 'Who should I send it to? Name a channel or a person.'
const ASK_READ_TARGET = 'Which channel or person should I read?'
const ASK_DM_TARGET = 'Who should I open a direct message with?'

const SLACK_ERRORS: ReadonlyArray<readonly [string, string]> = [
  [
    'not_in_channel',
    "I'm not in that channel yet. Add me to it, then try again."
  ],
  ['channel_not_found', "I couldn't find that channel in Slack."],
  [
    'rate_limited',
    'Slack is rate limiting me right now. Wait a minute and try again.'
  ],
  [
    'cant_dm_this_user',
    "That person can't receive direct messages from me."
  ],
  [
    'invalid_auth',
    'Slack rejected the connection. Reconnect Slack in settings.'
  ],
  ['not_authed', 'Slack rejected the connection. Reconnect Slack in settings.']
]

/** The plain sentence a Slack error code stands for, or `null`. */
export function slackErrorText(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [code, plain] of SLACK_ERRORS) {
    if (lower.includes(code)) return plain
  }
  return null
}

/**
 * Turn Slack markup into words safe to speak. Formatting marks are removed,
 * channel and user references keep their readable label, and links keep their
 * label (or their URL when it is all they have).
 */
export function stripSlackMarkup(raw: string): string {
  return raw
    .replace(
      /<#([^>|]+)(?:\|([^>]+))?>/g,
      (_match, _id, label: string | undefined) =>
        label === undefined ? '#channel' : `#${label.replace(/^#/, '')}`
    )
    .replace(/<([^>|]+)\|([^>]+)>/g, (_match, _target, label: string) => label)
    .replace(/<(https?:\/\/[^>]+)>/g, (_match, url: string) => url)
    .replace(/<[^>]*>/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// --- pure parsing helpers (exported for tests) -------------------------

/** Unwrap `data.data` / `response` nests, so either shape parses. */
function unwrap(data: unknown): unknown {
  let value = data
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(value)) break
    const next =
      value['data'] !== undefined
        ? value['data']
        : value['response'] !== undefined
          ? value['response']
          : undefined
    if (next === undefined || typeof next === 'string') break
    value = next
  }
  return value
}

/** The first record array under one of `keys`, searched a few levels deep. */
function recordArray(
  value: unknown,
  keys: readonly string[],
  depth = 0
): Array<Record<string, unknown>> | null {
  if (depth > 3) return null
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return null
  for (const key of keys) {
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate.filter(isRecord)
  }
  for (const child of Object.values(value)) {
    const found = recordArray(child, keys, depth + 1)
    if (found !== null) return found
  }
  return null
}

function channelFrom(record: Record<string, unknown>): SlackChannel | null {
  const id =
    stringOf(record['id']) ??
    stringOf(record['channel_id']) ??
    stringOf(record['channelId'])
  if (id === null || !CHANNEL_ID.test(id)) return null
  const name =
    stringOf(record['name']) ??
    stringOf(record['channel_name']) ??
    stringOf(record['normalized_name']) ??
    ''
  return { id, name: name.replace(/^#/, '') }
}

function userFrom(record: Record<string, unknown>): SlackUser | null {
  const id =
    stringOf(record['id']) ??
    stringOf(record['user']) ??
    stringOf(record['user_id'])
  if (id === null || !USER_ID.test(id)) return null
  const profile = isRecord(record['profile']) ? record['profile'] : null
  const name =
    (profile === null ? null : stringOf(profile['display_name'])) ??
    stringOf(record['real_name']) ??
    (profile === null ? null : stringOf(profile['real_name'])) ??
    stringOf(record['name']) ??
    stringOf(record['username']) ??
    id
  return {
    id,
    name,
    handle: stringOf(record['name']) ?? stringOf(record['username']),
    email:
      (profile === null ? null : stringOf(profile['email'])) ??
      stringOf(record['email'])
  }
}

export function extractChannels(data: unknown): SlackChannel[] {
  const found =
    recordArray(unwrap(data), ['channels', 'items', 'results']) ?? []
  const channels: SlackChannel[] = []
  const seen = new Set<string>()
  for (const record of found) {
    const channel = channelFrom(record)
    if (channel === null || seen.has(channel.id)) continue
    seen.add(channel.id)
    channels.push(channel)
  }
  return channels
}

export function extractUsers(data: unknown): SlackUser[] {
  const found = recordArray(unwrap(data), [
    'members',
    'users',
    'items',
    'results'
  ])
  const users: SlackUser[] = []
  const seen = new Set<string>()
  for (const record of found ?? []) {
    const user = userFrom(record)
    if (user === null || seen.has(user.id)) continue
    seen.add(user.id)
    users.push(user)
  }
  if (users.length > 0) return users

  const single = singleUser(data)
  return single === null ? [] : [single]
}

/** The one user in a `{ user: { ... } }` payload, or `null`. */
function singleUser(data: unknown): SlackUser | null {
  const value = unwrap(data)
  if (!isRecord(value)) return null
  const direct = userFrom(value)
  if (direct !== null) return direct
  for (const key of ['user', 'member']) {
    const nested = value[key]
    if (!isRecord(nested)) continue
    const user = userFrom(nested)
    if (user !== null) return user
  }
  return null
}

export function extractMessages(data: unknown): SlackMessage[] {
  const found = recordArray(unwrap(data), ['messages', 'items', 'results']) ?? []
  const messages: SlackMessage[] = []
  for (const record of found) {
    const text = stringOf(record['text'])
    if (text === null) continue
    messages.push({
      user:
        stringOf(record['user']) ??
        stringOf(record['user_id']) ??
        null,
      text,
      ts: stringOf(record['ts']) ?? stringOf(record['timestamp']) ?? '',
      threadTs: stringOf(record['thread_ts'])
    })
  }
  return messages
}

/** Newest first, by Slack's own timestamp. Unknown times keep their order. */
export function sortMessages(
  messages: readonly SlackMessage[]
): SlackMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const left = Number(a.message.ts)
      const right = Number(b.message.ts)
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
        return right - left
      }
      return a.index - b.index
    })
    .map((entry) => entry.message)
}

/** The channel id inside a `conversations.open` response, or `null`. */
function dmId(data: unknown): string | null {
  const value = unwrap(data)
  if (typeof value === 'string') {
    return /^D[A-Z0-9]{6,}$/.test(value) ? value : null
  }
  if (isRecord(value)) {
    for (const key of ['channel', 'channel_id', 'id']) {
      const found = stringOf(value[key])
      if (found !== null && /^D[A-Z0-9]{6,}$/.test(found)) return found
    }
    for (const child of Object.values(value)) {
      const found = dmId(child)
      if (found !== null) return found
    }
  }
  return null
}

/** The channel and timestamp a send result reports, when it reports them. */
function sendResult(data: unknown): {
  channel: string | null
  ts: string | null
} {
  const value = unwrap(data)
  if (!isRecord(value)) return { channel: null, ts: null }
  const channelField = value['channel']
  const channel =
    typeof channelField === 'string'
      ? channelField
      : isRecord(channelField)
        ? stringOf(channelField['id'])
        : (stringOf(value['channel_id']) ?? null)
  const message = value['message']
  const ts =
    stringOf(value['ts']) ??
    stringOf(value['message_ts']) ??
    (isRecord(message) ? stringOf(message['ts']) : null)
  return { channel, ts }
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[#@]/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function channelLabel(channel: SlackChannel): string {
  const name = channel.name.trim()
  return name === '' ? channel.id : `#${name}`
}

/** A spoken sentence for a Slack code, or `null` when it is not one. */
function dataErrorCode(data: unknown): string | null {
  const value = unwrap(data)
  if (!isRecord(value)) return null
  if (value['ok'] !== false) return null
  const error = value['error']
  if (typeof error === 'string') return error
  if (isRecord(error)) {
    return (
      stringOf(error['message']) ??
      stringOf(error['error']) ??
      'Slack returned an error.'
    )
  }
  return 'Slack returned an error.'
}

function failure(code: string, action: string): ToolOutcome {
  const plain =
    slackErrorText(code) ??
    (code.startsWith('Slack returned')
      ? code
      : `Slack returned an error: ${code}`)
  return { status: 'error', action, message: plain, spokenResponse: plain }
}

function slackFailure(outcome: ToolOutcome, action: string): ToolOutcome {
  const plain = slackErrorText(outcome.message)
  if (plain === null) return outcome
  return { status: 'error', action, message: plain, spokenResponse: plain }
}

function hostZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function describeWhen(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

// --- tools -------------------------------------------------------------

interface SlackTarget {
  readonly id: string
  /** What the user hears: `#design` or `Sarah Lee`. */
  readonly label: string
}

type TargetResult =
  | { ok: true; target: SlackTarget }
  | { ok: false; outcome: ToolOutcome }

type TimeResult =
  | { ok: true; date: Date; seconds: string }
  | { ok: false }

interface ResolveOptions {
  readonly ask: string
  /** Open a DM with a person only; never look for a channel. */
  readonly personOnly?: boolean
}

const SEND_DESCRIPTION =
  'Send a Slack message to a channel or a person as a direct message.'

const SCHEDULE_DESCRIPTION =
  'Schedule a Slack message to a channel or person for an exact ISO 8601 time.'

const READ_DESCRIPTION =
  'Read the newest messages in a Slack channel or direct message, or one thread.'

const DM_DESCRIPTION = 'Open a direct message with a person in Slack.'

const REMINDER_DESCRIPTION =
  'Create a Slack reminder from the text and an exact ISO 8601 time.'

export function createSlackTools(options: SlackToolOptions): Tool[] {
  const zone = options.timezone ?? hostZone
  const invoke = createInvoker(
    options.callTool,
    'Slack returned an error.',
    'Slack'
  )

  function currentTime(ctx: ToolContext): Date {
    return options.now?.() ?? ctx.clock()
  }

  /** Unix seconds from an exact ISO moment, or from a minute delay. */
  function resolveMoment(
    when: string | null,
    delayMinutes: number | null,
    now: Date
  ): TimeResult {
    if (
      delayMinutes !== null &&
      Number.isFinite(delayMinutes) &&
      delayMinutes >= 0
    ) {
      const date = new Date(
        now.getTime() + Math.trunc(delayMinutes) * MINUTE_MS
      )
      return {
        ok: true,
        date,
        seconds: String(Math.floor(date.getTime() / 1000))
      }
    }
    if (when === null) return { ok: false }
    const trimmed = when.trim()
    if (!ISO_MOMENT.test(trimmed)) return { ok: false }
    const date = new Date(trimmed)
    if (Number.isNaN(date.getTime())) return { ok: false }
    return {
      ok: true,
      date,
      seconds: String(Math.floor(date.getTime() / 1000))
    }
  }

  /** Search channels, falling back to the full list when the search errors. */
  async function findChannels(
    query: string,
    action: string
  ): Promise<
    { ok: true; channels: SlackChannel[] } | { ok: false; outcome: ToolOutcome }
  > {
    const searched = await invoke(SLUG.findChannels, { query }, action)
    const searchProblem = searched.ok ? dataErrorCode(searched.data) : null
    if (searched.ok && searchProblem === null) {
      return { ok: true, channels: extractChannels(searched.data) }
    }

    const listed = await invoke(SLUG.listChannels, {}, action)
    if (!listed.ok) {
      if (!searched.ok) {
        return { ok: false, outcome: slackFailure(searched.outcome, action) }
      }
      return {
        ok: false,
        outcome: failure(searchProblem ?? 'Slack returned an error.', action)
      }
    }
    const listProblem = dataErrorCode(listed.data)
    if (listProblem !== null) {
      return { ok: false, outcome: failure(listProblem, action) }
    }
    const wanted = normaliseName(query)
    return {
      ok: true,
      channels: extractChannels(listed.data).filter((channel) =>
        normaliseName(channel.name).includes(wanted)
      )
    }
  }

  async function findUsers(
    query: string,
    action: string
  ): Promise<
    { ok: true; users: SlackUser[] } | { ok: false; outcome: ToolOutcome }
  > {
    const trimmed = query.trim()
    const found = EMAIL.test(trimmed)
      ? await invoke(SLUG.findUserByEmail, { email: trimmed }, action)
      : await invoke(SLUG.findUsers, { query: trimmed.replace(/^@/, '') }, action)
    if (!found.ok) {
      return { ok: false, outcome: slackFailure(found.outcome, action) }
    }
    const code = dataErrorCode(found.data)
    if (code !== null) return { ok: false, outcome: failure(code, action) }
    return { ok: true, users: extractUsers(found.data) }
  }

  function ambiguous(
    raw: string,
    labels: readonly string[],
    action: string
  ): ToolOutcome {
    const message =
      `I found more than one match for "${raw}": ${labels
        .slice(0, 3)
        .join(', ')}. Which one?`
    return { status: 'error', action, message, spokenResponse: message }
  }

  function chosenChannel(
    channels: readonly SlackChannel[],
    query: string
  ): SlackChannel | SlackChannel[] {
    const wanted = normaliseName(query)
    const exact = channels.filter(
      (channel) => normaliseName(channel.name) === wanted
    )
    if (exact.length === 1) return exact[0]
    if (channels.length === 1) return channels[0]
    return exact.length > 1 ? exact : [...channels]
  }

  async function resolvePerson(
    raw: string,
    action: string
  ): Promise<TargetResult> {
    const trimmed = raw.trim()
    const searched = await findUsers(trimmed, action)
    if (!searched.ok) return searched

    const users = searched.users
    if (users.length === 0) {
      const message = EMAIL.test(trimmed)
        ? "I couldn't find a Slack user with that email address."
        : `I couldn't find a Slack user called "${trimmed}".`
      return {
        ok: false,
        outcome: { status: 'error', action, message, spokenResponse: message }
      }
    }

    const wanted = normaliseName(trimmed)
    const exact = users.filter(
      (user) =>
        normaliseName(user.name) === wanted ||
        (user.handle !== null && normaliseName(user.handle) === wanted)
    )
    const chosen =
      exact.length === 1 ? exact[0] : users.length === 1 ? users[0] : null
    if (chosen === null) {
      return {
        ok: false,
        outcome: ambiguous(
          trimmed,
          users.map((user) => user.name),
          action
        )
      }
    }

    const opened = await invoke(SLUG.openDm, { users: chosen.id }, action)
    if (!opened.ok) {
      return {
        ok: false,
        outcome: slackFailure(opened.outcome, action)
      }
    }
    const code = dataErrorCode(opened.data)
    if (code !== null) return { ok: false, outcome: failure(code, action) }

    const id = dmId(opened.data)
    if (id === null) {
      const message = `I couldn't open a direct message with ${chosen.name}.`
      return {
        ok: false,
        outcome: { status: 'error', action, message, spokenResponse: message }
      }
    }
    return { ok: true, target: { id, label: chosen.name } }
  }

  async function resolveTarget(
    raw: string,
    action: string,
    resolveOptions: ResolveOptions
  ): Promise<TargetResult> {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return {
        ok: false,
        outcome: {
          status: 'error',
          action,
          message: resolveOptions.ask,
          spokenResponse: resolveOptions.ask
        }
      }
    }

    // A conversation id is used exactly as given.
    if (CHANNEL_ID.test(trimmed)) {
      return { ok: true, target: { id: trimmed, label: trimmed } }
    }

    if (resolveOptions.personOnly !== true) {
      const channelIntent = trimmed.startsWith('#')
      const wanted = channelIntent ? trimmed.slice(1).trim() : trimmed
      const found = await findChannels(wanted, action)
      if (!found.ok) return found

      if (found.channels.length > 0) {
        const picked = chosenChannel(found.channels, wanted)
        if (Array.isArray(picked)) {
          return {
            ok: false,
            outcome: ambiguous(
              trimmed,
              picked.map((channel) => channelLabel(channel)),
              action
            )
          }
        }
        return { ok: true, target: { id: picked.id, label: channelLabel(picked) } }
      }

      if (channelIntent) {
        const message = `I couldn't find a Slack channel called "${trimmed}".`
        return {
          ok: false,
          outcome: { status: 'error', action, message, spokenResponse: message }
        }
      }
    }

    const personOnly = resolveOptions.personOnly === true
    const resolved = await resolvePerson(trimmed, action)
    if (!resolved.ok && personOnly) return resolved
    if (!resolved.ok && !EMAIL.test(trimmed)) {
      // A bare name that is neither a channel nor a person gets one sentence.
      const searched = resolved.outcome.message
      if (searched.includes('Slack user')) {
        const message =
          `I couldn't find a Slack channel or person called "${trimmed}".`
        return {
          ok: false,
          outcome: { status: 'error', action, message, spokenResponse: message }
        }
      }
    }
    return resolved
  }

  /** The target already resolved by `prepare`, or a fresh lookup. */
  async function targetFromArgs(
    args: Record<string, unknown>,
    action: string,
    resolveOptions: ResolveOptions
  ): Promise<TargetResult> {
    const prepared = optionalString(args, 'channel')
    if (prepared !== null && CHANNEL_ID.test(prepared.trim())) {
      const id = prepared.trim()
      const label = optionalString(args, 'target_label') ?? id
      return { ok: true, target: { id, label } }
    }
    const recipient =
      optionalString(args, 'recipient') ?? optionalString(args, 'target') ?? ''
    return resolveTarget(recipient, action, resolveOptions)
  }

  /** One send call, with Slack's own error codes turned into speech. */
  async function postMessage(
    target: SlackTarget,
    message: string,
    threadTs: string | null,
    action: string
  ): Promise<
    | { ok: true; channel: string | null; ts: string | null }
    | { ok: false; outcome: ToolOutcome }
  > {
    const callArgs: Record<string, unknown> = {
      channel: target.id,
      markdown_text: message
    }
    if (threadTs !== null) callArgs['thread_ts'] = threadTs

    const sent = await invoke(SLUG.send, callArgs, action)
    if (!sent.ok) {
      return { ok: false, outcome: slackFailure(sent.outcome, action) }
    }
    const code = dataErrorCode(sent.data)
    if (code !== null) return { ok: false, outcome: failure(code, action) }
    return { ok: true, ...sendResult(sent.data) }
  }

  async function nameFor(userId: string, action: string): Promise<string | null> {
    const info = await invoke(SLUG.userInfo, { user: userId }, action)
    if (!info.ok) return null
    return singleUser(info.data)?.name ?? null
  }

  const sendMessage: Tool = {
    spec: specFor(
      'slack_send_message',
      SEND_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description:
              'The channel name, channel id, or person name to send to.'
          },
          message: {
            type: 'string',
            description: 'The message text, exactly as the user said it.'
          },
          thread_ts: {
            type: 'string',
            description: 'Reply in this thread instead of the channel, optional.'
          }
        },
        ['recipient', 'message']
      ),
      'write',
      true,
      'send a Slack message'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'send a Slack message'
      if (ctx.dryRun) return { arguments: { ...args } }

      const message = optionalString(args, 'message')
      if (message === null) {
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message: NEED_MESSAGE,
            spokenResponse: NEED_MESSAGE
          }
        }
      }

      const resolved = await resolveTarget(
        optionalString(args, 'recipient') ?? '',
        action,
        { ask: ASK_SEND_TARGET }
      )
      if (!resolved.ok) {
        return { arguments: { ...args }, outcome: resolved.outcome }
      }

      const card: NotchSlackCard = {
        kind: 'slack_message',
        mode: 'send',
        target: resolved.target.label,
        message,
        when: null,
        channelId: resolved.target.id,
        isDm: resolved.target.id.startsWith('D'),
        threadTs: optionalString(args, 'thread_ts')
      }
      const short = truncate(message, CONFIRM_LIMIT)
      return {
        arguments: {
          ...args,
          recipient: optionalString(args, 'recipient') ?? resolved.target.label,
          channel: resolved.target.id,
          target_label: resolved.target.label,
          message
        },
        message: `Send "${short}" to ${resolved.target.label}? Approval needed.`,
        display: resolved.target.label,
        card: card as unknown as Record<string, unknown>
      }
    },
    applyEdits(args, edits): Record<string, unknown> {
      return applySlackEdits(args, edits)
    },
    async run(args, ctx) {
      const action = 'send a Slack message'
      const skipped = dryRun(ctx, action, 'slack_send_message')
      if (skipped !== null) return skipped

      const message = optionalString(args, 'message')
      if (message === null) {
        return { status: 'error', action, message: NEED_MESSAGE }
      }

      const resolved = await targetFromArgs(args, action, {
        ask: ASK_SEND_TARGET
      })
      if (!resolved.ok) return resolved.outcome

      const threadTs = optionalString(args, 'thread_ts')
      const sent = await postMessage(
        resolved.target,
        message,
        threadTs,
        action
      )
      if (!sent.ok) return sent.outcome

      const threadNote = threadTs === null ? '' : ' as a thread reply'
      const message2 = `Sent to ${resolved.target.label}${threadNote}.`
      return {
        status: 'ok',
        action,
        message: message2,
        spokenResponse: truncate(message2, SPOKEN_LIMIT),
        target: sent.channel ?? resolved.target.id,
        results: [{ channel: sent.channel, ts: sent.ts }]
      }
    }
  }

  const scheduleMessage: Tool = {
    spec: specFor(
      'slack_schedule_message',
      SCHEDULE_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description:
              'The channel name, channel id, or person name to send to.'
          },
          message: {
            type: 'string',
            description: 'The message text, exactly as the user said it.'
          },
          when: {
            type: 'string',
            description: 'When to send it, as an exact ISO 8601 datetime.'
          },
          delay_minutes: {
            type: 'integer',
            description: 'Send this many minutes from now instead of `when`.'
          },
          thread_ts: {
            type: 'string',
            description: 'Reply in this thread instead of the channel, optional.'
          }
        },
        ['recipient', 'message', 'when']
      ),
      'write',
      true,
      'schedule a Slack message'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'schedule a Slack message'
      if (ctx.dryRun) return { arguments: { ...args } }

      const message = optionalString(args, 'message')
      if (message === null) {
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message: NEED_MESSAGE,
            spokenResponse: NEED_MESSAGE
          }
        }
      }

      const moment = resolveMoment(
        optionalString(args, 'when'),
        optionalInteger(args, 'delay_minutes'),
        currentTime(ctx)
      )
      if (!moment.ok) {
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message: NEED_EXACT_TIME,
            spokenResponse: NEED_EXACT_TIME
          }
        }
      }

      const resolved = await resolveTarget(
        optionalString(args, 'recipient') ?? '',
        action,
        { ask: ASK_SEND_TARGET }
      )
      if (!resolved.ok) {
        return { arguments: { ...args }, outcome: resolved.outcome }
      }

      const when = describeWhen(moment.date, zone())
      const card: NotchSlackCard = {
        kind: 'slack_message',
        mode: 'schedule',
        target: resolved.target.label,
        message,
        when,
        channelId: resolved.target.id,
        isDm: resolved.target.id.startsWith('D'),
        threadTs: optionalString(args, 'thread_ts')
      }
      const short = truncate(message, CONFIRM_LIMIT)
      return {
        arguments: {
          ...args,
          recipient: optionalString(args, 'recipient') ?? resolved.target.label,
          channel: resolved.target.id,
          target_label: resolved.target.label,
          message
        },
        message: `Send "${short}" to ${resolved.target.label} on ${when}? Approval needed.`,
        display: resolved.target.label,
        card: card as unknown as Record<string, unknown>
      }
    },
    applyEdits(args, edits): Record<string, unknown> {
      return applySlackEdits(args, edits)
    },
    async run(args, ctx) {
      const action = 'schedule a Slack message'
      const skipped = dryRun(ctx, action, 'slack_schedule_message')
      if (skipped !== null) return skipped

      const message = optionalString(args, 'message')
      if (message === null) {
        return { status: 'error', action, message: NEED_MESSAGE }
      }
      const moment = resolveMoment(
        optionalString(args, 'when'),
        optionalInteger(args, 'delay_minutes'),
        currentTime(ctx)
      )
      if (!moment.ok) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }

      const resolved = await targetFromArgs(args, action, {
        ask: ASK_SEND_TARGET
      })
      if (!resolved.ok) return resolved.outcome

      const callArgs: Record<string, unknown> = {
        channel: resolved.target.id,
        markdown_text: message,
        post_at: moment.seconds
      }
      const threadTs = optionalString(args, 'thread_ts')
      if (threadTs !== null) callArgs['thread_ts'] = threadTs

      const scheduled = await invoke(SLUG.schedule, callArgs, action)
      if (!scheduled.ok) return slackFailure(scheduled.outcome, action)
      const code = dataErrorCode(scheduled.data)
      if (code !== null) return failure(code, action)

      const when = describeWhen(moment.date, zone())
      const message2 = `Scheduled a message to ${resolved.target.label} for ${when}.`
      return {
        status: 'ok',
        action,
        message: message2,
        spokenResponse: truncate(message2, SPOKEN_LIMIT),
        target: resolved.target.id
      }
    }
  }

  const readMessages: Tool = {
    spec: specFor(
      'slack_read_messages',
      READ_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description:
              'The channel name, channel id, or person name to read.'
          },
          thread_ts: {
            type: 'string',
            description: 'Read this thread instead of the whole channel, optional.'
          },
          limit: {
            type: 'integer',
            description: 'How many messages to read. Defaults to 20.'
          }
        },
        ['recipient']
      ),
      'read',
      false,
      'read Slack messages'
    ),
    async run(args, ctx) {
      const action = 'read Slack messages'
      const skipped = dryRun(ctx, action, 'slack_read_messages')
      if (skipped !== null) return skipped

      const resolved = await targetFromArgs(args, action, {
        ask: ASK_READ_TARGET
      })
      if (!resolved.ok) return resolved.outcome

      const requested = optionalInteger(args, 'limit') ?? READ_LIMIT
      const limit = Math.min(
        MAX_READ_LIMIT,
        Math.max(1, Math.trunc(requested))
      )
      const threadTs = optionalString(args, 'thread_ts')

      const fetched =
        threadTs === null
          ? await invoke(
              SLUG.history,
              { channel: resolved.target.id, limit },
              action
            )
          : await invoke(
              SLUG.thread,
              { channel: resolved.target.id, ts: threadTs, limit },
              action
            )
      if (!fetched.ok) return slackFailure(fetched.outcome, action)
      const code = dataErrorCode(fetched.data)
      if (code !== null) return failure(code, action)

      const messages = sortMessages(extractMessages(fetched.data)).slice(
        0,
        limit
      )
      if (messages.length === 0) {
        const message = `There are no messages in ${resolved.target.label}.`
        return { status: 'ok', action, message, spokenResponse: message }
      }

      const userIds: string[] = []
      for (const message of messages) {
        if (message.user !== null && !userIds.includes(message.user)) {
          userIds.push(message.user)
        }
      }
      const names = new Map<string, string>()
      for (const id of userIds) {
        const name = await nameFor(id, action)
        if (name !== null) names.set(id, name)
      }

      const rows = messages.map((message) => ({
        sender:
          message.user === null
            ? 'Someone'
            : (names.get(message.user) ?? message.user),
        text: message.text,
        timestamp: message.ts,
        thread_ts: message.threadTs
      }))

      const lines = rows.map((row) => `${row.sender}: ${row.text}`)
      const body = `${resolved.target.label}: ${rows.length} ${
        rows.length === 1 ? 'message' : 'messages'
      }\n${lines.join('\n')}`

      const spokenRows = rows
        .slice(0, SPOKEN_MESSAGE_LIMIT)
        .map(
          (row) =>
            `${row.sender} said ${truncate(
              stripSlackMarkup(row.text),
              SPOKEN_LINE_LIMIT
            )}`
        )
      const more =
        rows.length > SPOKEN_MESSAGE_LIMIT
          ? ` And ${rows.length - SPOKEN_MESSAGE_LIMIT} more.`
          : ''
      const spoken = `Newest messages in ${resolved.target.label}: ${spokenRows.join(
        '; '
      )}.${more}`

      return {
        status: 'ok',
        action,
        message:
          body.length <= MESSAGE_LIMIT
            ? body
            : `${body.slice(0, MESSAGE_LIMIT).trimEnd()}...`,
        spokenResponse: truncate(spoken, SPOKEN_LIMIT),
        target: resolved.target.id,
        results: rows
      }
    }
  }

  const openDm: Tool = {
    spec: specFor(
      'slack_open_dm',
      DM_DESCRIPTION,
      objectSchema(
        {
          recipient: {
            type: 'string',
            description: 'The person to open a direct message with.'
          }
        },
        ['recipient']
      ),
      'read',
      false,
      'open a Slack DM'
    ),
    async run(args, ctx) {
      const action = 'open a Slack DM'
      const skipped = dryRun(ctx, action, 'slack_open_dm')
      if (skipped !== null) return skipped

      const resolved = await resolveTarget(
        optionalString(args, 'recipient') ?? '',
        action,
        { ask: ASK_DM_TARGET, personOnly: true }
      )
      if (!resolved.ok) return resolved.outcome

      const message = `Opened a direct message with ${resolved.target.label}.`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(message, SPOKEN_LIMIT),
        target: resolved.target.id,
        results: [{ id: resolved.target.id, name: resolved.target.label }]
      }
    }
  }

  const createReminder: Tool = {
    spec: specFor(
      'slack_reminder',
      REMINDER_DESCRIPTION,
      objectSchema(
        {
          text: {
            type: 'string',
            description: 'What to be reminded about, exactly as the user said it.'
          },
          when: {
            type: 'string',
            description: 'When to remind, as an exact ISO 8601 datetime.'
          },
          delay_minutes: {
            type: 'integer',
            description: 'Remind this many minutes from now instead of `when`.'
          }
        },
        ['text', 'when']
      ),
      'write',
      true,
      'set a Slack reminder'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'set a Slack reminder'
      if (ctx.dryRun) return { arguments: { ...args } }

      const text =
        optionalString(args, 'text') ?? optionalString(args, 'message')
      if (text === null) {
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message: NEED_REMINDER,
            spokenResponse: NEED_REMINDER
          }
        }
      }

      const moment = resolveMoment(
        optionalString(args, 'when'),
        optionalInteger(args, 'delay_minutes'),
        currentTime(ctx)
      )
      if (!moment.ok) {
        return {
          arguments: { ...args },
          outcome: {
            status: 'error',
            action,
            message: NEED_EXACT_TIME,
            spokenResponse: NEED_EXACT_TIME
          }
        }
      }

      const when = describeWhen(moment.date, zone())
      const card: NotchSlackCard = {
        kind: 'slack_message',
        mode: 'reminder',
        target: 'Slack',
        message: text,
        when
      }
      const short = truncate(text, CONFIRM_LIMIT)
      return {
        arguments: { ...args, text, message: text },
        message: `Set a Slack reminder "${short}" for ${when}? Approval needed.`,
        display: short,
        card: card as unknown as Record<string, unknown>
      }
    },
    applyEdits(args, edits): Record<string, unknown> {
      return applySlackEdits(args, edits)
    },
    async run(args, ctx) {
      const action = 'set a Slack reminder'
      const skipped = dryRun(ctx, action, 'slack_reminder')
      if (skipped !== null) return skipped

      const text =
        optionalString(args, 'text') ?? optionalString(args, 'message')
      if (text === null) {
        return { status: 'error', action, message: NEED_REMINDER }
      }
      const moment = resolveMoment(
        optionalString(args, 'when'),
        optionalInteger(args, 'delay_minutes'),
        currentTime(ctx)
      )
      if (!moment.ok) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }

      const created = await invoke(
        SLUG.reminder,
        { text, time: moment.seconds },
        action
      )
      if (!created.ok) return slackFailure(created.outcome, action)
      const code = dataErrorCode(created.data)
      if (code !== null) return failure(code, action)

      const when = describeWhen(moment.date, zone())
      const message = `Set a Slack reminder for ${when}.`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  return [sendMessage, scheduleMessage, readMessages, openDm, createReminder]
}

/** Fold card edits into the prepared arguments, ignoring malformed fields. */
function applySlackEdits(
  args: Record<string, unknown>,
  edits: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...args }

  const message = stringOf(edits['message']) ?? stringOf(edits['text'])
  if (message !== null) {
    next['message'] = message
    next['text'] = message
  }

  const target = stringOf(edits['target']) ?? stringOf(edits['recipient'])
  if (target !== null) {
    next['recipient'] = target
    // A new target must be resolved again before sending.
    delete next['channel']
    delete next['target_label']
  }

  const when = stringOf(edits['when'])
  if (when !== null && ISO_MOMENT.test(when.trim())) {
    next['when'] = when
  }

  const delay = optionalInteger(edits, 'delay_minutes')
  if (delay !== null && Number.isInteger(delay) && delay >= 0) {
    next['delay_minutes'] = delay
  }

  return next
}

function extractAvatar(record: Record<string, unknown>): string | undefined {
  const profile = isRecord(record['profile']) ? record['profile'] : null
  if (profile) {
    const avatar =
      stringOf(profile['image_72']) ??
      stringOf(profile['image_48']) ??
      stringOf(profile['image_192']) ??
      stringOf(profile['image_512']) ??
      stringOf(profile['avatar_hash']) ??
      stringOf(profile['image_original'])
    if (avatar) return avatar
  }
  const direct =
    stringOf(record['image_72']) ??
    stringOf(record['image_48']) ??
    stringOf(record['avatar'])
  return direct ?? undefined
}

function userNameFromRecord(
  record: Record<string, unknown>,
  fallbackId: string
): string {
  const profile = isRecord(record['profile']) ? record['profile'] : null
  return (
    (profile === null ? null : stringOf(profile['display_name'])) ??
    stringOf(record['real_name']) ??
    (profile === null ? null : stringOf(profile['real_name'])) ??
    stringOf(record['name']) ??
    stringOf(record['username']) ??
    fallbackId
  )
}

function userRecordFromData(data: unknown): Record<string, unknown> | null {
  const value = unwrap(data)
  if (!isRecord(value)) return null
  if (isRecord(value['user'])) return value['user'] as Record<string, unknown>
  if (isRecord(value['member'])) return value['member'] as Record<string, unknown>
  return value
}

export async function fetchSlackRecentMessages(
  callTool: CallTool,
  channelId: string,
  threadTs?: string | null,
  limit?: number
): Promise<{
  success: boolean
  messages: NotchSlackRecentMessage[]
  users: Record<string, { name: string; avatar?: string }>
}> {
  try {
    const hasThread = typeof threadTs === 'string' && threadTs.trim().length > 0
    const slug = hasThread ? SLUG.thread : SLUG.history
    const args: Record<string, unknown> = { channel: channelId }
    if (hasThread) {
      args['ts'] = threadTs.trim()
    }
    const fetchLimit = limit ?? (hasThread ? 4 : 5)
    args['limit'] = Math.max(fetchLimit, 10)

    const response = await callTool(slug, args)
    if (response.isError) {
      return { success: false, messages: [], users: {} }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(response.text)
    } catch {
      return { success: false, messages: [], users: {} }
    }

    const messages = extractMessages(parsed)
    const sortedNewest = sortMessages(messages)
    const count = limit ?? (hasThread ? 4 : 5)
    const pickedNewest = sortedNewest.slice(0, count)
    const oldestToNewest = [...pickedNewest].reverse()

    const users: Record<string, { name: string; avatar?: string }> = {}
    const userIds = Array.from(
      new Set(oldestToNewest.map((m) => m.user).filter((u): u is string => Boolean(u)))
    )

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const userRes = await callTool(SLUG.userInfo, { user: uid })
          if (!userRes.isError) {
            const userJson = JSON.parse(userRes.text)
            const userRecord = userRecordFromData(userJson)
            if (userRecord) {
              const name = userNameFromRecord(userRecord, uid)
              const avatar = extractAvatar(userRecord)
              users[uid] = { name, avatar }
            }
          }
        } catch {
          // Gracefully continue
        }
      })
    )

    const formattedMessages: NotchSlackRecentMessage[] = oldestToNewest.map((m) => {
      const userInfo = m.user ? users[m.user] : undefined
      return {
        user: m.user,
        username: userInfo?.name ?? null,
        text: m.text,
        ts: m.ts,
        avatar: userInfo?.avatar
      }
    })

    return {
      success: true,
      messages: formattedMessages,
      users
    }
  } catch {
    return { success: false, messages: [], users: {} }
  }
}

export async function fetchSlackTargets(
  callTool: CallTool
): Promise<{ success: boolean; targets: NotchSlackTargetItem[] }> {
  try {
    const targets: NotchSlackTargetItem[] = []
    const seen = new Set<string>()
    let anySuccess = false

    try {
      let chanRes = await callTool(SLUG.listChannels, {})
      if (chanRes.isError) {
        chanRes = await callTool(SLUG.findChannels, { query: '' })
      }
      if (!chanRes.isError) {
        anySuccess = true
        const parsed = JSON.parse(chanRes.text)
        const found = recordArray(unwrap(parsed), ['channels', 'items', 'results']) ?? []
        for (const record of found) {
          const id =
            stringOf(record['id']) ??
            stringOf(record['channel_id']) ??
            stringOf(record['channelId'])
          if (id === null || !CHANNEL_ID.test(id) || seen.has(id)) continue
          seen.add(id)
          const name =
            stringOf(record['name']) ??
            stringOf(record['channel_name']) ??
            stringOf(record['normalized_name']) ??
            ''
          const isPrivate =
            record['is_private'] === true ||
            record['isPrivate'] === true ||
            record['is_group'] === true
          targets.push({
            id,
            name: name.replace(/^#/, ''),
            type: 'channel',
            isPrivate
          })
        }
      }
    } catch {
      // Continue to users
    }

    try {
      const userRes = await callTool(SLUG.findUsers, { query: '' })
      if (!userRes.isError) {
        anySuccess = true
        const parsed = JSON.parse(userRes.text)
        const found =
          recordArray(unwrap(parsed), ['members', 'users', 'items', 'results']) ?? []
        for (const record of found) {
          const id =
            stringOf(record['id']) ??
            stringOf(record['user']) ??
            stringOf(record['user_id'])
          if (id === null || !USER_ID.test(id) || seen.has(id)) continue
          seen.add(id)
          const name = userNameFromRecord(record, id)
          const avatar = extractAvatar(record)
          targets.push({
            id,
            name,
            type: 'dm',
            avatar
          })
        }
      }
    } catch {
      // Best effort
    }

    return {
      success: anySuccess,
      targets
    }
  } catch {
    return { success: false, targets: [] }
  }
}
