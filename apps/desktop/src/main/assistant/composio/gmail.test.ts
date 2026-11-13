import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  collapseThreads,
  createGmailTools,
  extractEmailBody,
  messageTime,
  selectEmail,
  sortNewestFirst
} from './gmail'
import type { EmailMessage } from './gmail'

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
  const tools = createGmailTools({
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

function message(
  id: string,
  sender: string,
  subject: string,
  snippet: string,
  threadId: string | null = null,
  timestamp: string | null = null
): Record<string, unknown> {
  return { messageId: id, threadId, subject, sender, snippet, timestamp }
}

function listPayload(messages: unknown[]): string {
  return JSON.stringify({ successful: true, data: { messages } })
}

function okPayload(data: unknown): string {
  return JSON.stringify({ successful: true, data })
}

/** Build a bare {@link EmailMessage} for the pure ordering helpers. */
function email(partial: Partial<EmailMessage> & { id: string }): EmailMessage {
  return {
    id: partial.id,
    threadId: partial.threadId ?? null,
    subject: partial.subject ?? '',
    sender: partial.sender ?? '',
    senderAddress: partial.senderAddress ?? null,
    to: partial.to ?? '',
    snippet: partial.snippet ?? '',
    timestamp: partial.timestamp ?? null
  }
}

describe('gmail tool specs', () => {
  it('keeps every description short', () => {
    for (const tool of makeTools({}).tools) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('gmail_list_emails', () => {
  it('asks for unread mail and sends the default search parameters', async () => {
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({
        text: listPayload([message('1', 'Sam', 'Hi', 'hello')])
      })
    })

    await toolNamed(tools, 'gmail_list_emails').run(
      { unread_only: true },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GMAIL_FETCH_EMAILS')
    expect(calls[0].args).toMatchObject({
      query: 'is:unread',
      user_id: 'me',
      max_results: 10,
      verbose: true,
      include_payload: false,
      include_spam_trash: false
    })
  })

  it('formats two messages and speaks both cleaned senders', async () => {
    const items = [
      message(
        '1',
        'Sam <sam@example.com>',
        'Report',
        'the numbers look good',
        null,
        '2026-11-06T09:00:00Z'
      ),
      message(
        '2',
        'Alex <alex@example.com>',
        'Lunch',
        'are we still on',
        null,
        '2026-11-07T09:00:00Z'
      )
    ]
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      { query: 'from:sam' },
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Here are your 2 latest emails.')
    expect(outcome.spokenResponse).toContain('Sam, Report')
    expect(outcome.spokenResponse).toContain('Alex, Lunch')
  })

  it('sorts newest first and caps the list at five rows', async () => {
    const items = [
      message('m1', 'One', 'First', 'a', null, '2026-11-01T00:00:00Z'),
      message('m2', 'Two', 'Second', 'b', null, '2026-11-02T00:00:00Z'),
      message('m3', 'Three', 'Third', 'c', null, '2026-11-03T00:00:00Z'),
      message('m4', 'Four', 'Fourth', 'd', null, '2026-11-04T00:00:00Z'),
      message('m5', 'Five', 'Fifth', 'e', null, '2026-11-05T00:00:00Z'),
      message('m6', 'Six', 'Sixth', 'f', null, '2026-11-06T00:00:00Z')
    ]
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      {},
      makeContext()
    )

    const card = outcome.card as { rows: Array<{ title: string }> }
    expect(card.rows).toHaveLength(5)
    expect(card.rows.map((row) => row.title)).toEqual([
      'Six',
      'Five',
      'Four',
      'Three',
      'Two'
    ])
    expect(outcome.message).toBe('Here are your 5 latest emails.')
  })

  it('builds an email_list card with the expected title and row shape', async () => {
    const items = [
      message(
        'm1',
        'Sam <sam@example.com>',
        'Re: Fwd: Report',
        'preview',
        null,
        '2026-11-11T09:00:00Z'
      )
    ]
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload(items) })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      {},
      makeContext()
    )

    expect(outcome.card).toMatchObject({
      kind: 'email_list',
      title: 'Latest inbox emails',
      rows: [{ title: 'Sam', subtitle: 'Report', trailing: 'Nov 11' }]
    })
  })

  it('titles the card for unread mail', async () => {
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({
        text: listPayload([message('m1', 'Sam', 'Hi', 'a')])
      })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      { unread_only: true },
      makeContext()
    )

    expect(outcome.card).toMatchObject({ title: 'Unread inbox: first 1' })
    expect(outcome.message).toBe('Here are your 1 latest unread emails.')
  })

  it('says it could not find any email when the search is empty', async () => {
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload([]) })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      { query: 'from:sam' },
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain("couldn't find any emails")
    expect(outcome.spokenResponse).toContain("couldn't find any emails")
    expect(outcome.card).toBeUndefined()
  })

  it('says there are no unread emails when the unread inbox is empty', async () => {
    const { tools } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload([]) })
    })

    const outcome = await toolNamed(tools, 'gmail_list_emails').run(
      { unread_only: true },
      makeContext()
    )

    expect(outcome.message).toBe('You have no unread emails.')
  })
})

