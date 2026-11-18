import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  createSlackTools,
  fetchSlackRecentMessages,
  fetchSlackTargets
} from './slack'

/** A UTC instant, so every expected string is host-independent. */
const FIXED_NOW = new Date('2026-11-16T09:00:00Z')

const CHANNEL = 'C0AAAAAAA'
const OTHER_CHANNEL = 'C0BBBBBBB'
const DM = 'D0CCCCCCC'
const USER_ID = 'U0DDDDDDD'
const SENDER_ID = 'U0EEEEEEE'

const SCHEDULE_ISO = '2026-11-17T09:00:00Z'
const REMINDER_ISO = '2026-11-16T10:00:00Z'

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
  const tools = createSlackTools({
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

function okPayload(data: unknown): string {
  return JSON.stringify({ successful: true, data })
}

function channelRecord(id: string, name: string): Record<string, unknown> {
  return { id, name }
}

function userRecord(
  id: string,
  display: string,
  handle: string
): Record<string, unknown> {
  return {
    id,
    name: handle,
    real_name: display,
    profile: { display_name: display, real_name: display }
  }
}

function channelsPayload(channels: unknown[]): string {
  return okPayload({ ok: true, channels })
}

function usersPayload(members: unknown[]): string {
  return okPayload({ ok: true, members })
}

function sendPayload(channel: string): string {
  return okPayload({ ok: true, channel, ts: '1763290800.000100' })
}

function secondsOf(iso: string): string {
  return String(Date.parse(iso) / 1000)
}

describe('slack tool specs', () => {
  it('exposes five tools with the exact confirmation flags', () => {
    const byName = new Map(
      makeTools({}).tools.map((tool) => [tool.spec.name, tool.spec])
    )

    expect([...byName.keys()].sort()).toEqual([
      'slack_open_dm',
      'slack_read_messages',
      'slack_reminder',
      'slack_schedule_message',
      'slack_send_message'
    ])

    for (const name of [
      'slack_send_message',
      'slack_schedule_message',
      'slack_reminder'
    ]) {
      expect(byName.get(name)?.requiresConfirmation).toBe(true)
      expect(byName.get(name)?.risk).toBe('write')
    }

    for (const name of ['slack_read_messages', 'slack_open_dm']) {
      expect(byName.get(name)?.requiresConfirmation).toBe(false)
    }
  })

  it('keeps every description short', () => {
    for (const tool of makeTools({}).tools) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('slack_send_message', () => {
  it('resolves a channel name and posts the exact text to its id', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_SEND_MESSAGE: () => ({ text: sendPayload(CHANNEL) })
    })
    const text = 'Ship it *today*, not tomorrow.'

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: 'design', message: text },
      makeContext()
    )

    expect(calls).toEqual([
      { slug: 'SLACK_FIND_CHANNELS', args: { query: 'design' } },
      {
        slug: 'SLACK_SEND_MESSAGE',
        args: { channel: CHANNEL, markdown_text: text }
      }
    ])
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toBe('Sent to #design.')
    expect(outcome.target).toBe(CHANNEL)
  })

  it('resolves a person, opens the DM, and posts to the D id', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: channelsPayload([]) }),
      SLACK_FIND_USERS: () => ({
        text: usersPayload([userRecord(USER_ID, 'Sarah Lee', 'sarah')])
      }),
      SLACK_OPEN_DM: () =>
        ({ text: okPayload({ ok: true, channel: { id: DM } }) }),
      SLACK_SEND_MESSAGE: () => ({ text: sendPayload(DM) })
    })

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: 'Sarah', message: 'Running late' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'SLACK_FIND_CHANNELS',
      'SLACK_FIND_USERS',
      'SLACK_OPEN_DM',
      'SLACK_SEND_MESSAGE'
    ])
    expect(calls[2].args).toEqual({ users: USER_ID })
    expect(calls[3].args).toEqual({
      channel: DM,
      markdown_text: 'Running late'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toBe('Sent to Sarah Lee.')
  })

  it('asks for a person when neither a channel nor a user matches', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: channelsPayload([]) }),
      SLACK_FIND_USERS: () => ({ text: usersPayload([]) })
    })

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: 'Ghost', message: 'Hello?' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'SLACK_FIND_CHANNELS',
      'SLACK_FIND_USERS'
    ])
    expect(outcome.status).toBe('error')
    expect(outcome.spokenResponse).toBe(
      'I couldn\'t find a Slack channel or person called "Ghost".'
    )
    expect(calls.some((call) => call.slug === 'SLACK_SEND_MESSAGE')).toBe(false)
  })

  it('treats a leading hash as a channel and never searches people', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: channelsPayload([]) })
    })

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: '#ghost', message: 'Hello?' },
      makeContext()
    )

    expect(calls).toEqual([
      { slug: 'SLACK_FIND_CHANNELS', args: { query: 'ghost' } }
    ])
    expect(outcome.status).toBe('error')
    expect(outcome.spokenResponse).toBe(
      'I couldn\'t find a Slack channel called "#ghost".'
    )
  })

  it('asks which channel when several match', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () => ({
        text: channelsPayload([
          channelRecord(CHANNEL, 'design'),
          channelRecord(OTHER_CHANNEL, 'design-ops')
        ])
      })
    })

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: 'des', message: 'Hello?' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.spokenResponse).toBe(
      'I found more than one match for "des": #design, #design-ops. Which one?'
    )
    expect(calls.some((call) => call.slug === 'SLACK_SEND_MESSAGE')).toBe(false)
  })

  it('asks which person when several users match', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: channelsPayload([]) }),
      SLACK_FIND_USERS: () => ({
        text: usersPayload([
          userRecord(USER_ID, 'Sarah Lee', 'slee'),
          userRecord(SENDER_ID, 'Sarah Chen', 'schen')
        ])
      })
    })

    const outcome = await toolNamed(tools, 'slack_send_message').run(
      { recipient: 'Sarah', message: 'Hello?' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.spokenResponse).toBe(
      'I found more than one match for "Sarah": Sarah Lee, Sarah Chen. Which one?'
    )
    expect(calls.some((call) => call.slug === 'SLACK_OPEN_DM')).toBe(false)
    expect(calls.some((call) => call.slug === 'SLACK_SEND_MESSAGE')).toBe(false)
  })

  it('turns Slack API error codes into plain sentences', async () => {
    const cases: Array<[string, RegExp]> = [
      ['not_in_channel', /not in that channel/i],
      ['channel_not_found', /couldn't find that channel/i],
      ['rate_limited', /rate limiting/i],
      ['cant_dm_this_user', /can't receive direct messages/i],
      ['invalid_auth', /reconnect Slack/i]
    ]

    for (const [code, expected] of cases) {
      const { tools } = makeTools({
        SLACK_FIND_CHANNELS: () =>
          ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
        SLACK_SEND_MESSAGE: () => ({
          text: JSON.stringify({
            successful: false,
            error: { message: code }
          }),
          isError: true
        })
      })

      const outcome = await toolNamed(tools, 'slack_send_message').run(
        { recipient: 'design', message: 'Hello' },
        makeContext()
      )

      expect(outcome.status).toBe('error')
      expect(outcome.spokenResponse).toMatch(expected)
      expect(outcome.spokenResponse ?? '').not.toContain(code)
    }
  })
})

