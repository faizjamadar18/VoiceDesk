import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TOP_K,
  Embedder,
  EmbedderUnavailable,
  FastEmbedEmbedder,
  ToolSelector,
  cosine,
  selectorFromEnv
} from './retrieval'
import type { ToolSpec } from './types'

const BUILTINS = new Set(['open_app', 'web_search'])

function spec(
  name: string,
  description: string,
  actionLabel?: string
): ToolSpec {
  return {
    name,
    description,
    parameters: { type: 'object', properties: {}, required: [] },
    risk: 'read',
    requiresConfirmation: false,
    actionLabel
  }
}

function catalog(): ToolSpec[] {
  return [
    spec('open_app', 'Open any installed Windows application'),
    spec('web_search', 'Search the web using the default browser'),
    spec('gmail_send_message', 'Send an email message to a recipient'),
    spec('repo_status', 'Show the working tree status of a code repository'),
    spec('notion_create_page', 'Create a page in a Notion workspace')
  ]
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean)
}

class FakeEmbedder implements Embedder {
  readonly dims: number
  readonly calls: string[][] = []

  constructor(dims = 64) {
    this.dims = dims
  }

  embed(texts: string[]): number[][] {
    this.calls.push([...texts])
    const vectors: number[][] = []
    for (const text of texts) {
      const vector = new Array<number>(this.dims).fill(0)
      for (const token of tokens(text)) {
        let stable = 0
        for (const character of token) {
          stable += character.codePointAt(0) ?? 0
        }
        vector[stable % this.dims] += 1
      }
      vectors.push(vector)
    }
    return vectors
  }
}

class BoomEmbedder implements Embedder {
  calls = 0

  embed(_texts: string[]): number[][] {
    this.calls += 1
    throw new EmbedderUnavailable('boom')
  }
}

function names(selected: ToolSpec[]): string[] {
  return selected.map((item) => item.name)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ToolSelector', () => {
  it('selects a relevant MCP tool by embedding', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 1,
      alwaysInclude: BUILTINS
    })

    const picked = names(selector.select('send an email to bob', catalog()))

    expect(picked).toContain('gmail_send_message')
    expect(picked).toContain('open_app')
    expect(picked).toContain('web_search')
    expect(picked).not.toContain('repo_status')
    expect(picked).not.toContain('notion_create_page')
  })

  it('always includes specs for an unrelated transcript', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 1,
      alwaysInclude: BUILTINS
    })

    const picked = names(selector.select('make me a sandwich', catalog()))

    expect(picked).toContain('open_app')
    expect(picked).toContain('web_search')
  })

  it('limits only non-core tools', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 2,
      alwaysInclude: BUILTINS
    })

    const picked = names(
      selector.select('send an email about repo status in notion', catalog())
    )

    expect(
      picked.filter((name) => !BUILTINS.has(name))
    ).toHaveLength(2)
    expect(picked).toContain('open_app')
    expect(picked).toContain('web_search')
  })

  it('returns only always-included tools for a non-positive top_k', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 0,
      alwaysInclude: BUILTINS
    })

    const picked = names(selector.select('send an email', catalog()))

    expect(new Set(picked)).toEqual(BUILTINS)
  })

  it('returns a pinned tool even when topK is 1 and it would not rank first', () => {
    const selector = new ToolSelector({ embedder: null, topK: 1 })

    selector.pin('notion_create_page')
    const picked = names(selector.select('send an email to alice', catalog()))

    // The pinned tool is offered alongside the single best-ranked candidate,
    // even though it is not the transcript's best match.
    expect(picked).toContain('notion_create_page')
    expect(picked).toContain('gmail_send_message')
    expect(picked.filter((name) => name !== 'notion_create_page')).toHaveLength(1)
  })

  it('keeps original order and does not mutate the input', () => {
    const specs = catalog()
    const snapshot = [...specs]
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 2,
      alwaysInclude: BUILTINS
    })

    const chosen = selector.select('send an email about repo', specs)

    expect(specs).toEqual(snapshot)
    const positions = chosen.map((item) => specs.indexOf(item))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('returns always-included tools plus the first specs for a blank transcript', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 2,
      alwaysInclude: BUILTINS
    })

    const picked = names(selector.select('   ', catalog()))

    for (const name of BUILTINS) {
      expect(picked).toContain(name)
    }
    expect(picked.filter((name) => !BUILTINS.has(name))).toHaveLength(2)
    expect(picked.slice(-2)).toEqual(['gmail_send_message', 'repo_status'])
  })

  it.each([
    ['send an email to alice', 'gmail_send_message'],
    ['repo status', 'repo_status'],
    ['make a notion page', 'notion_create_page']
  ])('keyword fallback ranks %s', (transcript, expected) => {
    const selector = new ToolSelector({ embedder: null, topK: 1 })

    const picked = selector.select(transcript, catalog())

    expect(names(picked)[0]).toBe(expected)
  })

  it('falls back to keywords when the embedder fails and disables it', () => {
    const boom = new BoomEmbedder()
    const selector = new ToolSelector({
      embedder: boom,
      topK: 1,
      alwaysInclude: BUILTINS
    })

    const first = names(selector.select('send an email to alice', catalog()))
    const second = names(selector.select('repo status', catalog()))

    expect(first).toContain('gmail_send_message')
    expect(second).toContain('repo_status')
    expect(boom.calls).toBe(1)
  })

  it('returns an empty list for empty specs', () => {
    const selector = new ToolSelector({
      embedder: new FakeEmbedder(),
      topK: 3,
      alwaysInclude: BUILTINS
    })

    expect(selector.select('anything', [])).toEqual([])
  })

  it('caches tool embeddings across calls', () => {
    const embedder = new FakeEmbedder()
    const specs = catalog()
    const selector = new ToolSelector({
      embedder,
      topK: 2,
      alwaysInclude: BUILTINS
    })

    selector.select('send an email', specs)
    selector.select('repo status', specs)

    const nonCore = specs.filter((item) => !BUILTINS.has(item.name))
    expect(embedder.calls).toHaveLength(3)
    expect(embedder.calls[0]).toHaveLength(nonCore.length)
    expect(embedder.calls[1]).toEqual(['send an email'])
    expect(embedder.calls[2]).toEqual(['repo status'])
  })
})

