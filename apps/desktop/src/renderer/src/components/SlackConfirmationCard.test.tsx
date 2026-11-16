// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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

function findButton(
  container: ReactPropsNode,
  label: string
): ReactPropsNode | null {
  return findNode(
    container,
    (n) => n.nodeName === 'BUTTON' && getNodeText(n).includes(label)
  )
}

function clickNode(node: ReactPropsNode): void {
  const props = getReactProps(node)
  if (props && typeof props.onClick === 'function') {
    act(() => {
      props.onClick({ stopPropagation: () => {} })
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

const SEND_CARD: NotchSlackCard = {
  kind: 'slack_message',
  mode: 'send',
  target: '#design',
  message: 'Shipping the new card today.',
  when: null
}

describe('SlackConfirmationCard', () => {
  it('renders the target and message for a send', () => {
    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card: SEND_CARD })
    )

    expect(html).toContain('Send Message')
    expect(html).toContain('#design')
    expect(html).toContain('Shipping the new card today.')
    expect(html).toContain('Approve')
    expect(html).toContain('Cancel')
    expect(html).toContain(SLACK_DARK.blue)
    expect(html).not.toContain('When')
  })

  it('renders the time for a scheduled message', () => {
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

    expect(html).toContain('Schedule Message')
    expect(html).toContain('Sarah Lee')
    expect(html).toContain('Lunch tomorrow?')
    expect(html).toContain('Nov 17, 12:00 PM')
  })

  it('renders the time for a reminder', () => {
    const card: NotchSlackCard = {
      kind: 'slack_message',
      mode: 'reminder',
      target: 'Slack',
      message: 'Send the weekly update',
      when: 'Nov 17, 9:00 AM'
    }

    const html = renderToStaticMarkup(
      createElement(SlackConfirmationCard, { card })
    )

    expect(html).toContain('Set Reminder')
    expect(html).toContain('Slack')
    expect(html).toContain('Send the weekly update')
    expect(html).toContain('Nov 17, 9:00 AM')
  })

  it('approves with the edited and trimmed message', async () => {
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
      (n) => getReactProps(n)?.['aria-label'] === 'Slack message'
    )
    expect(textarea).not.toBeNull()
    changeTextarea(textarea!, '  Edited wording  ')

    const approve = findButton(container, 'Approve')
    expect(approve).not.toBeNull()
    clickNode(approve!)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ message: 'Edited wording' })
  })

  it('cannot approve an empty message', async () => {
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
      (n) => getReactProps(n)?.['aria-label'] === 'Slack message'
    )
    changeTextarea(textarea!, '   ')

    const approve = findButton(container, 'Approve')
    expect(getReactProps(approve!)?.disabled).toBe(true)

    clickNode(approve!)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onDiscard when Cancel is clicked', async () => {
    const onDiscard = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, { card: SEND_CARD, onDiscard })
      )
    })

    const cancel = findButton(container, 'Cancel')
    expect(cancel).not.toBeNull()
    clickNode(cancel!)

    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while busy', async () => {
    const onConfirm = vi.fn()
    const onDiscard = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(SlackConfirmationCard, {
          card: SEND_CARD,
          busy: true,
          onConfirm,
          onDiscard
        })
      )
    })

    const approve = findButton(container, 'Approve')
    const cancel = findButton(container, 'Cancel')
    expect(getReactProps(approve!)?.disabled).toBe(true)
    expect(getReactProps(cancel!)?.disabled).toBe(true)

    clickNode(approve!)
    clickNode(cancel!)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