describe('slack_schedule_message', () => {
  it('converts an ISO 8601 time to unix seconds and schedules the message', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_SCHEDULE_MESSAGE: () => ({ text: sendPayload(CHANNEL) })
    })

    const outcome = await toolNamed(tools, 'slack_schedule_message').run(
      { recipient: 'design', message: 'Later', when: SCHEDULE_ISO },
      makeContext()
    )

    expect(calls[1]).toEqual({
      slug: 'SLACK_SCHEDULE_MESSAGE',
      args: {
        channel: CHANNEL,
        markdown_text: 'Later',
        post_at: secondsOf(SCHEDULE_ISO)
      }
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('Scheduled')
    expect(outcome.spokenResponse).toContain('#design')
  })

  it('honours delay_minutes over the ISO time', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_SCHEDULE_MESSAGE: () => ({ text: sendPayload(CHANNEL) })
    })

    await toolNamed(tools, 'slack_schedule_message').run(
      {
        recipient: 'design',
        message: 'Later',
        when: SCHEDULE_ISO,
        delay_minutes: 15
      },
      makeContext()
    )

    expect(calls[1].args['post_at']).toBe(
      String((FIXED_NOW.getTime() + 15 * 60 * 1000) / 1000)
    )
  })
})

describe('slack_read_messages', () => {
  it('strips Slack markup from the spoken text and keeps the raw text', async () => {
    const raw =
      'Hey <@U0EEEEEEE|alex>, *great* _work_ on <#C0AAAAAAA|design>. ' +
      'See <https://x.test|the doc> ~soon~.'
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_FETCH_CONVERSATION_HISTORY: () => ({
        text: okPayload({
          ok: true,
          messages: [{ user: USER_ID, text: raw, ts: '1763290800.000100' }]
        })
      }),
      SLACK_RETRIEVE_DETAILED_USER_INFORMATION: () => ({
        text: okPayload({
          ok: true,
          user: userRecord(USER_ID, 'Alex Kim', 'alex')
        })
      })
    })

    const outcome = await toolNamed(tools, 'slack_read_messages').run(
      { recipient: 'design' },
      makeContext()
    )

    expect(calls[1]).toEqual({
      slug: 'SLACK_FETCH_CONVERSATION_HISTORY',
      args: { channel: CHANNEL, limit: 20 }
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('Newest messages in #design')
    expect(outcome.spokenResponse).toContain('Alex Kim said')
    expect(outcome.spokenResponse).toContain('great work on #design')
    expect(outcome.spokenResponse).toContain('the doc')
    for (const mark of ['*', '_', '~', '<', '>']) {
      expect(outcome.spokenResponse ?? '').not.toContain(mark)
    }
    expect(outcome.results?.[0]['text']).toBe(raw)
    expect(outcome.message).toContain(raw)
  })

  it('reads one thread when a thread timestamp is given', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION: () => ({
        text: okPayload({
          ok: true,
          messages: [{ user: USER_ID, text: 'Thread reply', ts: '2.000100' }]
        })
      }),
      SLACK_RETRIEVE_DETAILED_USER_INFORMATION: () => ({
        text: usersPayload([userRecord(USER_ID, 'Alex Kim', 'alex')]),
        isError: true
      })
    })

    const outcome = await toolNamed(tools, 'slack_read_messages').run(
      { recipient: 'design', thread_ts: '1.000100', limit: 5 },
      makeContext()
    )

    expect(calls[1]).toEqual({
      slug: 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION',
      args: { channel: CHANNEL, ts: '1.000100', limit: 5 }
    })
    // A name that cannot be resolved never fails the read.
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('Thread reply')
  })

  it('reports an empty channel without erroring', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) }),
      SLACK_FETCH_CONVERSATION_HISTORY: () =>
        ({ text: okPayload({ ok: true, messages: [] }) })
    })

    const outcome = await toolNamed(tools, 'slack_read_messages').run(
      { recipient: 'design' },
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toBe('There are no messages in #design.')
  })
})

