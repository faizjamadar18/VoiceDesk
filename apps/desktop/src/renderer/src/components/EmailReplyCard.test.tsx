// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { EmailReplyCard } from './EmailReplyCard'
import type { NotchEmailReplyCard } from '../../../shared/types'

// Minimal document / window for the node test environment, matching the
// GoogleDriveCard test.
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

function getReactProps(node: ReactPropsNode): Record<string, any> | null {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  return key ? node[key] : null
}

const CARD: NotchEmailReplyCard = {
  kind: 'email_reply',
  title: 'Reply drafted',
  body: 'Hi Faiz,\n\nThanks for the update.',
  threadCount: 1
}

describe('EmailReplyCard', () => {
  it('copies the draft as soon as it appears, then again from the button', async () => {
    const onCopy = vi.fn()
    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(EmailReplyCard, { card: CARD, onCopy }))
    })

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onCopy).toHaveBeenCalledWith(CARD.body)

    const button = findNode(container, (node) => node.nodeName === 'BUTTON')
    expect(button).not.toBeNull()
    const props = getReactProps(button!)
    expect(props?.children).toBeDefined()

    await act(async () => {
      props!.onClick({ stopPropagation: () => {} })
    })

    expect(onCopy).toHaveBeenCalledTimes(2)
    expect(onCopy).toHaveBeenLastCalledWith(CARD.body)
  })
})
