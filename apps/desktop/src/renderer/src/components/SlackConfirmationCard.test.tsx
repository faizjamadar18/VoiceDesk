// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SlackConfirmationCard, SLACK_DARK } from './SlackConfirmationCard'
import type { NotchSlackCard } from '../../../shared/types'

// Minimal document / window mock for the node environment, matching NotionConfirmationCard.test.tsx
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = minDocument
}
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = {
    document: globalThis.document,
    innerWidth: 1024,
    innerHeight: 768,
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLCanvasElement: class HTMLCanvasElement {
      getContext() {
        return null
      }
    },
    SVGElement: class SVGElement {},
    Element: class Element {},
    HTMLElement: class HTMLElement {},
    Node: class Node {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({
      getPropertyValue: () => ''
    }),
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  }
}

if (!(globalThis as any).HTMLIFrameElement) {
  ;(globalThis as any).HTMLIFrameElement = (globalThis as any).window.HTMLIFrameElement
  ;(globalThis as any).SVGElement = (globalThis as any).window.SVGElement
  ;(globalThis as any).Element = (globalThis as any).window.Element
  ;(globalThis as any).HTMLElement = (globalThis as any).window.HTMLElement
  ;(globalThis as any).Node = (globalThis as any).window.Node
}
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(cb, 0) as unknown as number
  ;(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id)
}

interface ReactPropsNode {
  childNodes?: ReactPropsNode[]
  nodeName?: string
  textContent?: string
  data?: string
  [key: string]: any
}

function findNode(
  node: ReactPropsNode,
  predicate: (n: ReactPropsNode) => boolean
): ReactPropsNode | null {
  if (predicate(node)) return node
  if (node.childNodes) {
    for (const child of node.childNodes) {
      const match = findNode(child, predicate)
      if (match) return match
    }
  }
  return null
}

function findAllNodes(
  node: ReactPropsNode,
  predicate: (n: ReactPropsNode) => boolean
): ReactPropsNode[] {
  const results: ReactPropsNode[] = []
  if (predicate(node)) results.push(node)
  if (node.childNodes) {
    for (const child of node.childNodes) {
      results.push(...findAllNodes(child, predicate))
    }
  }
  return results
}

function getNodeText(node?: ReactPropsNode): string {
  if (!node) return ''
  let text = node.textContent || node.data || ''
  if (node.childNodes) {
    for (const child of node.childNodes) {
      text += ' ' + getNodeText(child)
    }
  }
  return text
}

function getReactProps(node: ReactPropsNode): Record<string, any> | null {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  return key ? node[key] : null
}

function clickNode(node: ReactPropsNode): void {
  const props = getReactProps(node)
  if (props && typeof props.onClick === 'function') {
    act(() => {
      props.onClick({ stopPropagation: () => {} })
    })
  }
}

async function clickNodeAsync(node: ReactPropsNode): Promise<void> {
  const props = getReactProps(node)
  if (props && typeof props.onClick === 'function') {
    await act(async () => {
      props.onClick({ stopPropagation: () => {} })
    })
  }
}

function changeInput(node: ReactPropsNode, value: string): void {
  const props = getReactProps(node)
  if (props && typeof props.onChange === 'function') {
    act(() => {
      props.onChange({
        target: { value },
        stopPropagation: () => {}
      })
    })
  }
}

function changeTextarea(node: ReactPropsNode, value: string): void {
  const props = getReactProps(node)
  if (props && typeof props.onChange === 'function') {
    act(() => {
      props.onChange({
        target: { value },
        stopPropagation: () => {}
      })
    })
  }
}

function keyDownNode(
  node: ReactPropsNode,
  event: Record<string, any> = {}
): void {
  const props = getReactProps(node)
  if (props && typeof props.onKeyDown === 'function') {
    act(() => {
      props.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...event
      })
    })
  }
}

const SEND_CARD: NotchSlackCard = {
  kind: 'slack_message',
  mode: 'send',
  target: 'general',
  channelId: 'C12345',
  message: 'Shipping the new card today.',
  when: null
}