describe('slack_open_dm', () => {
  it('opens the conversation and reports it', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_USERS: () => ({
        text: usersPayload([userRecord(USER_ID, 'Sarah Lee', 'sarah')])
      }),
      SLACK_OPEN_DM: () =>
        ({ text: okPayload({ ok: true, channel: { id: DM } }) })
    })

    const outcome = await toolNamed(tools, 'slack_open_dm').run(
      { recipient: 'Sarah' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'SLACK_FIND_USERS',
      'SLACK_OPEN_DM'
    ])
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Opened a direct message with Sarah Lee.')
    expect(outcome.target).toBe(DM)
  })
})

describe('slack_reminder', () => {
  it('creates a reminder with unix seconds', async () => {
    const { tools, calls } = makeTools({
      SLACK_CREATE_A_REMINDER: () => ({
        text: okPayload({ ok: true, reminder: { id: 'Rm1' } })
      })
    })

    const outcome = await toolNamed(tools, 'slack_reminder').run(
      { text: 'stretch', when: REMINDER_ISO },
      makeContext()
    )

    expect(calls).toEqual([
      {
        slug: 'SLACK_CREATE_A_REMINDER',
        args: { text: 'stretch', time: secondsOf(REMINDER_ISO) }
      }
    ])
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('reminder')
  })
})