describe('FastEmbedEmbedder', () => {
  it('returns no vectors for no texts without loading a model', () => {
    const embedder = new FastEmbedEmbedder()

    expect(embedder.embed([])).toEqual([])
  })

  it('raises EmbedderUnavailable when no backend exists', () => {
    const embedder = new FastEmbedEmbedder()

    expect(() => embedder.embed(['hello'])).toThrow(EmbedderUnavailable)
  })

  it('loads an injected backend lazily', () => {
    let loads = 0
    const embedder = new FastEmbedEmbedder('test-model', () => {
      loads += 1
      return {
        embed: (texts) => texts.map(() => [1, 0])
      }
    })

    expect(loads).toBe(0)
    expect(embedder.embed(['a', 'b'])).toEqual([
      [1, 0],
      [1, 0]
    ])
    expect(loads).toBe(1)
    embedder.embed(['c'])
    expect(loads).toBe(1)
  })
})

describe('selectorFromEnv', () => {
  it('returns null when disabled', () => {
    vi.stubEnv('KESTREL_TOOL_RETRIEVAL', '0')

    expect(selectorFromEnv()).toBeNull()
  })

  it('builds a cheap keyword selector when enabled', () => {
    vi.stubEnv('KESTREL_TOOL_RETRIEVAL', '1')
    vi.stubEnv('KESTREL_TOOL_TOP_K', '3')

    const selector = selectorFromEnv()
    if (selector === null) {
      throw new Error('selector was not built')
    }

    expect(selector).toBeInstanceOf(ToolSelector)
    expect(selector.topK).toBe(3)
    expect(
      names(selector.select('send an email to alice', catalog()))
    ).toContain('gmail_send_message')
  })

  it('ignores an invalid top_k', () => {
    vi.stubEnv('KESTREL_TOOL_RETRIEVAL', '1')
    vi.stubEnv('KESTREL_TOOL_TOP_K', 'not-a-number')

    const selector = selectorFromEnv()
    if (selector === null) {
      throw new Error('selector was not built')
    }

    expect(selector.topK).toBe(DEFAULT_TOP_K)
  })

  it('matches the option-a defaults', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe('BAAI/bge-small-en-v1.5')
    expect(DEFAULT_TOP_K).toBe(10)
  })
})

describe('cosine', () => {
  it('returns zero for empty, mismatched, or zero vectors', () => {
    expect(cosine([], [1])).toBe(0)
    expect(cosine([1], [1, 2])).toBe(0)
    expect(cosine([0, 0], [1, 2])).toBe(0)
  })

  it('computes the cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1)
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })
})