describe('email ordering helpers', () => {
  it('messageTime reads epoch millis for numeric and ISO timestamps', () => {
    expect(messageTime(email({ id: 'a', timestamp: '1700000000000' }))).toBe(
      1700000000000
    )
    expect(
      messageTime(email({ id: 'b', timestamp: '2026-11-11T09:00:00Z' }))
    ).toBe(Date.parse('2026-11-11T09:00:00Z'))
    expect(messageTime(email({ id: 'c', timestamp: null }))).toBe(0)
    expect(messageTime(email({ id: 'd', timestamp: 'not a date' }))).toBe(0)
  })

  it('sortNewestFirst orders newest first and keeps unknown times stable', () => {
    const a = email({ id: 'a', timestamp: '2026-11-01T00:00:00Z' })
    const b = email({ id: 'b', timestamp: '2026-11-03T00:00:00Z' })
    const c = email({ id: 'c', timestamp: '2026-11-02T00:00:00Z' })
    expect(sortNewestFirst([a, b, c]).map((item) => item.id)).toEqual([
      'b',
      'c',
      'a'
    ])

    const x = email({ id: 'x', timestamp: null })
    const y = email({ id: 'y', timestamp: null })
    expect(sortNewestFirst([x, y]).map((item) => item.id)).toEqual(['x', 'y'])
  })

  it('collapseThreads keeps the newest message per thread', () => {
    const newest = email({
      id: 't1b',
      threadId: 't1',
      timestamp: '2026-11-05T00:00:00Z'
    })
    const older = email({
      id: 't1a',
      threadId: 't1',
      timestamp: '2026-11-01T00:00:00Z'
    })
    const solo = email({ id: 's1', threadId: null })

    expect(collapseThreads([newest, older, solo]).map((item) => item.id)).toEqual(
      ['t1b', 's1']
    )
  })

  it('selectEmail is 1-based and clamps into range', () => {
    const list = [email({ id: 'a' }), email({ id: 'b' }), email({ id: 'c' })]

    expect(selectEmail(list, 1)?.id).toBe('a')
    expect(selectEmail(list, 2)?.id).toBe('b')
    expect(selectEmail(list, 0)?.id).toBe('a')
    expect(selectEmail(list, 99)?.id).toBe('c')
    expect(selectEmail([], 1)).toBeNull()
  })
})