describe('slack confirmation cards', () => {
  it('prepares a send card from the resolved channel', async () => {
    const { tools, calls } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) })
    })
    const tool = toolNamed(tools, 'slack_send_message')

    const prep = await tool.prepare!(
      { recipient: 'design', message: 'Hello team' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(prep.outcome).toBeUndefined()
    expect(prep.arguments).toMatchObject({
      recipient: 'design',
      channel: CHANNEL,
      target_label: '#design',
      message: 'Hello team'
    })
    expect(prep.message).toBe('Send "Hello team" to #design? Approval needed.')
    expect(prep.card).toEqual({
      kind: 'slack_message',
      mode: 'send',
      target: '#design',
      message: 'Hello team',
      when: null,
      channelId: CHANNEL,
      isDm: false,
      threadTs: null
    })
  })

  it('prepares a schedule card with a readable time', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () =>
        ({ text: channelsPayload([channelRecord(CHANNEL, 'design')]) })
    })
    const tool = toolNamed(tools, 'slack_schedule_message')

    const prep = await tool.prepare!(
      { recipient: 'design', message: 'Later', when: SCHEDULE_ISO },
      makeContext()
    )

    expect(prep.outcome).toBeUndefined()
    expect(prep.card?.['kind']).toBe('slack_message')
    expect(prep.card?.['mode']).toBe('schedule')
    expect(prep.card?.['target']).toBe('#design')
    expect(prep.card?.['message']).toBe('Later')
    expect(String(prep.card?.['when'])).toContain('Nov 17')
    expect(String(prep.card?.['when'])).toContain('9:00 AM')
  })

  it('prepares a reminder card', async () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'slack_reminder')

    const prep = await tool.prepare!(
      { text: 'stretch', when: REMINDER_ISO },
      makeContext()
    )

    expect(prep.outcome).toBeUndefined()
    expect(prep.card).toMatchObject({
      kind: 'slack_message',
      mode: 'reminder',
      message: 'stretch'
    })
    expect(String(prep.card?.['when'])).toContain('Nov 16')
  })
})

describe('slack applyEdits', () => {
  it('replaces the message text', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'slack_send_message')

    const applied = tool.applyEdits!(
      { recipient: 'design', channel: CHANNEL, message: 'Old text' },
      { message: 'New text' }
    )

    expect(applied['message']).toBe('New text')
    expect(applied['channel']).toBe(CHANNEL)
  })

  it('re-targets and clears the resolved channel id', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'slack_send_message')

    const applied = tool.applyEdits!(
      { recipient: 'design', channel: CHANNEL, message: 'Hello' },
      { target: '#random' }
    )

    expect(applied['recipient']).toBe('#random')
    expect(applied).not.toHaveProperty('channel')
  })

  it('ignores malformed edits without throwing', () => {
    const { tools } = makeTools({})
    const tool = toolNamed(tools, 'slack_schedule_message')

    const applied = tool.applyEdits!(
      {
        recipient: 'design',
        channel: CHANNEL,
        message: 'Hello',
        when: SCHEDULE_ISO
      },
      { message: 5, when: 'not a date', target: '' }
    )

    expect(applied['message']).toBe('Hello')
    expect(applied['when']).toBe(SCHEDULE_ISO)
    expect(applied['recipient']).toBe('design')
  })
})

describe('slack prepare card metadata', () => {
  it('populates channelId, isDm, and threadTs on send message card', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () => ({
        text: okPayload({ channels: [channelRecord(CHANNEL, 'design')] })
      })
    })
    const tool = toolNamed(tools, 'slack_send_message')
    const prep = await tool.prepare!(
      { recipient: 'design', message: 'Hello', thread_ts: '1700000000.123' },
      makeContext()
    )

    expect(prep.card).toBeDefined()
    expect(prep.card?.['channelId']).toBe(CHANNEL)
    expect(prep.card?.['isDm']).toBe(false)
    expect(prep.card?.['threadTs']).toBe('1700000000.123')
  })

  it('sets isDm to true when recipient is a DM channel', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: okPayload({ channels: [] }) }),
      SLACK_FIND_USERS: () => ({
        text: okPayload({ members: [userRecord(USER_ID, 'Sarah', 'sarah')] })
      }),
      SLACK_OPEN_DM: () => ({
        text: okPayload({ channel: { id: DM } })
      })
    })
    const tool = toolNamed(tools, 'slack_send_message')
    const prep = await tool.prepare!(
      { recipient: 'Sarah', message: 'Hello DM' },
      makeContext()
    )

    expect(prep.card?.['channelId']).toBe(DM)
    expect(prep.card?.['isDm']).toBe(true)
  })

  it('populates channelId and isDm on schedule message card', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () => ({
        text: okPayload({ channels: [channelRecord(CHANNEL, 'design')] })
      })
    })
    const tool = toolNamed(tools, 'slack_schedule_message')
    const prep = await tool.prepare!(
      { recipient: 'design', message: 'Hello future', when: SCHEDULE_ISO },
      makeContext()
    )

    expect(prep.card?.['channelId']).toBe(CHANNEL)
    expect(prep.card?.['isDm']).toBe(false)
  })
})

