import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  createSlackTools,
  extractAvatarUrl,
  extractEmail,
  extractMessages,
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

  it('sets isDm to true and populates avatar when recipient is a DM person', async () => {
    const { tools } = makeTools({
      SLACK_FIND_CHANNELS: () => ({ text: okPayload({ channels: [] }) }),
      SLACK_FIND_USERS: () => ({
        text: okPayload({
          members: [
            {
              ...userRecord(USER_ID, 'Sarah', 'sarah'),
              profile: {
                display_name: 'Sarah',
                real_name: 'Sarah',
                image_192: 'https://avatar/sarah.png'
              }
            }
          ]
        })
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
    expect(prep.card?.['avatar']).toBe('https://avatar/sarah.png')
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

describe('fetchSlackRecentMessages directory resolution', () => {
  it('resolves senders from users.list, asks user info with the user id only, and resolves self', async () => {
    const calls: RecordedCall[] = []
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      calls.push({ slug, args })
      if (slug === 'SLACK_FETCH_CONVERSATION_HISTORY') {
        return {
          text: okPayload({
            messages: [
              { user: 'U0AAAAAAA', text: 'Hi from Alice', ts: '100.0' },
              { user: 'U0BBBBBBB', text: 'Hi from Bob', ts: '200.0' },
              { user: 'U0CCCCCCC', text: 'Hi from nobody', ts: '300.0' }
            ]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_LIST_ALL_USERS') {
        expect(Number(args['limit'])).toBeGreaterThan(0)
        return {
          text: usersPayload([
            {
              id: 'U0AAAAAAA',
              name: 'alice',
              profile: {
                display_name: 'Alice',
                email: 'alice@example.com',
                image_192: 'https://avatar/alice-192.png'
              }
            },
            {
              id: 'U0BBBBBBB',
              name: 'bob',
              profile: { real_name: 'Bob Jones' }
            }
          ]),
          isError: false
        }
      }
      if (slug === 'SLACK_TEST_AUTH') {
        return { text: okPayload({ user_id: 'U0SELFAAA' }), isError: false }
      }
      if (slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION') {
        expect(Object.keys(args)).toEqual(['user'])
        if (args['user'] === 'U0BBBBBBB') {
          return {
            text: okPayload({
              user: {
                id: 'U0BBBBBBB',
                profile: { real_name: 'Bob Jones', image_72: 'https://avatar/bob-72.png' }
              }
            }),
            isError: false
          }
        }
        if (args['user'] === 'U0SELFAAA') {
          return {
            text: okPayload({
              user: {
                id: 'U0SELFAAA',
                real_name: 'Faiz Jamadar',
                profile: {
                  display_name: 'Faiz',
                  image_192: 'https://avatar/self-192.png'
                }
              }
            }),
            isError: false
          }
        }
        return { text: '{}', isError: true }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackRecentMessages(callTool, CHANNEL)
    expect(result.success).toBe(true)

    const detailCall = calls.find(
      (call) =>
        call.slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION' &&
        call.args['user'] === 'U0BBBBBBB'
    )
    expect(detailCall?.args).toEqual({ user: 'U0BBBBBBB' })

    expect(result.users['U0AAAAAAA']).toEqual({
      name: 'Alice',
      avatar: 'https://avatar/alice-192.png'
    })
    expect(result.users['U0BBBBBBB']).toEqual({
      name: 'Bob Jones',
      avatar: 'https://avatar/bob-72.png'
    })
    expect(result.users['U0SELFAAA']).toEqual({
      name: 'Faiz',
      avatar: 'https://avatar/self-192.png'
    })

    const unknown = result.messages.find((m) => m.user === 'U0CCCCCCC')
    expect(unknown?.username).toBeNull()
    expect(unknown?.username).not.toBe('U0CCCCCCC')
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
      if (slug === 'SLACK_LIST_ALL_USERS') {
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

  it('uses users.list as the directory with real names, avatars, and DM ids', async () => {
    const recordedCalls: Array<{ slug: string; args: Record<string, unknown> }> = []
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      recordedCalls.push({ slug, args })
      if (slug === 'SLACK_LIST_ALL_CHANNELS') {
        expect(args['types']).toBe('public_channel,private_channel,im,mpim')
        return {
          text: okPayload({
            channels: [
              { id: 'C01111111', name: 'general', is_private: false },
              { id: 'D01111111', is_im: true, user: 'U03333333' },
              { id: 'D02222222', is_im: true, user: 'U09999999' }
            ]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_LIST_ALL_USERS') {
        expect(Number(args['limit'])).toBeGreaterThan(0)
        if (args['cursor'] === 'page-2') {
          return {
            text: okPayload({
              members: [
                {
                  id: 'U07777777',
                  name: 'carol',
                  profile: {
                    real_name: 'Carol Danvers',
                    image_192: 'https://avatar/carol-192.png'
                  }
                }
              ],
              response_metadata: { next_cursor: '' }
            }),
            isError: false
          }
        }
        return {
          text: okPayload({
            members: [
              {
                id: 'U03333333',
                name: 'alice',
                real_name: 'Alice Smith',
                profile: {
                  display_name: 'Alice',
                  email: 'alice@example.com',
                  image_192: 'https://avatar/alice-192.png'
                }
              },
              {
                id: 'U04444444',
                name: 'bob',
                profile: {
                  display_name: '',
                  real_name: 'Bob Jones',
                  email: 'bob@example.com',
                  image_72: 'https://avatar/bob-72.png'
                }
              },
              {
                id: 'U05555555',
                name: 'deleted_user',
                deleted: true,
                profile: { real_name: 'Deleted', email: 'deleted@example.com' }
              },
              {
                id: 'U06666666',
                name: 'robot',
                is_bot: true,
                profile: { real_name: 'Robot', image_72: 'https://avatar/robot.png' }
              },
              {
                id: 'U08888888',
                name: 'app_user',
                is_app_user: true,
                profile: { real_name: 'App User' }
              },
              { id: 'USLACKBOT', name: 'slackbot', profile: { real_name: 'Slackbot' } },
              { id: 'U0AAAAAAA', profile: {} }
            ],
            response_metadata: { next_cursor: 'page-2' }
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_TEST_AUTH') {
        return { text: okPayload({ user_id: 'U03333333' }), isError: false }
      }
      if (slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION') {
        expect(args).toEqual({ user: 'U09999999' })
        return {
          text: okPayload({
            user: {
              id: 'U09999999',
              name: 'zed',
              profile: {
                display_name: 'Zed',
                email: 'zed@example.com',
                image_512: 'https://avatar/zed-512.png'
              }
            }
          }),
          isError: false
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)

    const slugs = recordedCalls.map((call) => call.slug)
    expect(slugs).not.toContain('SLACK_FIND_USERS')

    // Two user pages were followed.
    const userCalls = recordedCalls.filter((call) => call.slug === 'SLACK_LIST_ALL_USERS')
    expect(userCalls).toHaveLength(2)

    expect(result.targets.find((t) => t.id === 'C01111111')).toEqual({
      id: 'C01111111',
      name: 'general',
      type: 'channel',
      isPrivate: false
    })

    // The DM conversation id wins over the user id.
    expect(result.targets.find((t) => t.id === 'D01111111')).toEqual({
      id: 'D01111111',
      name: 'Alice',
      email: 'alice@example.com',
      type: 'dm',
      avatar: 'https://avatar/alice-192.png'
    })
    expect(result.targets.some((t) => t.id === 'U03333333')).toBe(false)

    // A user with no DM conversation still appears, under their user id.
    expect(result.targets.find((t) => t.id === 'U04444444')).toEqual({
      id: 'U04444444',
      name: 'Bob Jones',
      email: 'bob@example.com',
      type: 'dm',
      avatar: 'https://avatar/bob-72.png'
    })

    // A user from the second cursor page.
    expect(result.targets.find((t) => t.id === 'U07777777')).toEqual({
      id: 'U07777777',
      name: 'Carol Danvers',
      type: 'dm',
      avatar: 'https://avatar/carol-192.png'
    })

    // An IM whose user is missing from users.list is looked up by id.
    expect(result.targets.find((t) => t.id === 'D02222222')).toEqual({
      id: 'D02222222',
      name: 'Zed',
      email: 'zed@example.com',
      type: 'dm',
      avatar: 'https://avatar/zed-512.png'
    })

    for (const skipped of ['U05555555', 'U06666666', 'U08888888', 'USLACKBOT', 'U0AAAAAAA']) {
      expect(result.targets.some((t) => t.id === skipped)).toBe(false)
    }

    // No raw Slack user ids leak into display names.
    for (const target of result.targets) {
      expect(target.name).not.toMatch(/^[UWB][A-Z0-9]{6,}$/)
    }
  })

  it('skips an IM target and a directory row when no real name can be found', async () => {
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      if (slug === 'SLACK_LIST_ALL_CHANNELS') {
        return {
          text: okPayload({
            channels: [{ id: 'D03333333', is_im: true, user: 'U0BBBBBBB' }]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_LIST_ALL_USERS') {
        expect(args['limit']).toBeGreaterThan(0)
        return { text: okPayload({ members: [{ id: 'U0CCCCCCC' }] }), isError: false }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)
    expect(result.targets).toEqual([])
  })

  it('drops internal bots, workflow bots, and raw-id display names from the directory', async () => {
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      if (slug === 'SLACK_LIST_ALL_USERS') {
        expect(args['limit']).toBeGreaterThan(0)
        return {
          text: usersPayload([
            { id: 'USLACK', name: 'slack', profile: { real_name: 'Slack' } },
            { id: 'USLACKBOT', name: 'slackbot', profile: { real_name: 'Slackbot' } },
            {
              id: 'U0BOTBOT1',
              name: 'robot',
              is_bot: true,
              profile: { real_name: 'Robot' }
            },
            {
              id: 'U0WFBOT01',
              name: 'flow',
              is_workflow_bot: true,
              profile: { real_name: 'Workflow' }
            },
            {
              id: 'U0RAWNM01',
              name: 'raw',
              profile: {
                display_name: 'U0CHZ2TK2QJ',
                real_name: 'U0CHZ2TK2QJ'
              }
            },
            {
              id: 'U0FAIZ001',
              name: 'faiz',
              real_name: 'Faiz Jamadar',
              profile: {
                display_name: 'Faiz Jamadar',
                email: 'faizjamadar18@gmail.com',
                image_192: 'https://avatars.slack-edge.com/faiz-192.png'
              }
            }
          ]),
          isError: false
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)
    expect(result.targets).toEqual([
      {
        id: 'U0FAIZ001',
        name: 'Faiz Jamadar',
        email: 'faizjamadar18@gmail.com',
        type: 'dm',
        avatar: 'https://avatars.slack-edge.com/faiz-192.png'
      }
    ])
  })

  it('falls back through channel listing and keeps channels when users.list fails', async () => {
    const calls: Array<{ slug: string; args: Record<string, unknown> }> = []
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      calls.push({ slug, args })
      if (slug === 'SLACK_LIST_ALL_CHANNELS') {
        if (args['types']) {
          return { text: 'Unknown argument types', isError: true }
        }
        return {
          text: okPayload({
            channels: [
              { id: 'C01111111', name: 'general' },
              { id: 'D04444444', is_im: true, user: 'U0DDDDDDD' }
            ]
          }),
          isError: false
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)
    expect(result.targets).toEqual([
      {
        id: 'C01111111',
        name: 'general',
        type: 'channel',
        isPrivate: false
      }
    ])
    expect(calls.filter((c) => c.slug === 'SLACK_LIST_ALL_CHANNELS')).toHaveLength(2)
    expect(calls.map((c) => c.slug)).not.toContain('SLACK_FIND_USERS')
  })

  it('reports success when channels fail but the user directory works', async () => {
    const callTool = async (slug: string) => {
      if (slug === 'SLACK_LIST_ALL_USERS') {
        return {
          text: usersPayload([
            {
              id: 'U0EEEEEEE',
              name: 'dana',
              profile: { real_name: 'Dana Scully', image_72: 'https://avatar/dana.png' }
            }
          ]),
          isError: false
        }
      }
      return { text: '{}', isError: true }
    }

    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(true)
    expect(result.targets).toEqual([
      {
        id: 'U0EEEEEEE',
        name: 'Dana Scully',
        type: 'dm',
        avatar: 'https://avatar/dana.png'
      }
    ])
  })

  it('handles error in target fetching gracefully', async () => {
    const callTool = async () => ({ text: 'Error', isError: true })
    const result = await fetchSlackTargets(callTool)
    expect(result.success).toBe(false)
    expect(result.targets).toEqual([])
  })
})

describe('extractEmail', () => {
  it('extracts email from profile or direct record or nested trees', () => {
    expect(extractEmail({ profile: { email: 'test@example.com' } })).toBe('test@example.com')
    expect(extractEmail({ user_profile: { email: 'user@domain.org' } })).toBe('user@domain.org')
    expect(extractEmail({ email: 'root@company.com' })).toBe('root@company.com')
    expect(extractEmail({ user: { profile: { email: 'nested@sub.co' } } })).toBe('nested@sub.co')
  })

  it('returns undefined when no email is found or invalid', () => {
    expect(extractEmail(null)).toBeUndefined()
    expect(extractEmail(undefined)).toBeUndefined()
    expect(extractEmail({})).toBeUndefined()
    expect(extractEmail({ email: '' })).toBeUndefined()
    expect(extractEmail({ profile: { email: 'notanemail' } })).toBeUndefined()
  })
})

describe('extractAvatarUrl', () => {
  it('ignores avatar_hash and non-URL strings, picking https:// URLs', () => {
    const recordWithHash = {
      profile: {
        avatar_hash: 'ge3b51ca72de',
        image_72: 'https://secure.gravatar.com/avatar/sample.png'
      }
    }
    expect(extractAvatarUrl(recordWithHash)).toBe(
      'https://secure.gravatar.com/avatar/sample.png'
    )

    const nonUrlOnly = {
      user_profile: {
        avatar_hash: 'ge3b51ca72de',
        avatar: 'some_hash_or_string'
      }
    }
    expect(extractAvatarUrl(nonUrlOnly)).toBeUndefined()
  })

  it('searches nested trees including user_profile, profile, and icons', () => {
    const nested = {
      nested: {
        icons: {
          image_48: 'https://a.slack-edge.com/icon48.png'
        }
      }
    }
    expect(extractAvatarUrl(nested)).toBe('https://a.slack-edge.com/icon48.png')

    const deepProfile = {
      user: {
        profile: {
          image_192: 'http://a.slack-edge.com/icon192.png'
        }
      }
    }
    expect(extractAvatarUrl(deepProfile)).toBe('http://a.slack-edge.com/icon192.png')
  })
})

describe('extractMessages avatar and username', () => {
  it('extracts avatar and username from user_profile', () => {
    const payload = {
      messages: [
        {
          user: 'U12345',
          text: 'Hello world',
          ts: '1700000000.000100',
          user_profile: {
            display_name: 'Carol',
            real_name: 'Carol Danvers',
            image_72: 'https://avatar/carol72.png'
          }
        }
      ]
    }
    const msgs = extractMessages(payload)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].username).toBe('Carol')
    expect(msgs[0].avatar).toBe('https://avatar/carol72.png')
  })
})

describe('fetchSlackRecentMessages with message user_profile and userInfo', () => {
  it('pre-populates users from message user_profile and merges userInfo', async () => {
    const callTool = async (slug: string, args: Record<string, unknown>) => {
      if (slug === 'SLACK_FETCH_CONVERSATION_HISTORY') {
        return {
          text: okPayload({
            messages: [
              {
                user: 'U_FROM_MSG',
                text: 'Msg with profile',
                ts: '100.0',
                user_profile: {
                  display_name: 'Inline User',
                  image_72: 'https://avatar/inline.png'
                }
              },
              {
                user: 'U_FROM_INFO',
                text: 'Msg without profile',
                ts: '200.0'
              }
            ]
          }),
          isError: false
        }
      }
      if (slug === 'SLACK_RETRIEVE_DETAILED_USER_INFORMATION') {
        const uid = args['user'] ?? args['user_id']
        if (uid === 'U_FROM_MSG') {
          // Even if userInfo fails for this user, it should keep inline profile
          return { text: '{}', isError: true }
        }
        if (uid === 'U_FROM_INFO') {
          return {
            text: okPayload({
              user: {
                id: 'U_FROM_INFO',
                profile: {
                  display_name: 'Info User',
                  image_512: 'https://avatar/info512.png'
                }
              }
            }),
            isError: false
          }
        }
      }
      return { text: '{}', isError: true }
    }

    const res = await fetchSlackRecentMessages(callTool, CHANNEL)
    expect(res.success).toBe(true)
    expect(res.messages).toHaveLength(2)

    const inlineMsg = res.messages.find((m) => m.user === 'U_FROM_MSG')
    expect(inlineMsg?.username).toBe('Inline User')
    expect(inlineMsg?.avatar).toBe('https://avatar/inline.png')

    const infoMsg = res.messages.find((m) => m.user === 'U_FROM_INFO')
    expect(infoMsg?.username).toBe('Info User')
    expect(infoMsg?.avatar).toBe('https://avatar/info512.png')

    expect(res.users['U_FROM_MSG']).toEqual({
      name: 'Inline User',
      avatar: 'https://avatar/inline.png'
    })
    expect(res.users['U_FROM_INFO']).toEqual({
      name: 'Info User',
      avatar: 'https://avatar/info512.png'
    })
  })
})
