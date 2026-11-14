import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  createCalendarTools,
  extractEvents,
  parseComposioResult,
  readableError,
  resolveEvent
} from './calendar'

/** A UTC instant, so every expected string is host-independent. */
const FIXED_NOW = new Date('2026-11-07T09:41:12Z')

interface RecordedCall {
  slug: string
  args: Record<string, unknown>
}

type Handler = (args: Record<string, unknown>) => {
  text: string
  isError?: boolean
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executor: {
      openApp: async () => undefined,
      openUrl: async () => undefined
    },
    clock: () => FIXED_NOW,
    fileRoots: [],
    dryRun: false,
    fileOps: {
      createFolder: async () => '',
      createFile: async () => '',
      deleteFile: async () => '',
      resolveDeleteTarget: async (target) => target,
      removeCreated: async () => undefined
    },
    fileSearch: { search: async () => [] },
    weather: {
      fetch: async (location) => ({
        location,
        temperature: '',
        low: '',
        high: '',
        condition: '',
        icon: '',
        spoken: ''
      })
    },
    ...overrides
  }
}

function makeTools(handlers: Record<string, Handler>): {
  tools: Tool[]
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const tools = createCalendarTools({
    callTool: async (slug, args) => {
      calls.push({ slug, args })
      const handler = handlers[slug]
      if (handler === undefined) {
        throw new Error(`unexpected Composio slug ${slug}`)
      }
      const result = handler(args)
      return { text: result.text, isError: result.isError ?? false }
    },
    now: () => FIXED_NOW,
    timezone: () => 'UTC'
  })
  return { tools, calls }
}

function toolNamed(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.spec.name === name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool
}

function event(
  id: string,
  summary: string,
  start: string,
  end: string | null
): Record<string, unknown> {
  return {
    id,
    summary,
    start: { dateTime: start },
    end: end === null ? undefined : { dateTime: end }
  }
}

function listPayload(items: unknown[]): string {
  return JSON.stringify({ successful: true, data: { items } })
}

function okPayload(data: unknown): string {
  return JSON.stringify({ successful: true, data })
}

/** The exact body Composio returned for `attendees: 'Sam'`. */
const INVALID_ATTENDEE_BODY =
  '{"successful":false,"data":{"message":"Invalid request data provided\\n- Value error, Invalid email address format: \'Sam\'.","statuscode":400},"error":"Invalid request data provided"}'

const STANDUP = event(
  'evt-1',
  'Standup',
  '2026-11-07T15:00:00Z',
  '2026-11-07T15:30:00Z'
)