describe('gmail_read_email', () => {
  it('fetches a message by id and decodes its body', async () => {
    const body = Buffer.from('The full report body.', 'utf8').toString(
      'base64url'
    )
    const payload = {
      messageId: 'm1',
      subject: 'Report',
      sender: 'Sam <sam@example.com>',
      payload: { mimeType: 'text/plain', body: { data: body } }
    }
    const { tools, calls } = makeTools({
      GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: () => ({ text: okPayload(payload) })
    })

    const outcome = await toolNamed(tools, 'gmail_read_email').run(
      { message_id: 'm1' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID')
    expect(calls[0].args).toMatchObject({
      message_id: 'm1',
      user_id: 'me',
      format: 'full'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('The full report body.')
    expect(outcome.message).toContain('Subject "Report"')
  })

  it('lists by query, then fetches the resolved message', async () => {
    const body = Buffer.from('Second email body.', 'utf8').toString('base64url')
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({
        text: listPayload([
          message('m2', 'Alex <alex@example.com>', 'Lunch', 'are we on')
        ])
      }),
      GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: () => ({
        text: okPayload({
          messageId: 'm2',
          subject: 'Lunch',
          sender: 'Alex <alex@example.com>',
          payload: { mimeType: 'text/plain', body: { data: body } }
        })
      })
    })

    const outcome = await toolNamed(tools, 'gmail_read_email').run(
      { query: 'from:alex' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual([
      'GMAIL_FETCH_EMAILS',
      'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID'
    ])
    expect(calls[0].args).toMatchObject({
      user_id: 'me',
      query: 'from:alex',
      max_results: 10,
      verbose: true,
      include_payload: false
    })
    expect(calls[1].args).toMatchObject({
      message_id: 'm2',
      user_id: 'me',
      format: 'full'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Second email body.')
  })

  it('reads the newest by default and the second newest with position 2', async () => {
    const items = [
      message(
        'old',
        'Sam <sam@example.com>',
        'Older',
        'a',
        null,
        '2026-11-01T00:00:00Z'
      ),
      message(
        'new',
        'Alex <alex@example.com>',
        'Newer',
        'b',
        null,
        '2026-11-05T00:00:00Z'
      )
    ]
    const body = Buffer.from('body', 'utf8').toString('base64url')
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload(items) }),
      GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: (args) => ({
        text: okPayload({
          messageId: args['message_id'],
          subject: 'Newer',
          sender: 'Alex <alex@example.com>',
          payload: { mimeType: 'text/plain', body: { data: body } }
        })
      })
    })

    await toolNamed(tools, 'gmail_read_email').run({}, makeContext())
    expect(calls[1].args).toMatchObject({ message_id: 'new' })

    calls.length = 0
    await toolNamed(tools, 'gmail_read_email').run(
      { position: 2 },
      makeContext()
    )
    expect(calls[1].args).toMatchObject({ message_id: 'old' })
  })

  it('passes is:unread to the list call when unread_only is set', async () => {
    const body = Buffer.from('body', 'utf8').toString('base64url')
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({
        text: listPayload([message('m1', 'Sam', 'Hi', 'a')])
      }),
      GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: () => ({
        text: okPayload({
          messageId: 'm1',
          payload: { mimeType: 'text/plain', body: { data: body } }
        })
      })
    })

    await toolNamed(tools, 'gmail_read_email').run(
      { unread_only: true },
      makeContext()
    )

    expect(calls[0].args).toMatchObject({ query: 'is:unread' })
  })

  it('reports when nothing matches the query', async () => {
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload([]) })
    })

    const outcome = await toolNamed(tools, 'gmail_read_email').run(
      { query: 'from:sam' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('I couldn\'t find an email matching "from:sam".')
    expect(
      calls.some((call) => call.slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID')
    ).toBe(false)
  })
})

describe('gmail_send_email', () => {
  it('sends to a plain email address', async () => {
    const { tools, calls } = makeTools({
      GMAIL_SEND_EMAIL: () => ({ text: okPayload({ id: 'sent' }) })
    })

    const outcome = await toolNamed(tools, 'gmail_send_email').run(
      { recipient: 'sam@example.com', subject: 'Hi', body: 'Hello there' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GMAIL_SEND_EMAIL')
    expect(calls[0].args).toMatchObject({
      user_id: 'me',
      recipient_email: 'sam@example.com',
      subject: 'Hi',
      body: 'Hello there',
      is_html: false
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Sent "Hi" to sam@example.com.')
  })

  it('asks for an address instead of calling when only a name is given', async () => {
    const { tools, calls } = makeTools({})

    const outcome = await toolNamed(tools, 'gmail_send_email').run(
      { recipient: 'Sam', subject: 'Hi', body: 'Hello' },
      makeContext()
    )

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('error')
    expect(outcome.message).toContain('email address')
  })

  it('extracts the address from a display name', async () => {
    const { tools, calls } = makeTools({
      GMAIL_SEND_EMAIL: () => ({ text: okPayload({}) })
    })

    await toolNamed(tools, 'gmail_send_email').run(
      { recipient: 'Sam <sam@example.com>', subject: 'Hi', body: 'Hello' },
      makeContext()
    )

    expect(calls[0].args['recipient_email']).toBe('sam@example.com')
  })

  it('prepares a send compose card without any network call', async () => {
    const { tools, calls } = makeTools({})
    const tool = toolNamed(tools, 'gmail_send_email')

    const prepared = await tool.prepare!(
      { recipient: 'sam@example.com', subject: 'Hi', body: 'Hello there' },
      makeContext()
    )

    expect(calls).toHaveLength(0)
    expect(prepared.outcome).toBeUndefined()
    expect(prepared.message).toBe(
      'Send "Hi" to sam@example.com? Approval needed.'
    )
    expect(prepared.arguments).toMatchObject({
      recipient_email: 'sam@example.com',
      subject: 'Hi',
      body: 'Hello there'
    })
    expect(prepared.card).toMatchObject({
      kind: 'email_compose',
      mode: 'send',
      title: 'New Message',
      to: ['sam@example.com'],
      cc: [],
      bcc: [],
      subject: 'Hi',
      body: 'Hello there',
      threadCount: null
    })
  })

  it('prepares an error without a card when the recipient is not an address', async () => {
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload([]) })
    })
    const tool = toolNamed(tools, 'gmail_send_email')

    const prepared = await tool.prepare!(
      { recipient: 'Sam', subject: 'Hi', body: 'Hello' },
      makeContext()
    )

    expect(calls.map((call) => call.slug)).toEqual(['GMAIL_FETCH_EMAILS'])
    expect(prepared.card).toBeUndefined()
    expect(prepared.outcome?.status).toBe('error')
    expect(prepared.outcome?.message).toContain('email address')
  })
})

