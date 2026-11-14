/**
 * Voice-facing Google Calendar tools.
 *
 * Composio exposes Google Calendar as a wide surface of raw tool slugs
 * (GOOGLECALENDAR_EVENTS_LIST, GOOGLECALENDAR_PATCH_EVENT, ...). Handing
 * those slugs straight to the language model invites it to guess parameter
 * names and chain calls. These four tools instead present a small,
 * spoken-shaped contract: each one translates a single spoken request into
 * the one or two Composio calls it needs, so the model never sees Composio's
 * raw surface.
 */

import type { Tool, ToolContext, ToolOutcome, ToolPreparation } from '../types'
import type { NotchCalendarCard } from '../../../shared/types'
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

export interface CalendarEvent {
  readonly id: string
  readonly summary: string
  /** ISO 8601, as returned by Google. */
  readonly start: string
  readonly end: string | null
  readonly location?: string
}

export interface CalendarToolOptions {
  /** Calls one Composio tool by its exact slug over MCP. */
  callTool(
    slug: string,
    args: Record<string, unknown>
  ): Promise<{ text: string; isError: boolean }>
  /** Injectable for tests. Defaults to `() => new Date()`. */
  now?: () => Date
  /** IANA zone, e.g. 'Asia/Kolkata'. Defaults to the host zone. */
  timezone?: () => string
}

/** Composio slugs, kept in one place so no raw name leaks into a prompt. */
const SLUG = {
  list: 'GOOGLECALENDAR_EVENTS_LIST',
  create: 'GOOGLECALENDAR_CREATE_EVENT',
  patch: 'GOOGLECALENDAR_PATCH_EVENT',
  remove: 'GOOGLECALENDAR_DELETE_EVENT'
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const EVENT_LIMIT = 250
const SPOKEN_EVENT_LIMIT = 5

const NEED_EXACT_TIME = 'I need an exact date and time for that.'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const STOP_WORDS = new Set([
  'the',
  'my',
  'a',
  'an',
  'at',
  'on',
  'for',
  'of',
  'to',
  'in',
  'and',
  'with',
  'meeting',
  'event',
  'calendar',
  'please',
  'can',
  'you'
])

const ISO_MOMENT =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

const CLOCK_IN_QUERY = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/

interface Moment {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly weekday: string
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function hostZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function zoneParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const out: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = part.value
  }
  if (out['hour'] === '24') out['hour'] = '00'
  return out
}

function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = zoneParts(date, timeZone)
  const asUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second'])
  )
  return Math.round((asUtc - date.getTime()) / MINUTE_MS)
}