describe('fetchSlackRecentMessages', () => {
  it('fetches recent channel messages, sorts oldest to newest, and resolves user info', async () => {
    const calls: Array<{ slug: string; args: Record<string, unknown> }> = []
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      calls.push({ slug, args })
      if (slug === 'SLACK_FETCH_CONVERSATION_HISTORY') {
        return {
          text: okPayload({
            messages: [
              { user: 'U1', text: 'First message', ts: '100.0' },
              { user: 'U2', text: 'Second message', ts: '200.0' },
              { user: 'U1', text: 'Third message', ts: '300.0' }
            ]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION') {
        const uid = args['user']
        if (uid === 'U1') {
          return {
            text: okPayload({
              user: {
                id: 'U1',
                name: 'alice',
                real_name: 'Alice W',
                profile: { display_name: 'Alice', image_72: 'https://avatar/u1.png' }
              }
            }),
            isError: false
          }
        }
        if (uid === 'U2') {
          return {
            text: okPayload({
              user: {
                id: 'U2',
                name: 'bob',
                real_name: 'Bob K',
                profile: { display_name: 'Bob', image_72: 'https://avatar/u2.png' }
              }
            }),
            isError: false
          }
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackRecentMessages(callTool, CHANNEL)
    expect(result.success).toBe(true)
    expect(result.messages).toHaveLength(3)
    // Sorted oldest to newest: 100.0, 200.0, 300.0
    expect(result.messages[0].ts).toBe('100.0')
    expect(result.messages[0].text).toBe('First message')
    expect(result.messages[0].username).toBe('Alice')
    expect(result.messages[0].avatar).toBe('https://avatar/u1.png')

    expect(result.messages[2].ts).toBe('300.0')
    expect(result.messages[2].text).toBe('Third message')

    expect(result.users['U1']).toEqual({
      name: 'Alice',
      avatar: 'https://avatar/u1.png'
    })
    expect(result.users['U2']).toEqual({
      name: 'Bob',
      avatar: 'https://avatar/u2.png'
    })
  })

  it('fetches thread messages when threadTs is supplied', async () => {
    let calledThread = false
    const callTool = async (slug: string, _args: Record<string, unknown>) => {
      if (slug === 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION') {
        calledThread = true
        return {
          text: okPayload({
            messages: [{ user: 'U1', text: 'Thread reply', ts: '150.0' }]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION') {
        return {
          text: okPayload({
            user: { id: 'U1', name: 'alice' }
          }),
          isError: false
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackRecentMessages(callTool, CHANNEL, '100.0')
    expect(calledThread).toBe(true)
    expect(result.success).toBe(true)
    expect(result.messages[0].text).toBe('Thread reply')
  })

  it('handles error in message fetching gracefully', async () => {
    const callTool = async () => ({ text: 'Slack error', isError: true })
    const result = await fetchSlackRecentMessages(callTool, CHANNEL)
    expect(result.success).toBe(false)
    expect(result.messages).toEqual([])
    expect(result.users).toEqual({})
  })
})

describe('fetchSlackTargets', () => {
  it('fetches channels and users and returns target items', async () => {
    const callTool = async (slug: string) => {
      if (slug === 'SLACK_LIST_ALL_CHANNELS') {
        return {
          text: okPayload({
            channels: [
              { id: 'C01111111', name: 'general', is_private: false },
              { id: 'C02222222', name: 'secret', is_private: true }
            ]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_FIND_USERS') {
        return {
          text: okPayload({
            members: [
              {
                id: 'U03333333',
                name: 'alice',
                real_name: 'Alice Smith',
                profile: { display_name: 'Alice', image_72: 'https://avatar/alice.png' }
              }
            ]
          }),
          isError: false
        }
      }
      return { text: '{}', isError: false }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)
    expect(result.targets).toHaveLength(3)

    const general = result.targets.find((t) => t.id === 'C01111111')
    expect(general).toEqual({
      id: 'C01111111',
      name: 'general',
      type: 'channel',
      isPrivate: false
    })

    const secret = result.targets.find((t) => t.id === 'C02222222')
    expect(secret).toEqual({
      id: 'C02222222',
      name: 'secret',
      type: 'channel',
      isPrivate: true
    })

    const alice = result.targets.find((t) => t.id === 'U03333333')
    expect(alice).toEqual({
      id: 'U03333333',
      name: 'Alice',
      type: 'dm',
      avatar: 'https://avatar/alice.png'
    })
  })

  it('handles error in target fetching gracefully', async () => {
    const callTool = async () => ({ text: 'Error', isError: true })
    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(false)
    expect(result.targets).toEqual([])
  })
})