describe('gmail_reply_email', () => {
  it('resolves the thread, builds a reply card, and sends without re-listing', async () => {
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({
        text: listPayload([
          message(
            'm1',
            'Sam <sam@example.com>',
            'Meeting',
            'sure',
            'thread-9',
            '2026-11-05T00:00:00Z'
          )
        ])
      }),
      GMAIL_FETCH_MESSAGE_BY_THREAD_ID: () => ({
        text: okPayload({
          messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        })
      }),
      GMAIL_REPLY_TO_THREAD: () => ({ text: okPayload({ id: 'reply' }) })
    })
    const tool = toolNamed(tools, 'gmail_reply_email')

    const prepared = await tool.prepare!(
      { query: 'from:sam', message: "I'll be there" },
      makeContext()
    )

    expect(prepared.card).toMatchObject({
      kind: 'email_compose',
      mode: 'reply',
      title: 'Reply',
      to: ['sam@example.com'],
      cc: [],
      bcc: [],
      subject: 'Meeting',
      body: "I'll be there",
      threadCount: 3
    })
    expect(prepared.arguments).toMatchObject({
      thread_id: 'thread-9',
      recipient_email: 'sam@example.com',
      message_body: "I'll be there",
      subject: 'Meeting'
    })

    calls.length = 0
    const outcome = await tool.run(prepared.arguments, makeContext())

    expect(calls.map((call) => call.slug)).toEqual(['GMAIL_REPLY_TO_THREAD'])
    expect(calls[0].args).toMatchObject({
      user_id: 'me',
      thread_id: 'thread-9',
      recipient_email: 'sam@example.com',
      message_body: "I'll be there"
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Replied to "Meeting" from Sam.')
  })

  it('reports when nothing matches the query', async () => {
    const { tools, calls } = makeTools({
      GMAIL_FETCH_EMAILS: () => ({ text: listPayload([]) })
    })

    const prepared = await toolNamed(tools, 'gmail_reply_email').prepare!(
      { query: 'from:sam', message: 'Hi' },
      makeContext()
    )

    expect(prepared.card).toBeUndefined()
    expect(prepared.outcome?.status).toBe('error')
    expect(prepared.outcome?.message).toContain("couldn't find")
    expect(
      calls.some((call) => call.slug === 'GMAIL_REPLY_TO_THREAD')
    ).toBe(false)
  })
})