describe('calendar tool specs', () => {
  it('keeps every description short', () => {
    for (const tool of makeTools({}).tools) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('calendar_list_events', () => {
  it('lists events and defaults the window to now plus seven days', async () => {
    const items = [
      event('e1', 'Standup', '2026-11-07T09:30:00Z', '2026-11-07T09:45:00Z'),
      event('e2', 'Design review', '2026-11-07T11:00:00Z', '2026-11-07T12:00:00Z'),
      event('e3', 'Lunch with Sam', '2026-11-08T13:00:00Z', '2026-11-08T14:00:00Z')
    ]
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'calendar_list_events').run(
      {},
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLECALENDAR_EVENTS_LIST')
    expect(calls[0].args).toMatchObject({
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: '2026-11-07T09:41:12+00:00',
      timeMax: '2026-11-14T09:41:12+00:00',
      maxResults: 10
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('You have 3 events coming up.')
    expect(outcome.spokenResponse).toContain('Standup today at 9:30 AM')
    expect(outcome.message).toContain('3')
  })

  it('reports an empty calendar without erroring', async () => {
    const { tools } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([]) })
    })

    const outcome = await toolNamed(tools, 'calendar_list_events').run(
      {},
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('nothing on your calendar')
    expect(outcome.spokenResponse).toContain('nothing on your calendar')
  })
})

describe('calendar_create_event', () => {
  it('sends the mandatory no-meet parameters and splits attendees', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_CREATE_EVENT: () => ({ text: okPayload({ id: 'new' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      {
        title: 'Dentist',
        start: '2026-11-13T15:00:00',
        duration_minutes: 30,
        attendees: 'sam@example.com, alex@example.com',
        location: 'Clinic',
        description: 'Checkup'
      },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLECALENDAR_CREATE_EVENT')
    expect(calls[0].args).toMatchObject({
      calendar_id: 'primary',
      summary: 'Dentist',
      start_datetime: '2026-11-13T15:00:00',
      end_datetime: '2026-11-13T15:30:00',
      timezone: 'UTC',
      create_meeting_room: false,
      send_updates: 'all',
      attendees: ['sam@example.com', 'alex@example.com'],
      location: 'Clinic',
      description: 'Checkup'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Scheduled "Dentist"')
    expect(outcome.message).toContain('November 13')
    expect(outcome.message).toContain('3:00 PM')
    expect(outcome.message).toContain('invited 2 people')
  })

  it('drops a plain name from attendees and reports it', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_CREATE_EVENT: () => ({ text: okPayload({ id: 'new' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      {
        title: 'Meeting with Sam',
        start: '2026-11-13T15:00:00',
        attendees: 'Sam, sam@example.com'
      },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLECALENDAR_CREATE_EVENT')
    expect(calls[0].args['attendees']).toEqual(['sam@example.com'])
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain("didn't invite Sam")
  })

  it('omits attendees entirely when only a name was given', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_CREATE_EVENT: () => ({ text: okPayload({ id: 'new' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      { title: 'Meeting with Sam', start: '2026-11-13T15:00:00', attendees: 'Sam' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].args).not.toHaveProperty('attendees')
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain("didn't invite Sam")
  })

  it('does not mention skipping when every attendee is an email', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_CREATE_EVENT: () => ({ text: okPayload({ id: 'new' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      {
        title: 'Dentist',
        start: '2026-11-13T15:00:00',
        attendees: 'sam@example.com, alex@example.com'
      },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].args['attendees']).toEqual([
      'sam@example.com',
      'alex@example.com'
    ])
    expect(outcome.status).toBe('ok')
    expect(outcome.message).not.toContain("didn't invite")
  })

  it('turns an MCP error carrying raw JSON into one short line', async () => {
    const { tools } = makeTools({
      GOOGLECALENDAR_CREATE_EVENT: () => ({
        text: INVALID_ATTENDEE_BODY,
        isError: true
      })
    })

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      { title: 'Dentist', start: '2026-11-13T15:00:00' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('Invalid request data provided')
    expect(outcome.message).not.toContain('{"successful"')
    expect(outcome.message).not.toContain('\n')
  })

  it('refuses an unparseable start without calling Composio', async () => {
    const { tools, calls } = makeTools({})

    const outcome = await toolNamed(tools, 'calendar_create_event').run(
      { title: 'Dentist', start: 'tomorrow afternoon' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('I need an exact date and time for that.')
    expect(calls).toHaveLength(0)
  })
})

describe('calendar_create_event applyEdits', () => {
  it('maps the edited create card onto the stored arguments', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'calendar_create_event')

    const applied = tool.applyEdits!(
      { title: 'Old title', start: '2026-11-13T15:00:00', duration_minutes: 30 },
      {
        title: 'New title',
        start: '2026-11-14T09:30:00',
        durationMinutes: 45,
        location: 'Room 1',
        description: 'Bring notes',
        attendees: ['sam@example.com', 'alex@example.com']
      }
    )

    expect(applied).toMatchObject({
      title: 'New title',
      start: '2026-11-14T09:30:00',
      duration_minutes: 45,
      location: 'Room 1',
      description: 'Bring notes',
      attendees: 'sam@example.com, alex@example.com'
    })
  })

  it('ignores blank titles, bad starts, and non-positive durations', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'calendar_create_event')

    const applied = tool.applyEdits!(
      { title: 'Old title', start: '2026-11-13T15:00:00', duration_minutes: 30 },
      { title: '   ', start: 'tomorrow', durationMinutes: 0 }
    )

    expect(applied).toMatchObject({
      title: 'Old title',
      start: '2026-11-13T15:00:00',
      duration_minutes: 30
    })
  })
})

describe('calendar_move_event applyEdits', () => {
  it('maps the edited move card onto the stored arguments', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'calendar_move_event')

    const applied = tool.applyEdits!(
      { new_start: '2026-11-08T16:00:00' },
      { title: 'Renamed', start: '2026-11-09T10:00:00', durationMinutes: 45 }
    )

    expect(applied).toMatchObject({
      summary: 'Renamed',
      new_start: '2026-11-09T10:00:00',
      duration_minutes: 45
    })
  })
})

describe('calendar_move_event', () => {
  it('lists, patches, and preserves the original duration', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([STANDUP]) }),
      GOOGLECALENDAR_PATCH_EVENT: () => ({ text: okPayload({ id: 'evt-1' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_move_event').run(
      { query: 'standup', new_start: '2026-11-08T16:00:00' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'GOOGLECALENDAR_EVENTS_LIST',
      'GOOGLECALENDAR_PATCH_EVENT'
    ])
    expect(calls[0].args).toMatchObject({
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50
    })
    expect(calls[1].args).toMatchObject({
      calendar_id: 'primary',
      event_id: 'evt-1',
      start_time: '2026-11-08T16:00:00',
      end_time: '2026-11-08T16:30:00',
      timezone: 'UTC'
    })
    expect(calls[1].args['start_datetime']).toBeUndefined()
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Moved "Standup" to tomorrow at 4:00 PM.')
  })

  it('renames the event when the edited summary is present', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_PATCH_EVENT: () => ({ text: okPayload({ id: 'evt-1' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_move_event').run(
      {
        event_id: 'evt-1',
        event_summary: 'Standup',
        event_start: '2026-11-07T15:00:00Z',
        event_end: '2026-11-07T15:30:00Z',
        new_start: '2026-11-08T16:00:00',
        summary: 'Renamed'
      },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLECALENDAR_PATCH_EVENT')
    expect(calls[0].args['summary']).toBe('Renamed')
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Moved "Renamed" to tomorrow at 4:00 PM.')
  })

  it('refuses to patch when nothing matches', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([STANDUP]) })
    })

    const outcome = await toolNamed(tools, 'calendar_move_event').run(
      { query: 'unicorn', new_start: '2026-11-08T16:00:00' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toContain("couldn't find")
    expect(calls.some((call) => call.slug === 'GOOGLECALENDAR_PATCH_EVENT')).toBe(
      false
    )
  })

  it('refuses to patch when two events tie', async () => {
    const items = [
      STANDUP,
      event('e2', 'Standup sync', '2026-11-07T16:00:00Z', '2026-11-07T16:30:00Z')
    ]
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'calendar_move_event').run(
      { query: 'standup', new_start: '2026-11-08T16:00:00' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toContain('Standup')
    expect(outcome.message).toContain('Standup sync')
    expect(outcome.message).toContain('Say which one.')
    expect(calls.some((call) => call.slug === 'GOOGLECALENDAR_PATCH_EVENT')).toBe(
      false
    )
  })

  it('binds the located event in prepare so run patches without re-listing', async () => {
    const items = [
      event('evt-1', 'Meeting', '2026-11-08T10:00:00Z', '2026-11-08T11:00:00Z')
    ]
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload(items) }),
      GOOGLECALENDAR_PATCH_EVENT: () => ({ text: okPayload({ id: 'evt-1' }) })
    })

    const tool = toolNamed(tools, 'calendar_move_event')
    const prep = await tool.prepare!(
      { query: 'meeting', new_start: '2026-11-08T16:00:00' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual(['GOOGLECALENDAR_EVENTS_LIST'])
    expect(prep.arguments['event_id']).toBe('evt-1')
    expect(prep.arguments['event_summary']).toBe('Meeting')
    expect(prep.outcome).toBeUndefined()

    calls.length = 0
    const outcome = await tool.run(prep.arguments, makeContext())

    expect(calls.map((call) => call.slug)).toEqual(['GOOGLECALENDAR_PATCH_EVENT'])
    expect(calls[0].args).toMatchObject({
      calendar_id: 'primary',
      event_id: 'evt-1',
      start_time: '2026-11-08T16:00:00',
      end_time: '2026-11-08T17:00:00',
      timezone: 'UTC'
    })
    expect(outcome.status).toBe('ok')
  })

  it('returns an error outcome from prepare when nothing matches', async () => {
    const { tools } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([STANDUP]) })
    })

    const tool = toolNamed(tools, 'calendar_move_event')
    const prep = await tool.prepare!(
      { query: 'unicorn', new_start: '2026-11-08T16:00:00' },
      makeContext()
    )

    expect(prep.card).toBeUndefined()
    expect(prep.outcome?.status).toBe('error')
    expect(prep.outcome?.message).toContain("couldn't find")
  })
})

describe('calendar_cancel_event', () => {
  it('lists then deletes a uniquely matched event', async () => {
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([STANDUP]) }),
      GOOGLECALENDAR_DELETE_EVENT: () => ({ text: okPayload({ id: 'evt-1' }) })
    })

    const outcome = await toolNamed(tools, 'calendar_cancel_event').run(
      { query: 'standup' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'GOOGLECALENDAR_EVENTS_LIST',
      'GOOGLECALENDAR_DELETE_EVENT'
    ])
    expect(calls[1].args).toMatchObject({
      calendar_id: 'primary',
      event_id: 'evt-1',
      send_updates: 'all'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Cancelled "Standup".')
  })

  it('refuses to delete an ambiguous match', async () => {
    const items = [
      STANDUP,
      event('e2', 'Standup sync', '2026-11-07T16:00:00Z', '2026-11-07T16:30:00Z')
    ]
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'calendar_cancel_event').run(
      { query: 'standup' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(calls.some((call) => call.slug === 'GOOGLECALENDAR_DELETE_EVENT')).toBe(
      false
    )
  })

  it('prepares a delete card with located event details', async () => {
    const coffeeMeeting = {
      id: 'evt-coffee',
      summary: 'Coffee Meeting',
      start: '2026-11-15T14:00:00Z',
      end: '2026-11-15T15:00:00Z',
      location: 'Blue Bottle Coffee'
    }
    const { tools, calls } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([coffeeMeeting]) })
    })

    const tool = toolNamed(tools, 'calendar_cancel_event')
    expect(tool.prepare).toBeDefined()
    const prep = await tool.prepare!({ query: 'coffee' }, makeContext())

    expect(calls.map((c) => c.slug)).toEqual(['GOOGLECALENDAR_EVENTS_LIST'])
    expect(prep.message).toBe('Cancel "Coffee Meeting"? Approval needed.')
    expect(prep.display).toBe('Coffee Meeting')
    expect(prep.card).toEqual({
      kind: 'calendar_event',
      mode: 'delete',
      title: 'Coffee Meeting',
      start: '2026-11-15T14:00:00Z',
      end: '2026-11-15T15:00:00Z',
      durationMinutes: 60,
      calendarName: 'primary',
      location: 'Blue Bottle Coffee'
    })
  })

  it('prepares a fallback delete card when event cannot be located', async () => {
    const { tools } = makeTools({
      GOOGLECALENDAR_EVENTS_LIST: () => ({ text: listPayload([]) })
    })

    const tool = toolNamed(tools, 'calendar_cancel_event')
    const prep = await tool.prepare!({ query: 'Dentist' }, makeContext())

    expect(prep.message).toBe('Cancel "Dentist"? Approval needed.')
    expect(prep.card).toEqual({
      kind: 'calendar_event',
      mode: 'delete',
      title: 'Dentist',
      start: '',
      end: '',
      durationMinutes: 60,
      calendarName: 'primary'
    })
  })
})

describe('resolveEvent', () => {
  it('matches on a spoken clock time', () => {
    const events = [
      {
        id: 'a',
        summary: 'Team sync',
        start: '2026-11-07T15:00:00',
        end: '2026-11-07T16:00:00'
      }
    ]

    const result = resolveEvent(events, 'move the 3pm', new Date('2026-11-07T09:00:00'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('a')
  })

  it('matches on a title word', () => {
    const events = [
      {
        id: 'b',
        summary: 'Standup',
        start: '2026-11-07T10:00:00',
        end: '2026-11-07T10:15:00'
      }
    ]

    const result = resolveEvent(events, 'the standup', new Date('2026-11-07T09:00:00'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('b')
  })

  it('reports not_found when nothing scores', () => {
    const result = resolveEvent([], 'standup', FIXED_NOW)

    expect(result).toEqual({ ok: false, reason: 'not_found', candidates: [] })
  })

  it('resolves a relative-date query to a differently titled event', () => {
    const events = [
      {
        id: 'sync',
        summary: 'Project sync',
        start: '2026-11-08T10:00:00',
        end: '2026-11-08T11:00:00'
      }
    ]

    const result = resolveEvent(events, "tomorrow's meeting", FIXED_NOW, {
      timeZone: 'UTC'
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('sync')
  })

  it('resolves a bare hint word to a single event', () => {
    const events = [
      {
        id: 'm',
        summary: 'Meeting',
        start: '2026-11-08T10:00:00',
        end: '2026-11-08T11:00:00'
      }
    ]

    const result = resolveEvent(events, 'meeting', FIXED_NOW, { timeZone: 'UTC' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('m')
  })

  it('matches a stemmed word against the summary', () => {
    const events = [
      {
        id: 'c',
        summary: 'Congratulation',
        start: '2026-11-08T10:00:00',
        end: '2026-11-08T11:00:00'
      }
    ]

    const result = resolveEvent(events, 'congratulations', FIXED_NOW, {
      timeZone: 'UTC'
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('c')
  })

  it('uses the transcript date to break an otherwise even match', () => {
    const events = [
      {
        id: 'today',
        summary: 'Sync',
        start: '2026-11-07T10:00:00Z',
        end: '2026-11-07T11:00:00Z'
      },
      {
        id: 'tomorrow',
        summary: 'Sync',
        start: '2026-11-08T10:00:00Z',
        end: '2026-11-08T11:00:00Z'
      }
    ]

    const result = resolveEvent(events, 'sync', FIXED_NOW, {
      timeZone: 'UTC',
      transcript: 'move my sync to tomorrow'
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.id).toBe('tomorrow')
  })
})

describe('parseComposioResult', () => {
  it('unwraps a successful result whose data is a JSON string', () => {
    const parsed = parseComposioResult(
      JSON.stringify({ successful: true, data: JSON.stringify({ items: [1] }) })
    )

    expect(parsed.ok).toBe(true)
    expect(parsed.data).toEqual({ items: [1] })
    expect(parsed.error).toBeNull()
  })

  it('reports a failed result', () => {
    const parsed = parseComposioResult(
      JSON.stringify({ successful: false, error: 'boom' })
    )

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toBe('boom')
  })

  it('returns plain, non-JSON text unchanged', () => {
    expect(parseComposioResult('all good')).toEqual({
      ok: true,
      data: 'all good',
      error: null
    })
  })

  it('recovers JSON embedded in prose', () => {
    const parsed = parseComposioResult('here you go: {"items":[]} thanks')

    expect(parsed.ok).toBe(true)
    expect(parsed.data).toEqual({ items: [] })
  })
})

describe('extractEvents', () => {
  it('finds events nested under data.items', () => {
    const events = extractEvents({
      data: {
        items: [
          {
            id: '1',
            summary: 'A',
            start: { dateTime: '2026-11-07T09:00:00Z' },
            end: { dateTime: '2026-11-07T10:00:00Z' }
          }
        ]
      }
    })

    expect(events).toEqual([
      {
        id: '1',
        summary: 'A',
        start: '2026-11-07T09:00:00Z',
        end: '2026-11-07T10:00:00Z'
      }
    ])
  })

  it('accepts a bare array and drops malformed items', () => {
    const events = extractEvents([
      { id: '2', summary: 'B', start: { date: '2026-11-08' } },
      { summary: 'broken' }
    ])

    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('2')
    expect(events[0].end).toBeNull()
  })

  it('extracts location and description when present', () => {
    const events = extractEvents([
      {
        id: '3',
        summary: 'C',
        start: { dateTime: '2026-11-09T09:00:00Z' },
        end: { dateTime: '2026-11-09T10:00:00Z' },
        location: 'Room 1',
        description: 'Bring notes'
      }
    ])

    expect(events[0].location).toBe('Room 1')
    expect(events[0].description).toBe('Bring notes')
  })
})

describe('readableError', () => {
  it('reduces the real 400 body to its message line', () => {
    const line = readableError(INVALID_ATTENDEE_BODY)

    expect(line.startsWith('Invalid request data provided')).toBe(true)
    expect(line).not.toContain('{"successful"')
    expect(line).not.toContain('\n')
  })

  it('falls back to a generic line when there is nothing to read', () => {
    expect(readableError('')).toBe('The app returned an error.')
  })
})

describe('calendar tool specs', () => {
  it('marks only the list tool as a confirmed-free read', () => {
    const { tools } = makeTools({})
    const byName = new Map(tools.map((tool) => [tool.spec.name, tool.spec]))

    expect([...byName.keys()].sort()).toEqual([
      'calendar_cancel_event',
      'calendar_create_event',
      'calendar_list_events',
      'calendar_move_event'
    ])
    expect(byName.get('calendar_list_events')?.risk).toBe('read')
    expect(byName.get('calendar_list_events')?.requiresConfirmation).toBe(false)
    expect(byName.get('calendar_create_event')?.actionLabel).toBe(
      'schedule a meeting'
    )
    for (const name of [
      'calendar_create_event',
      'calendar_move_event',
      'calendar_cancel_event'
    ]) {
      expect(byName.get(name)?.risk).toBe('write')
      expect(byName.get(name)?.requiresConfirmation).toBe(true)
    }
  })
})

describe('dry-run mode', () => {
  it('reports what would run without calling Composio', async () => {
    const { tools, calls } = makeTools({})
    const ctx = makeContext({ dryRun: true })

    const outcomes = await Promise.all([
      toolNamed(tools, 'calendar_list_events').run({}, ctx),
      toolNamed(tools, 'calendar_create_event').run(
        { title: 'X', start: '2026-11-13T15:00:00' },
        ctx
      ),
      toolNamed(tools, 'calendar_move_event').run(
        { query: 'x', new_start: '2026-11-13T15:00:00' },
        ctx
      ),
      toolNamed(tools, 'calendar_cancel_event').run({ query: 'x' }, ctx)
    ])

    for (const outcome of outcomes) {
      expect(outcome.status).toBe('ok')
      expect(outcome.message).toMatch(/^Would run /)
    }
    expect(calls).toHaveLength(0)
  })
})
