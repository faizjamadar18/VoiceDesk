import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  createNotionTools,
  extractBlockText,
  extractItems,
  extractRows,
  matchItem
} from './notion'

const PAGE_ID = '11111111-1111-1111-1111-111111111111'
const DATABASE_ID = '22222222-2222-2222-2222-222222222222'
const PARENT_ID = '33333333-3333-3333-3333-333333333333'

interface RecordedCall {
  slug: string
  args: Record<string, unknown>
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executor: {
      openApp: async () => undefined,
      openUrl: async () => undefined
    },
    clock: () => new Date('2026-11-07T09:41:12Z'),
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

/**
 * A fake `callTool` that records every call and returns the queued results in
 * order, so a test can describe a whole tool run as a short list of replies.
 */
function makeTools(
  results: Array<{ text: string; isError?: boolean }>
): { tools: Tool[]; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  let index = 0
  const tools = createNotionTools({
    callTool: async (slug, args) => {
      calls.push({ slug, args })
      const result = results[index] ?? { text: '{}' }
      index += 1
      return { text: result.text, isError: result.isError ?? false }
    }
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

function pageRecord(id: string, title: string): Record<string, unknown> {
  return {
    object: 'page',
    id,
    properties: { title: { title: [{ plain_text: title }] } }
  }
}

function databaseRecord(id: string, title: string): Record<string, unknown> {
  return {
    object: 'database',
    id,
    title: [{ plain_text: title }]
  }
}

function resultsPayload(items: unknown[]): string {
  return okPayload({ results: items })
}

function rowRecord(
  title: string,
  properties: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: `row-${title}`,
    properties: {
      Name: { title: [{ plain_text: title }] },
      ...properties
    }
  }
}

describe('notion tool specs', () => {
  it('returns exactly four tools with the expected names', () => {
    const names = makeTools([])
      .tools.map((tool) => tool.spec.name)
      .sort()

    expect(names).toEqual([
      'notion_create_page',
      'notion_query_database',
      'notion_read_page',
      'notion_search'
    ])
  })

  it('keeps every description short', () => {
    for (const tool of makeTools([]).tools) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })

  it('has updated voice-friendly descriptions matching requirements', () => {
    const byName = new Map(
      makeTools([]).tools.map((tool) => [tool.spec.name, tool.spec])
    )

    expect(byName.get('notion_search')?.description).toBe(
      'Find Notion pages and databases by title, name, or keywords.'
    )
    expect(byName.get('notion_read_page')?.description).toBe(
      'Read the text, notes, and content on a Notion page. Use this when the user asks to read, see, or summarize a page by name or id.'
    )
    expect(byName.get('notion_query_database')?.description).toBe(
      'Read, search, and filter rows or entries from a Notion database or table.'
    )
    expect(byName.get('notion_create_page')?.description).toBe(
      'Create a new Notion page under a parent page with a title and optional text.'
    )

    const readParams = byName.get('notion_read_page')?.parameters as {
      properties: Record<string, { description: string }>
    }
    expect(readParams.properties.page.description).toBe(
      "The page title or topic as the user named it (e.g. 'DP', 'Meeting Notes'), or its id."
    )

    const queryParams = byName.get('notion_query_database')?.parameters as {
      properties: Record<string, { description: string }>
    }
    expect(queryParams.properties.database.description).toBe(
      'The database or table as the user named it, or its id.'
    )

    const searchParams = byName.get('notion_search')?.parameters as {
      properties: Record<string, { description: string }>
    }
    expect(searchParams.properties.query.description).toBe(
      'What to search for; leave empty to list everything.'
    )
  })

  it('confirms only the write', () => {
    const byName = new Map(
      makeTools([]).tools.map((tool) => [tool.spec.name, tool.spec])
    )

    expect(byName.get('notion_create_page')?.risk).toBe('write')
    expect(byName.get('notion_create_page')?.requiresConfirmation).toBe(true)

    for (const name of [
      'notion_search',
      'notion_read_page',
      'notion_query_database'
    ]) {
      expect(byName.get(name)?.risk).toBe('read')
      expect(byName.get(name)?.requiresConfirmation).toBe(false)
    }
  })
})

describe('notion_search', () => {
  it('sends the query, filter, and page size and lists the results', async () => {
    const { tools, calls } = makeTools([
      {
        text: resultsPayload([
          pageRecord('p1', 'Roadmap'),
          databaseRecord('d1', 'Tasks')
        ])
      }
    ])

    const outcome = await toolNamed(tools, 'notion_search').run(
      { query: 'road', type: 'page' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('NOTION_SEARCH_NOTION_PAGE')
    expect(calls[0].args).toEqual({
      query: 'road',
      filter_value: 'page',
      page_size: 25
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('- Roadmap (page)')
    expect(outcome.message).toContain('- Tasks (database)')
    expect(outcome.spokenResponse).toContain('Found 2 results in Notion')
    expect(outcome.spokenResponse).toContain('Roadmap')
  })

  it('omits the filter for any and reports an empty result gracefully', async () => {
    const { tools, calls } = makeTools([{ text: resultsPayload([]) }])

    const outcome = await toolNamed(tools, 'notion_search').run(
      { query: 'unicorn', type: 'any' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ query: 'unicorn', page_size: 25 })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain(
      'I couldn\'t find anything in Notion matching "unicorn".'
    )
  })

  it('fetches page text when asked to read or summarize and search yields exactly 1 page', async () => {
    const { tools, calls } = makeTools([
      { text: resultsPayload([pageRecord(PAGE_ID, 'DP')]) },
      {
        text: resultsPayload([
          {
            type: 'paragraph',
            paragraph: { rich_text: [{ plain_text: 'DP project details' }] }
          }
        ])
      }
    ])

    const outcome = await toolNamed(tools, 'notion_search').run(
      { query: 'DP' },
      makeContext({ transcript: 'summarize my DP notes' })
    )

    expect(calls).toHaveLength(2)
    expect(calls[0].slug).toBe('NOTION_SEARCH_NOTION_PAGE')
    expect(calls[1].slug).toBe('NOTION_FETCH_BLOCK_CONTENTS')
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('DP')
    expect(outcome.message).toContain('DP project details')
  })
})

describe('notion_read_page', () => {
  it('resolves a page name and returns its text', async () => {
    const { tools, calls } = makeTools([
      { text: resultsPayload([pageRecord(PAGE_ID, 'Meeting notes')]) },
      {
        text: resultsPayload([
          {
            type: 'paragraph',
            paragraph: { rich_text: [{ plain_text: 'Hello team' }] }
          }
        ])
      }
    ])

    const outcome = await toolNamed(tools, 'notion_read_page').run(
      { page: 'Meeting notes' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(calls[0].slug).toBe('NOTION_SEARCH_NOTION_PAGE')
    expect(calls[0].args).toEqual({
      query: 'Meeting notes',
      filter_value: 'page',
      page_size: 25
    })
    expect(calls[1].slug).toBe('NOTION_FETCH_BLOCK_CONTENTS')
    expect(calls[1].args).toEqual({
      block_id: PAGE_ID,
      page_size: 100
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Meeting notes')
    expect(outcome.message).toContain('Hello team')
  })

  it('uses an id directly without searching', async () => {
    const { tools, calls } = makeTools([
      {
        text: resultsPayload([
          {
            type: 'paragraph',
            paragraph: { rich_text: [{ plain_text: 'Direct text' }] }
          }
        ])
      }
    ])

    const outcome = await toolNamed(tools, 'notion_read_page').run(
      { page: PAGE_ID },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('NOTION_FETCH_BLOCK_CONTENTS')
    expect(calls[0].args).toEqual({ block_id: PAGE_ID, page_size: 100 })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Direct text')
  })

  it('reports an unknown page name as an error', async () => {
    const { tools, calls } = makeTools([{ text: resultsPayload([]) }])

    const outcome = await toolNamed(tools, 'notion_read_page').run(
      { page: 'Ghost' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe(
      'I couldn\'t find a Notion page called "Ghost".'
    )
  })
})

describe('notion_query_database', () => {
  it('resolves a database name and lists its rows', async () => {
    const { tools, calls } = makeTools([
      { text: resultsPayload([databaseRecord(DATABASE_ID, 'Tasks')]) },
      {
        text: resultsPayload([
          rowRecord('Ship it', { Status: { select: { name: 'Done' } } }),
          rowRecord('Plan it', { Status: { select: { name: 'Todo' } } })
        ])
      }
    ])

    const outcome = await toolNamed(tools, 'notion_query_database').run(
      { database: 'Tasks', limit: 10 },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(calls[0].args).toEqual({
      query: 'Tasks',
      filter_value: 'database',
      page_size: 25
    })
    expect(calls[1].slug).toBe('NOTION_QUERY_DATABASE')
    expect(calls[1].args).toEqual({
      database_id: DATABASE_ID,
      page_size: 10
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('2 rows in "Tasks":')
    expect(outcome.message).toContain('Ship it (Status: Done)')
    expect(outcome.spokenResponse).toContain('2 rows in "Tasks".')
  })

  it('reports an empty database', async () => {
    const { tools } = makeTools([
      { text: resultsPayload([databaseRecord(DATABASE_ID, 'Tasks')]) },
      { text: resultsPayload([]) }
    ])

    const outcome = await toolNamed(tools, 'notion_query_database').run(
      { database: 'Tasks' },
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('That database has no rows.')
  })
})

describe('notion_create_page', () => {
  it('resolves the parent and confirms the creation', async () => {
    const { tools, calls } = makeTools([
      { text: resultsPayload([pageRecord(PARENT_ID, 'Projects')]) },
      { text: okPayload({ id: 'new-page' }) }
    ])

    const outcome = await toolNamed(tools, 'notion_create_page').run(
      { title: 'Launch plan', parent: 'Projects', content: '# Hello' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(calls[1].slug).toBe('NOTION_CREATE_NOTION_PAGE')
    expect(calls[1].args).toEqual({
      title: 'Launch plan',
      parent_id: PARENT_ID,
      markdown: '# Hello'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe(
      'Created "Launch plan" in Notion under "Projects".'
    )
  })

  it('omits markdown when no content is given', async () => {
    const { tools, calls } = makeTools([{ text: okPayload({ id: 'new-page' }) }])

    const outcome = await toolNamed(tools, 'notion_create_page').run(
      { title: 'Quick note', parent: PARENT_ID },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({
      title: 'Quick note',
      parent_id: PARENT_ID
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Created "Quick note" in Notion.')
  })

  it('asks for a parent when none is given', async () => {
    const { tools, calls } = makeTools([])

    const outcome = await toolNamed(tools, 'notion_create_page').run(
      { title: 'Orphan' },
      makeContext()
    )

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('Where should I create that page?')
  })

  it('honours dry-run without calling Composio', async () => {
    const { tools, calls } = makeTools([])

    const outcome = await toolNamed(tools, 'notion_create_page').run(
      { title: 'X', parent: 'Projects' },
      makeContext({ dryRun: true })
    )

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Would run notion_create_page.')
  })
})

describe('extractItems', () => {
  it('parses a raw list, a results shape, and missing titles', () => {
    const raw = extractItems([
      { object: 'page', id: 'p1', title: [{ plain_text: 'Alpha' }] },
      {
        object: 'database',
        id: 'd1',
        properties: { Name: { title: [{ plain_text: 'Beta' }] } }
      },
      { object: 'page', id: 'p2' },
      { id: 5 }
    ])

    expect(raw).toEqual([
      { id: 'p1', title: 'Alpha', type: 'page' },
      { id: 'd1', title: 'Beta', type: 'database' },
      { id: 'p2', title: '(untitled)', type: 'page' }
    ])

    expect(
      extractItems({
        results: [
          { object: 'page', id: 'p3', title: [{ plain_text: 'Gamma' }] }
        ]
      })
    ).toEqual([{ id: 'p3', title: 'Gamma', type: 'page' }])
  })
})

describe('extractBlockText', () => {
  it('flattens paragraphs, headings, and child pages and skips empties', () => {
    const text = extractBlockText({
      results: [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'First' }, { plain_text: ' line' }]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ plain_text: 'Section' }] }
        },
        { type: 'child_page', child_page: { title: 'Child' } },
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'divider', divider: {} }
      ]
    })

    expect(text).toBe('First line\nSection\nChild')
  })
})

describe('extractRows', () => {
  it('renders select, number, and date properties', () => {
    const rows = extractRows({
      results: [
        {
          id: 'row-1',
          properties: {
            Name: { title: [{ plain_text: 'Row one' }] },
            Status: { select: { name: 'Done' } },
            Score: { number: 42 },
            Due: { date: { start: '2026-11-20' } },
            Done: { checkbox: true }
          }
        }
      ]
    })

    expect(rows).toEqual([
      {
        title: 'Row one',
        properties: ['Status: Done', 'Score: 42', 'Due: 2026-11-20']
      }
    ])
  })
})

describe('matchItem', () => {
  const budget = { id: '1', title: 'Budget', type: 'page' as const }
  const report = { id: '2', title: 'Budget report', type: 'page' as const }
  const expense = { id: '3', title: 'Expense report', type: 'page' as const }

  it('prefers an exact match over a partial one', () => {
    expect(matchItem([report, budget], 'budget')).toEqual(budget)
  })

  it('accepts a single substring match', () => {
    expect(matchItem([budget, expense], 'expense')).toEqual(expense)
  })

  it('returns null when several titles contain the query', () => {
    expect(matchItem([report, expense], 'report')).toBeNull()
  })

  it('matches when wanted contains the page title', () => {
    expect(matchItem([budget], 'my budget notes')).toEqual(budget)
  })

  it('matches single item directly', () => {
    expect(matchItem([budget], 'something else')).toEqual(budget)
  })
})