describe('gmail_create_draft', () => {
  it('saves a draft to a valid recipient', async () => {
    const { tools, calls } = makeTools({
      GMAIL_CREATE_EMAIL_DRAFT: () => ({ text: okPayload({ id: 'draft' }) })
    })

    const outcome = await toolNamed(tools, 'gmail_create_draft').run(
      { recipient: 'sam@example.com', subject: 'Draft', body: 'Body' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GMAIL_CREATE_EMAIL_DRAFT')
    expect(calls[0].args).toMatchObject({
      user_id: 'me',
      recipient_email: 'sam@example.com',
      subject: 'Draft',
      body: 'Body',
      is_html: false
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Saved a draft to sam@example.com')
  })

  it('asks for an address instead of calling when only a name is given', async () => {
    const { tools, calls } = makeTools({})

    const outcome = await toolNamed(tools, 'gmail_create_draft').run(
      { recipient: 'Sam', subject: 'Draft', body: 'Body' },
      makeContext()
    )

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('error')
    expect(outcome.message).toContain('email address')
  })

  it('prepares a draft compose card', async () => {
    const { tools, calls } = makeTools({})
    const tool = toolNamed(tools, 'gmail_create_draft')

    const prepared = await tool.prepare!(
      { recipient: 'sam@example.com', subject: 'Draft', body: 'Body' },
      makeContext()
    )

    expect(calls).toHaveLength(0)
    expect(prepared.message).toBe(
      'Save a draft to sam@example.com with subject "Draft"? Approval needed.'
    )
    expect(prepared.card).toMatchObject({
      kind: 'email_compose',
      mode: 'draft',
      title: 'New Message',
      to: ['sam@example.com'],
      cc: [],
      bcc: [],
      subject: 'Draft',
      body: 'Body',
      threadCount: null
    })
  })
})

describe('extractEmailBody', () => {
  it('decodes base64url plain parts and strips html tags', () => {
    const plain = Buffer.from('Hello from the plain part.', 'utf8').toString(
      'base64url'
    )
    const html = Buffer.from('<p>Hello <b>world</b></p>', 'utf8').toString(
      'base64url'
    )

    expect(
      extractEmailBody({
        payload: { mimeType: 'text/plain', body: { data: plain } }
      })
    ).toBe('Hello from the plain part.')

    expect(
      extractEmailBody({
        payload: { mimeType: 'text/html', body: { data: html } }
      })
    ).toBe('Hello world')
  })
})

describe('gmail tool specs', () => {
  it('marks writes as confirmed and reads as confirmed-free', () => {
    const { tools } = makeTools({})
    const byName = new Map(tools.map((tool) => [tool.spec.name, tool.spec]))

    expect([...byName.keys()].sort()).toEqual([
      'gmail_create_draft',
      'gmail_list_emails',
      'gmail_read_email',
      'gmail_reply_email',
      'gmail_send_email'
    ])
    expect(byName.get('gmail_list_emails')?.requiresConfirmation).toBe(false)
    expect(byName.get('gmail_read_email')?.requiresConfirmation).toBe(false)
    for (const name of [
      'gmail_send_email',
      'gmail_reply_email',
      'gmail_create_draft'
    ]) {
      expect(byName.get(name)?.requiresConfirmation).toBe(true)
    }
  })
})

describe('dry-run mode', () => {
  it('reports what would run without calling Composio', async () => {
    const { tools, calls } = makeTools({})
    const ctx = makeContext({ dryRun: true })

    const outcomes = await Promise.all([
      toolNamed(tools, 'gmail_send_email').run(
        { recipient: 'sam@example.com', subject: 'Hi', body: 'Hello' },
        ctx
      ),
      toolNamed(tools, 'gmail_reply_email').run(
        { query: 'from:sam', message: 'Hi' },
        ctx
      ),
      toolNamed(tools, 'gmail_create_draft').run(
        { recipient: 'sam@example.com', subject: 'Draft', body: 'Body' },
        ctx
      )
    ])

    expect(outcomes.map((outcome) => outcome.message)).toEqual([
      'Would run gmail_send_email.',
      'Would run gmail_reply_email.',
      'Would run gmail_create_draft.'
    ])
    expect(calls).toHaveLength(0)
  })

  it('prepare makes no network call in dry-run mode', async () => {
    const { tools, calls } = makeTools({})
    const ctx = makeContext({ dryRun: true })

    const prepared = await toolNamed(tools, 'gmail_send_email').prepare!(
      { recipient: 'sam@example.com', subject: 'Hi', body: 'Hello' },
      ctx
    )

    expect(calls).toHaveLength(0)
    expect(prepared.card).toBeUndefined()
    expect(prepared.outcome).toBeUndefined()
  })
})
