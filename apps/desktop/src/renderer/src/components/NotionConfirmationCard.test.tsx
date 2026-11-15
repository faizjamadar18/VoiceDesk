// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NotionConfirmationCard, NOTION_DARK } from './NotionConfirmationCard'
import type { NotchNotionCard } from '../../../shared/types'

// Minimal document / window mock for the node environment, matching GoogleDriveCard.test.tsx
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

function clickNode(node: ReactPropsNode): void {
  const props = getReactProps(node)
  if (props && typeof props.onClick === 'function') {
    act(() => {
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

describe('NotionConfirmationCard', () => {
  it('renders static markup for database entry with breadcrumb', () => {
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Hello World',
      parentName: 'Database',
      isDatabase: true
    }

    const html = renderToStaticMarkup(
      createElement(NotionConfirmationCard, { card })
    )

    expect(html).toContain('New Database Entry')
    expect(html).toContain('Database')
    expect(html).toContain('Hello World')
    expect(html).toContain('Content will be added in the next step.')
    expect(html).toContain('Create')
    expect(html).toContain('border-radius:26px')
    expect(html).toContain(NOTION_DARK.blue)
  })

  it('renders static markup for page entry with parent name', () => {
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Launch Plan',
      parentName: 'Projects',
      isDatabase: false
    }

    const html = renderToStaticMarkup(
      createElement(NotionConfirmationCard, { card })
    )

    expect(html).toContain('New Page')
    expect(html).toContain('Projects')
    expect(html).toContain('Launch Plan')
    expect(html).not.toContain('New Database Entry')
  })

  it('renders textarea when content is provided', () => {
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Meeting Notes',
      content: '# Action Items\n- Item 1',
      isDatabase: false
    }

    const html = renderToStaticMarkup(
      createElement(NotionConfirmationCard, { card })
    )

    expect(html).not.toContain('Content will be added in the next step.')
    expect(html).toContain('# Action Items\n- Item 1')
  })

  it('allows editing title and content and submitting with Create', async () => {
    const onConfirm = vi.fn()
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Hello World',
      content: 'Initial text',
      isDatabase: true
    }

    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(NotionConfirmationCard, { card, onConfirm }))
    })

    const titleInput = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Notion title'
    )
    expect(titleInput).not.toBeNull()
    changeInput(titleInput!, 'My New Database Entry')

    const contentInput = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Notion content'
    )
    expect(contentInput).not.toBeNull()
    changeInput(contentInput!, 'Updated content body')

    const createBtn = findNode(
      container,
      (n) => n.nodeName === 'BUTTON' && getNodeText(n).includes('Create')
    )
    expect(createBtn).not.toBeNull()
    clickNode(createBtn!)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({
      title: 'My New Database Entry',
      content: 'Updated content body'
    })
  })

  it('calls onDiscard when close button is clicked', async () => {
    const onDiscard = vi.fn()
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Test',
      isDatabase: true
    }

    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(NotionConfirmationCard, { card, onDiscard }))
    })

    const closeBtn = findNode(
      container,
      (n) => getReactProps(n)?.['aria-label'] === 'Cancel'
    )
    expect(closeBtn).not.toBeNull()
    clickNode(closeBtn!)

    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onConfirm when busy is true', async () => {
    const onConfirm = vi.fn()
    const card: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Busy Test',
      isDatabase: true
    }

    const container = (globalThis.document as any).createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(NotionConfirmationCard, {
          card,
          busy: true,
          onConfirm
        })
      )
    })

    const createBtn = findNode(
      container,
      (n) => n.nodeName === 'BUTTON' && getNodeText(n).includes('Create')
    )
    expect(createBtn).not.toBeNull()
    expect(getReactProps(createBtn!)?.disabled).toBe(true)

    clickNode(createBtn!)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