describe('SlackConfirmationCard', () => {
  beforeEach(() => {
    delete (globalThis.window as any).kestrel
  })

  it('renders header with Slack logo, target name, and close button', () => {
    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card: SEND_CARD })
    )

    expect(html).toContain('alt="Slack"')
    expect(html).toContain('general')
    expect(html).toContain('aria-label="Cancel"')
    expect(html).toContain(SLACK_DARK.bg)
    expect(html).toContain(SLACK_DARK.green)
  })

  it('renders DM indicator with presence dot when isDm is true', () => {
    const dmCard: NotchSlackCard = {
      kind: 'slack_message',
      mode: 'send',
      target: 'Sarah Lee',
      isDm: true,
      message: 'Hello Sarah',
      when: null
    }

    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card: dmCard })
    )

    expect(html).toContain('Sarah Lee')
    // Green presence dot color
    expect(html).toContain('#2BAC76')
    // Placeholder without '#'
    expect(html).toContain('placeholder="Message Sarah Lee"')
  })

  it('renders shimmer loading state when messages are loading', async () => {
    let resolveMessages!: (value: any) => void
    const pendingPromise = new Promise((resolve) => {
      resolveMessages = resolve
    })

    ;(globalThis.window as any).kestrel = {
      slackFetchMessages: vi.fn().mockReturnValue(pendingPromise),
      slackListChannels: vi.fn().mockResolvedValue({ success: true, targets: [] })
    }

    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(SlackConfirmationCard, { card: SEND_CARD }))
    })

    const shimmerRows = findAllNodes(
      container,
      (n) => getReactProps(n)?.['data-testid'] === 'slack-shimmer-row'
    )
    expect(shimmerRows.length).toBe(3)

    // Complete promise to clean up
    await act(async () => {
      resolveMessages({ success: true, messages: [], users: {} })
    })
  })

  it('renders recent messages with author name, timestamp, and text', () => {
    const cardWithMessages: NotchSlackCard = {
      ...SEND_CARD,
      recentMessages: [
        {
          user: 'U999',
          username: 'Alex',
          text: 'Hey <https://slack.com|Slack> team!',
          ts: '1700000000'
        }
      ]
    }

    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card: cardWithMessages })
    )

    expect(html).toContain('Alex')
    expect(html).toContain('href="https://slack.com"')
    expect(html).toContain('Slack')
  })

  it('groups consecutive messages from the same author without duplicate avatar', () => {
    const cardWithGroupedMessages: NotchSlackCard = {
      ...SEND_CARD,
      recentMessages: [
        {
          user: 'U1',
          username: 'Alex',
          text: 'First line',
          ts: '1700000000'
        },
        {
          user: 'U1',
          username: 'Alex',
          text: 'Second line from same author',
          ts: '1700000005'
        }
      ]
    }

    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card: cardWithGroupedMessages })
    )

    expect(html).toContain('First line')
    expect(html).toContain('Second line from same author')
    // The username Alex should only be rendered in the header of the first message
    const alexMatches = html.match(/>Alex</g)
    expect(alexMatches?.length).toBe(1)
  })

  it('renders schedule badge when mode === "schedule"', () => {
    const card: NotchSlackCard = {
      kind: 'slack_message',
      mode: 'schedule',
      target: 'Sarah Lee',
      message: 'Lunch tomorrow?',
      when: 'Nov 17, 12:00 PM'
    }

    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card })
    )

    expect(html).toContain('📅')
    expect(html).toContain('Nov 17, 12:00 PM')
  })

  it('typing in composer updates value', async () => {
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(SlackConfirmationCard, { card: SEND_CARD }))
    })

    const textarea = findNode(
      container,
      (n) => n.nodeName === 'TEXTAREA'
    )
    expect(textarea).not.toBeNull()
    changeTextarea(textarea!, 'New typed content')

    expect(getReactProps(textarea!)?.value).toBe('New typed content')
  })

  it('clicking the green send button triggers onConfirm with trimmed message, channelId and target', async () => {
    const onConfirm = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, { card: SEND_CARD, onConfirm })
      )
    })

    const textarea = findNode(
      container,
      (n) => n.nodeName === 'TEXTAREA'
    )
    changeTextarea(textarea!, '  Edited wording  ')

    const sendBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Send message'
    )
    expect(sendBtn).not.toBeNull()
    clickNode(sendBtn!)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({
      message: 'Edited wording',
      channelId: 'C12345',
      target: 'general'
    })
  })

  it('pressing Enter in textarea triggers onConfirm', async () => {
    const onConfirm = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, { card: SEND_CARD, onConfirm })
      )
    })

    const textarea = findNode(
      container,
      (n) => n.nodeName === 'TEXTAREA'
    )
    changeTextarea(textarea!, 'Message sent by enter')

    keyDownNode(textarea!, { key: 'Enter', shiftKey: false })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({
      message: 'Message sent by enter',
      channelId: 'C12345',
      target: 'general'
    })
  })

  it('clicking the close button triggers onDiscard', async () => {
    const onDiscard = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, { card: SEND_CARD, onDiscard })
      )
    })

    const closeBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Cancel'
    )
    expect(closeBtn).not.toBeNull()
    clickNode(closeBtn!)

    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('disables send button when message is empty or busy', async () => {
    const onConfirm = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, {
          card: { ...SEND_CARD, message: '' },
          onConfirm
        })
      )
    })

    const sendBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Send message'
    )
    expect(getReactProps(sendBtn!)?.disabled).toBe(true)
    clickNode(sendBtn!)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('toggles target dropdown, filters targets and selects a new target', async () => {
    const onConfirm = vi.fn()
    ;(globalThis.window as any).kestrel = {
      slackFetchMessages: vi.fn().mockResolvedValue({ success: true, messages: [], users: {} }),
      slackListChannels: vi.fn().mockResolvedValue({
        success: true,
        targets: [
          { id: 'C1', name: 'general', type: 'channel' },
          { id: 'C2', name: 'random', type: 'channel' },
          { id: 'D1', name: 'Alice', type: 'dm' }
        ]
      })
    }

    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, { card: SEND_CARD, onConfirm })
      )
    })

    // Click header button to open dropdown
    const headerBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Select channel or person'
    )
    expect(headerBtn).not.toBeNull()
    await clickNodeAsync(headerBtn!)

    // Check search input exists
    const searchInput = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Find a channel or person'
    )
    expect(searchInput).not.toBeNull()

    // Filter by 'Alice'
    changeInput(searchInput!, 'Alice')

    // Find and click the Alice DM target
    const aliceBtn = findNode(
      container,
      (n) => n.nodeName === 'BUTTON' && getNodeText(n).includes('Alice')
    )
    expect(aliceBtn).not.toBeNull()
    await clickNodeAsync(aliceBtn!)

    // Now send the message, and verify onConfirm gets the new target Alice and channelId D1
    const sendBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Send message'
    )
    clickNode(sendBtn!)

    expect(onConfirm).toHaveBeenCalledWith({
      message: 'Shipping the new card today.',
      channelId: 'D1',
      target: 'Alice'
    })
  })
})