/** RFC3339 with the explicit offset of `timeZone`, e.g. `...+05:30`. */
function rfc3339(date: Date, timeZone: string): string {
  const parts = zoneParts(date, timeZone)
  const offset = zoneOffsetMinutes(date, timeZone)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return (
    `${parts['year']}-${parts['month']}-${parts['day']}` +
    `T${parts['hour']}:${parts['minute']}:${parts['second']}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  )
}

function formatClock(hour24: number, minute: number): string {
  const meridiem = hour24 >= 12 ? 'PM' : 'AM'
  let hour = hour24 % 12
  if (hour === 0) hour = 12
  return `${hour}:${pad2(minute)} ${meridiem}`
}

function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

function parseMoment(iso: string, timeZone: string): Moment | null {
  const trimmed = iso.trim()
  if (trimmed === '') return null
  const match = ISO_MOMENT.exec(trimmed)
  if (match === null) {
    const fallback = new Date(trimmed)
    if (Number.isNaN(fallback.getTime())) return null
    const parts = zoneParts(fallback, timeZone)
    return {
      year: Number(parts['year']),
      month: Number(parts['month']),
      day: Number(parts['day']),
      hour: Number(parts['hour']),
      minute: Number(parts['minute']),
      weekday: parts['weekday'] ?? ''
    }
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  if (match[6] === undefined) {
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
    return { year, month, day, hour, minute, weekday }
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  const parts = zoneParts(date, timeZone)
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    weekday: parts['weekday'] ?? ''
  }
}

/** `today at 9:30 AM`, `tomorrow at 4:00 PM`, or `Friday, November 13 ...`. */
function describeWhen(iso: string, now: Date, timeZone: string): string {
  const moment = parseMoment(iso, timeZone)
  if (moment === null) return iso
  const time = formatClock(moment.hour, moment.minute)
  const nowParts = zoneParts(now, timeZone)
  const today = dayNumber(
    Number(nowParts['year']),
    Number(nowParts['month']),
    Number(nowParts['day'])
  )
  const target = dayNumber(moment.year, moment.month, moment.day)
  const delta = target - today
  if (delta === 0) return `today at ${time}`
  if (delta === 1) return `tomorrow at ${time}`
  if (delta === -1) return `yesterday at ${time}`
  return `${moment.weekday}, ${MONTHS[moment.month - 1]} ${moment.day} at ${time}`
}

/** Local wall-clock serialisation, so a naive datetime round-trips. */
function localIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  )
}

function addMinutes(iso: string, minutes: number): string | null {
  const base = new Date(iso)
  if (Number.isNaN(base.getTime())) return null
  return localIso(new Date(base.getTime() + minutes * MINUTE_MS))
}

function splitAttendees(raw: string | null): string[] {
  if (raw === null) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Splits attendee input into real email addresses and everything else.
 * Composio rejects the whole create call when a plain name reaches it, so
 * names are dropped here and reported back to the user instead.
 */
function partitionAttendees(raw: string | null): {
  valid: string[]
  dropped: string[]
} {
  const valid: string[] = []
  const dropped: string[] = []
  for (const entry of splitAttendees(raw)) {
    if (EMAIL.test(entry)) valid.push(entry)
    else dropped.push(entry)
  }
  return { valid, dropped }
}

function dateOf(value: unknown): string | null {
  const direct = stringOf(value)
  if (direct !== null) return direct
  if (isRecord(value)) {
    return stringOf(value['dateTime']) ?? stringOf(value['date'])
  }
  return null
}

function looksLikeEvent(item: unknown): boolean {
  if (!isRecord(item)) return false
  if (stringOf(item['id']) !== null) return true
  return stringOf(item['summary']) !== null && dateOf(item['start']) !== null
}

function toEvent(item: Record<string, unknown>): CalendarEvent | null {
  const start = dateOf(item['start'])
  if (start === null) return null
  const location = stringOf(item['location'])
  return {
    id: stringOf(item['id']) ?? '',
    summary: stringOf(item['summary']) ?? '',
    start,
    end: dateOf(item['end']),
    ...(location ? { location } : {})
  }
}

function findEventArray(
  value: unknown
): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord)
    if (records.length > 0 && records.some(looksLikeEvent)) return records
    for (const item of value) {
      const found = findEventArray(item)
      if (found !== null) return found
    }
    return null
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      const found = findEventArray(child)
      if (found !== null) return found
    }
  }
  return null
}

/** Pulls the events array out of whatever shape Composio returned. */
export function extractEvents(data: unknown): CalendarEvent[] {
  const found = findEventArray(data)
  if (found === null) return []
  const events: CalendarEvent[] = []
  for (const item of found) {
    const event = toEvent(item)
    if (event !== null) events.push(event)
    if (events.length >= EVENT_LIMIT) break
  }
  return events
}

// --- event matching (exported for tests) -------------------------------

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function queryClockMinute(query: string): number | null {
  const match = CLOCK_IN_QUERY.exec(query.toLowerCase())
  if (match === null) return null
  const hasMeridiem = match[3] !== undefined
  const hasMinutes = match[2] !== undefined
  if (!hasMeridiem && !hasMinutes) return null
  let hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  if (hasMeridiem) {
    hour = hour % 12
    if (match[3] === 'pm') hour += 12
  }
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function startMinuteOfDay(start: string): number | null {
  const match = start.match(/T(\d{2}):(\d{2})/)
  if (match === null) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function endTime(event: CalendarEvent): Date | null {
  const parsed = new Date(event.end ?? event.start)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function scoreEvent(
  event: CalendarEvent,
  words: readonly string[],
  clockMinute: number | null,
  now: Date
): number {
  const summary = event.summary.toLowerCase()
  let score = 0
  for (const word of words) {
    if (summary.includes(word)) score += 3
  }
  if (clockMinute !== null) {
    const eventMinute = startMinuteOfDay(event.start)
    if (eventMinute !== null && eventMinute === clockMinute) score += 4
  }
  const ended = endTime(event)
  if (ended !== null && ended.getTime() < now.getTime()) score -= 3
  return score
}

/** Pure. Exported so it can be tested without any I/O. */
export function resolveEvent(
  events: readonly CalendarEvent[],
  query: string,
  now: Date
): {
  ok: true
  event: CalendarEvent
} | {
  ok: false
  reason: 'not_found' | 'ambiguous'
  candidates: CalendarEvent[]
} {
  const words = keywords(query)
  const clockMinute = queryClockMinute(query)
  let best: CalendarEvent | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  let tied: CalendarEvent[] = []

  for (const event of events) {
    const score = scoreEvent(event, words, clockMinute, now)
    if (score > bestScore) {
      bestScore = score
      best = event
      tied = [event]
    } else if (score === bestScore) {
      tied.push(event)
    }
  }

  if (best === null || bestScore <= 0) {
    return { ok: false, reason: 'not_found', candidates: [] }
  }
  if (tied.length > 1) {
    return { ok: false, reason: 'ambiguous', candidates: tied }
  }
  return { ok: true, event: best }
}

// --- tool schemas ------------------------------------------------------

const LIST_DESCRIPTION =
  "List upcoming calendar events and meetings on the user's schedule."

const CREATE_DESCRIPTION =
  'Create a calendar event from an exact ISO 8601 start time, never a ' +
  'relative date.'

const MOVE_DESCRIPTION =
  'Move or reschedule an existing calendar event to an exact ISO 8601 start ' +
  'time.'

const CANCEL_DESCRIPTION =
  'Cancel or delete an existing calendar event.'

export function createCalendarTools(options: CalendarToolOptions): Tool[] {
  const callTool = options.callTool
  const zone = options.timezone ?? hostZone
  const invoke = createInvoker(
    callTool,
    'Google Calendar returned an error.',
    'Google Calendar'
  )

  /**
   * Resolve "now" per call: an explicitly injected clock wins, otherwise the
   * host clock on the tool context. Reading the clock at construction time
   * would freeze the tools to the moment they were built.
   */
  function currentTime(ctx: ToolContext): Date {
    return options.now?.() ?? ctx.clock()
  }

  function resolveFailureMessage(
    query: string,
    result: { reason: 'not_found' | 'ambiguous'; candidates: CalendarEvent[] },
    now: Date,
    timeZone: string
  ): string {
    if (result.reason === 'not_found') {
      return `I couldn't find a calendar event matching "${query}".`
    }
    const named = result.candidates
      .slice(0, 3)
      .map((event) => `${event.summary} ${describeWhen(event.start, now, timeZone)}`)
      .join(', ')
    return `More than one event matches "${query}": ${named}. Say which one.`
  }

  async function locateEvent(
    query: string,
    calendarId: string,
    action: string,
    ctx: ToolContext
  ): Promise<
    { ok: true; event: CalendarEvent } | { ok: false; outcome: ToolOutcome }
  > {
    const now = currentTime(ctx)
    const timeZone = zone()
    const listed = await invoke(
      SLUG.list,
      {
        calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: rfc3339(new Date(now.getTime() - DAY_MS), timeZone),
        timeMax: rfc3339(new Date(now.getTime() + 60 * DAY_MS), timeZone),
        maxResults: 50
      },
      action
    )
    if (!listed.ok) return { ok: false, outcome: listed.outcome }

    const resolved = resolveEvent(extractEvents(listed.data), query, now)
    if (!resolved.ok) {
      const message = resolveFailureMessage(query, resolved, now, timeZone)
      return {
        ok: false,
        outcome: { status: 'error', action, message, spokenResponse: message }
      }
    }
    return { ok: true, event: resolved.event }
  }

  function summarize(
    events: readonly CalendarEvent[],
    now: Date,
    timeZone: string,
    action: string
  ): ToolOutcome {
    if (events.length === 0) {
      const message = 'You have nothing on your calendar in the next 7 days.'
      return { status: 'ok', action, message, spokenResponse: message }
    }

    const count = events.length
    const noun = count === 1 ? 'event' : 'events'
    const named = events
      .slice(0, SPOKEN_EVENT_LIMIT)
      .map((event) => `${event.summary} ${describeWhen(event.start, now, timeZone)}`)
    const more = count > SPOKEN_EVENT_LIMIT ? `, and ${count - SPOKEN_EVENT_LIMIT} more` : ''
    const spoken =
      `You have ${count} ${noun} coming up. Next: ${named.join(', ')}${more}.`
    const message =
      `You have ${count} ${noun} coming up in the next 7 days. ` +
      `Next: ${named.join(', ')}${more}.`
    return {
      status: 'ok',
      action,
      message: truncate(message, MESSAGE_LIMIT),
      spokenResponse: truncate(spoken, SPOKEN_LIMIT)
    }
  }

  const listEvents: Tool = {
    spec: specFor(
      'calendar_list_events',
      LIST_DESCRIPTION,
      objectSchema(
        {
          time_min: {
            type: 'string',
            description: 'Start of the window, ISO 8601. Defaults to now.'
          },
          time_max: {
            type: 'string',
            description: 'End of the window, ISO 8601. Defaults to seven days out.'
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of events to return. Defaults to 10.'
          }
        },
        []
      ),
      'read',
      false,
      'check your calendar'
    ),
    async run(args, ctx) {
      const action = 'check your calendar'
      const skipped = dryRun(ctx, action, 'calendar_list_events')
      if (skipped !== null) return skipped

      const now = currentTime(ctx)
      const timeZone = zone()
      const timeMin =
        optionalString(args, 'time_min') ?? rfc3339(now, timeZone)
      const timeMax =
        optionalString(args, 'time_max') ??
        rfc3339(new Date(now.getTime() + 7 * DAY_MS), timeZone)
      const maxResults = optionalInteger(args, 'max_results') ?? 10

      const listed = await invoke(
        SLUG.list,
        {
          calendarId: 'primary',
          singleEvents: true,
          orderBy: 'startTime',
          timeMin,
          timeMax,
          maxResults
        },
        action
      )
      if (!listed.ok) return listed.outcome
      return summarize(extractEvents(listed.data), now, timeZone, action)
    }
  }

  const createEvent: Tool = {
    spec: specFor(
      'calendar_create_event',
      CREATE_DESCRIPTION,
      objectSchema(
        {
          title: { type: 'string', description: 'The event title.' },
          start: {
            type: 'string',
            description: 'Start as an exact ISO 8601 local datetime.'
          },
          duration_minutes: {
            type: 'integer',
            description: 'Length in minutes. Defaults to 60.'
          },
          attendees: {
            type: 'string',
            description:
              "Comma-separated attendee email addresses only. Never put a person's name here; if you only have a name, leave this empty and put the name in the title."
          },
          location: { type: 'string', description: 'Where the event happens.' },
          description: {
            type: 'string',
            description: 'Notes to include with the event.'
          },
          calendar_id: {
            type: 'string',
            description: "Calendar to use. Defaults to 'primary'."
          }
        },
        ['title', 'start']
      ),
      'write',
      true,
      'schedule a meeting'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'schedule a meeting'
      if (ctx.dryRun) return { arguments: { ...args } }

      const title = optionalString(args, 'title') ?? 'New event'
      const start = optionalString(args, 'start')
      if (start === null || ISO_MOMENT.exec(start) === null) {
        return {
          arguments: { ...args },
          outcome: { status: 'error', action, message: NEED_EXACT_TIME }
        }
      }
      const duration = optionalInteger(args, 'duration_minutes') ?? 60
      const end = addMinutes(start, duration)
      if (end === null) {
        return {
          arguments: { ...args },
          outcome: { status: 'error', action, message: NEED_EXACT_TIME }
        }
      }

      const calendarId = optionalString(args, 'calendar_id') ?? 'primary'
      const { valid: attendees } = partitionAttendees(
        optionalString(args, 'attendees')
      )
      const location = optionalString(args, 'location') ?? undefined
      const description = optionalString(args, 'description') ?? undefined
      const when = describeWhen(start, currentTime(ctx), zone())

      const card: NotchCalendarCard = {
        kind: 'calendar_event',
        mode: 'create',
        title,
        start,
        end,
        durationMinutes: duration,
        calendarName: calendarId === 'primary' ? 'Primary' : calendarId,
        location,
        description,
        attendees: attendees.length > 0 ? attendees : undefined
      }

      return {
        arguments: {
          ...args,
          title,
          start,
          duration_minutes: duration,
          calendar_id: calendarId
        },
        message: `Schedule "${title}" for ${when}? Approval needed.`,
        display: title,
        card: card as unknown as Record<string, unknown>
      }
    },
    async run(args, ctx) {
      const action = 'schedule a meeting'
      const skipped = dryRun(ctx, action, 'calendar_create_event')
      if (skipped !== null) return skipped

      const title = optionalString(args, 'title') ?? ''
      const start = optionalString(args, 'start')
      if (start === null || ISO_MOMENT.exec(start) === null) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }
      const duration = optionalInteger(args, 'duration_minutes') ?? 60
      const end = addMinutes(start, duration)
      if (end === null) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }

      const calendarId = optionalString(args, 'calendar_id') ?? 'primary'
      const { valid: attendees, dropped: droppedAttendees } = partitionAttendees(
        optionalString(args, 'attendees')
      )
      const callArgs: Record<string, unknown> = {
        calendar_id: calendarId,
        summary: title,
        start_datetime: start,
        end_datetime: end,
        timezone: zone(),
        create_meeting_room: false,
        send_updates: 'all'
      }
      if (attendees.length > 0) callArgs['attendees'] = attendees
      const location = optionalString(args, 'location')
      if (location !== null) callArgs['location'] = location
      const description = optionalString(args, 'description')
      if (description !== null) callArgs['description'] = description

      const created = await invoke(SLUG.create, callArgs, action)
      if (!created.ok) return created.outcome

      const when = describeWhen(start, currentTime(ctx), zone())
      const invited =
        attendees.length > 0
          ? ` and invited ${attendees.length} ${attendees.length === 1 ? 'person' : 'people'}`
          : ''
      const skippedNote =
        droppedAttendees.length > 0
          ? ` I didn't invite ${joinNames(droppedAttendees)} because I need an email address.`
          : ''
      const message = `Scheduled "${title}" for ${when}${invited}.${skippedNote}`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const moveEvent: Tool = {
    spec: specFor(
      'calendar_move_event',
      MOVE_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: 'The event as the user named it.'
          },
          new_start: {
            type: 'string',
            description: 'The new start as an exact ISO 8601 local datetime.'
          },
          duration_minutes: {
            type: 'integer',
            description: "Length in minutes. Keeps the event's own length by default."
          },
          calendar_id: {
            type: 'string',
            description: "Calendar to use. Defaults to 'primary'."
          }
        },
        ['query', 'new_start']
      ),
      'write',
      true,
      'move a meeting'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      const action = 'move a meeting'
      if (ctx.dryRun) return { arguments: { ...args } }
      const query = optionalString(args, 'query') ?? ''
      const newStart = optionalString(args, 'new_start')
      if (newStart === null || ISO_MOMENT.exec(newStart) === null) {
        return {
          arguments: { ...args },
          outcome: { status: 'error', action, message: NEED_EXACT_TIME }
        }
      }
      const duration = optionalInteger(args, 'duration_minutes') ?? 60
      const end = addMinutes(newStart, duration) ?? newStart
      const when = describeWhen(newStart, currentTime(ctx), zone())
      const card: NotchCalendarCard = {
        kind: 'calendar_event',
        mode: 'patch',
        title: query || 'Meeting',
        start: newStart,
        end,
        durationMinutes: duration,
        calendarName: 'Primary'
      }
      return {
        arguments: { ...args },
        message: `Move "${query}" to ${when}? Approval needed.`,
        display: query,
        card: card as unknown as Record<string, unknown>
      }
    },
    async run(args, ctx) {
      const action = 'move a meeting'
      const skipped = dryRun(ctx, action, 'calendar_move_event')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query') ?? ''
      const newStart = optionalString(args, 'new_start')
      if (newStart === null || ISO_MOMENT.exec(newStart) === null) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }

      const calendarId = optionalString(args, 'calendar_id') ?? 'primary'
      const located = await locateEvent(query, calendarId, action, ctx)
      if (!located.ok) return located.outcome

      const explicit = optionalInteger(args, 'duration_minutes')
      const duration = explicit ?? originalDuration(located.event)
      const end = addMinutes(newStart, duration)
      if (end === null) {
        return { status: 'error', action, message: NEED_EXACT_TIME }
      }

      const patched = await invoke(
        SLUG.patch,
        {
          calendar_id: calendarId,
          event_id: located.event.id,
          start_time: newStart,
          end_time: end,
          timezone: zone()
        },
        action
      )
      if (!patched.ok) return patched.outcome

      const message = `Moved "${located.event.summary}" to ${describeWhen(newStart, currentTime(ctx), zone())}.`
      return {
        status: 'ok',
        action,
        message: truncate(message, MESSAGE_LIMIT),
        spokenResponse: truncate(message, SPOKEN_LIMIT)
      }
    }
  }

  const cancelEvent: Tool = {
    spec: specFor(
      'calendar_cancel_event',
      CANCEL_DESCRIPTION,
      objectSchema(
        {
          query: {
            type: 'string',
            description: 'The event as the user named it.'
          },
          calendar_id: {
            type: 'string',
            description: "Calendar to use. Defaults to 'primary'."
          }
        },
        ['query']
      ),
      'write',
      true,
      'cancel a meeting'
    ),
    async prepare(args, ctx): Promise<ToolPreparation> {
      if (ctx.dryRun) return { arguments: { ...args } }
      const query = optionalString(args, 'query') ?? ''
      const calendarId = optionalString(args, 'calendar_id') ?? 'primary'
      const action = 'cancel a meeting'

      let title = query || 'Meeting'
      let start = ''
      let end = ''
      let duration = 60
      let location: string | undefined = undefined

      try {
        const located = await locateEvent(query, calendarId, action, ctx)
        if (located.ok) {
          title = located.event.summary || title
          start = located.event.start
          end = located.event.end ?? ''
          duration = originalDuration(located.event)
          location = located.event.location
        }
      } catch {
        // Fall back gracefully to query title and defaults
      }

      const card: NotchCalendarCard = {
        kind: 'calendar_event',
        mode: 'delete',
        title,
        start,
        end,
        durationMinutes: duration,
        calendarName: calendarId === 'primary' ? 'primary' : calendarId,
        ...(location ? { location } : {})
      }
      return {
        arguments: { ...args },
        message: `Cancel "${title}"? Approval needed.`,
        display: title,
        card: card as unknown as Record<string, unknown>
      }
    },
    async run(args, ctx) {
      const action = 'cancel a meeting'
      const skipped = dryRun(ctx, action, 'calendar_cancel_event')
      if (skipped !== null) return skipped

      const query = optionalString(args, 'query') ?? ''
      const calendarId = optionalString(args, 'calendar_id') ?? 'primary'
      const located = await locateEvent(query, calendarId, action, ctx)
      if (!located.ok) return located.outcome

      const removed = await invoke(
        SLUG.remove,
        {
          calendar_id: calendarId,
          event_id: located.event.id,
          send_updates: 'all'
        },
        action
      )
      if (!removed.ok) return removed.outcome

      const message = `Cancelled "${located.event.summary}".`
      return {
        status: 'ok',
        action,
        message,
        spokenResponse: message
      }
    }
  }

  return [listEvents, createEvent, moveEvent, cancelEvent]
}

/** The original event's length in minutes, or 60 when it is unknown. */
function originalDuration(event: CalendarEvent): number {
  if (event.end === null) return 60
  const start = new Date(event.start).getTime()
  const end = new Date(event.end).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 60
  return Math.max(1, Math.round((end - start) / MINUTE_MS))
}
