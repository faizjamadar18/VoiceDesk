// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveCard, GDRIVE_DARK } from './GoogleDriveCard'
import type { NotchDriveCard } from '../../../shared/types'

// Setup minimal document / window mock for node environment
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

describe('GoogleDriveCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Google Docs variant (format === "document")', () => {
    it('renders Docs header with title input, preview box, toggle pill, and Create Document button', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: 'Sprint Planning Notes',
        content: '# Sprint 42\n- Goal 1\n- Goal 2'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )

      expect(html).toContain('Sprint Planning Notes')
      expect(html).toContain('Document title')
      expect(html).toContain('Preview')
      expect(html).toContain('Edit')
      expect(html).toContain('Create Document')
      expect(html).toContain('Sprint 42')
    })

    it('defaults title to inferred markdown title or Untitled document when card.name is empty', () => {
      const cardWithContent: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: '',
        content: '## Inferred Header Title\nSome content'
      }

      const htmlWithContent = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card: cardWithContent
        })
      )
      expect(htmlWithContent).toContain('Inferred Header Title')

      const cardEmpty: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: '',
        content: ''
      }

      const htmlEmpty = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card: cardEmpty
        })
      )
      expect(htmlEmpty).toContain('Untitled document')
      expect(htmlEmpty).toContain('Document preview')
    })

    it('renders "Edit Document" button when mode === "edit"', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'edit',
        format: 'document',
        name: 'Existing Doc',
        content: 'Updated content'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card
        })
      )

      expect(html).toContain('Edit Document')
    })

    it('toggles to edit mode textarea and confirms with updated name and content', () => {
      const onConfirm = vi.fn()
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: 'Initial Title',
        content: '# Heading\nParagraph 1'
      }

      const container = (globalThis.document as any).createElement('div')
      const root = createRoot(container)

      act(() => {
        root.render(
          createElement(GoogleDriveCard, {
            card,
            onConfirm
          })
        )
      })

      // Initially in preview mode
      expect(container.toString()).toContain('Heading')
      expect(container.toString()).toContain('Paragraph 1')

      // Find and click the "Edit" toggle button
      const editToggleBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          getNodeText(n).trim() === 'Edit'
        )
      })
      expect(editToggleBtn).not.toBeNull()
      clickNode(editToggleBtn!)

      // After clicking Edit, textarea is rendered
      const textareaNode = findNode(container, (n) => {
        const props = getReactProps(n)
        return props?.['aria-label'] === 'Document markdown'
      })
      expect(textareaNode).not.toBeNull()

      // Edit content in textarea
      changeInput(textareaNode!, '# Heading\nParagraph 1\nAdded paragraph')

      // Edit title in title input
      const titleInput = findNode(container, (n) => {
        const props = getReactProps(n)
        return props?.['aria-label'] === 'Document title'
      })
      expect(titleInput).not.toBeNull()
      changeInput(titleInput!, 'Updated Sprint Notes')

      // Click "Create Document"
      const createBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          getNodeText(n).includes('Create Document')
        )
      })
      expect(createBtn).not.toBeNull()
      clickNode(createBtn!)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith({
        name: 'Updated Sprint Notes',
        content: '# Heading\nParagraph 1\nAdded paragraph'
      })
    })
  })

  describe('Google Sheets variant (format === "spreadsheet")', () => {
    it('renders Sheets variant with "Create Spreadsheet" header, file name input, and action button', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'spreadsheet',
        name: 'Q4 Financial Model'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card
        })
      )

      expect(html).toContain('Create Spreadsheet')
      expect(html).toContain('Q4 Financial Model')
      expect(html).toContain('File name')
    })

    it('clicking "Create Spreadsheet" calls onConfirm with edited file name', () => {
      const onConfirm = vi.fn()
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'spreadsheet',
        name: 'Initial Sheet'
      }

      const container = (globalThis.document as any).createElement('div')
      const root = createRoot(container)

      act(() => {
        root.render(
          createElement(GoogleDriveCard, {
            card,
            onConfirm
          })
        )
      })

      const fileNameInput = findNode(container, (n) => {
        const props = getReactProps(n)
        return props?.['aria-label'] === 'File name'
      })
      expect(fileNameInput).not.toBeNull()
      changeInput(fileNameInput!, '2026 Budget.xlsx')

      const createBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          getNodeText(n).includes('Create Spreadsheet')
        )
      })
      expect(createBtn).not.toBeNull()
      clickNode(createBtn!)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith({
        name: '2026 Budget.xlsx',
        content: ''
      })
    })
  })

  describe('TXT and MD variant (format === "text" | "markdown")', () => {
    it('renders TXT file variant with "Create File" header and file name input', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'text',
        name: 'Shortlisted Student.txt',
        content: 'Candidate 1: Alice'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card
        })
      )

      expect(html).toContain('Create File')
      expect(html).toContain('Shortlisted Student.txt')
      expect(html).toContain('Candidate 1: Alice')
    })

    it('renders MD file variant with "Create File" header', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'markdown',
        name: 'README.md',
        content: '# Project README'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card
        })
      )

      expect(html).toContain('Create File')
      expect(html).toContain('README.md')
    })

    it('clicking "Create File" calls onConfirm with file name and content', () => {
      const onConfirm = vi.fn()
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'text',
        name: 'Draft.txt',
        content: 'Hello World'
      }

      const container = (globalThis.document as any).createElement('div')
      const root = createRoot(container)

      act(() => {
        root.render(
          createElement(GoogleDriveCard, {
            card,
            onConfirm
          })
        )
      })

      const createBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          getNodeText(n).includes('Create File')
        )
      })
      expect(createBtn).not.toBeNull()
      clickNode(createBtn!)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith({
        name: 'Draft.txt',
        content: 'Hello World'
      })
    })
  })

  describe('Interactions and busy state', () => {
    it('disables action button when busy is true, shows spinner, and ignores clicks', () => {
      const onConfirm = vi.fn()
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: 'Doc',
        content: 'Body'
      }

      const container = (globalThis.document as any).createElement('div')
      const root = createRoot(container)

      act(() => {
        root.render(
          createElement(GoogleDriveCard, {
            card,
            busy: true,
            onConfirm
          })
        )
      })

      const html = container.toString()
      expect(html).toContain('disabled=""')
      expect(html).toContain('animate-spin')

      const createBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          getNodeText(n).includes('Create Document')
        )
      })
      expect(createBtn).not.toBeNull()
      clickNode(createBtn!)

      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('calls onDiscard when close button is clicked', () => {
      const onDiscard = vi.fn()
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: 'Doc'
      }

      const container = (globalThis.document as any).createElement('div')
      const root = createRoot(container)

      act(() => {
        root.render(
          createElement(GoogleDriveCard, {
            card,
            onDiscard
          })
        )
      })

      const closeBtn = findNode(container, (n) => {
        const props = getReactProps(n)
        return (
          typeof props?.onClick === 'function' &&
          props?.['aria-label'] === 'Cancel'
        )
      })
      expect(closeBtn).not.toBeNull()
      clickNode(closeBtn!)

      expect(onDiscard).toHaveBeenCalledTimes(1)
    })
  })

  describe('Self-contained inline styling and GDRIVE_DARK theme', () => {
    it('exports GDRIVE_DARK with theme palette constants', () => {
      expect(GDRIVE_DARK).toBeDefined()
      expect(GDRIVE_DARK.bg).toBe('#1C1C1E')
      expect(GDRIVE_DARK.bgSecondary).toBe('#2C2C2E')
      expect(GDRIVE_DARK.bgHover).toBe('#3A3A3C')
      expect(GDRIVE_DARK.headerBg).toBe('#232326')
      expect(GDRIVE_DARK.text).toBe('#D1D1D6')
      expect(GDRIVE_DARK.textBright).toBe('#F2F2F7')
      expect(GDRIVE_DARK.blue).toBe('#4285F4')
      expect(GDRIVE_DARK.docsBlue).toBe('#4285F4')
      expect(GDRIVE_DARK.sheetsGreen).toBe('#34A853')
    })

    it('renders outer container and frosted close button with inline styles and no Tailwind classes', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'document',
        name: 'Sprint Planning Notes',
        content: 'Content'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )

      // Outer container has inline styles matching VoiceOS
      expect(html).toContain('background:#1C1C1E')
      expect(html).toContain('border:1px solid rgba(255,255,255,0.10)')
      expect(html).toContain('border-radius:20px')
      expect(html).toContain('box-shadow:0 8px 24px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15)')

      // Close button has frosted glass styling
      expect(html).toContain('background:rgba(120, 120, 128, 0.32)')
      expect(html).toContain('backdrop-filter:blur(8px)')

      // Document paper box has inline styles
      expect(html).toContain('background:#222326')
      expect(html).toContain('border:1px solid rgba(255,255,255,0.12)')

      // Preview / Edit pill toggle has self-contained styling
      expect(html).toContain('background:#3A3A3C') // Active pill
      expect(html).toContain('background:#4285F4') // Primary action button
    })

    it('renders spreadsheet variant with self-contained styles', () => {
      const card: NotchDriveCard = {
        kind: 'drive_file',
        mode: 'create',
        format: 'spreadsheet',
        name: 'Budget Sheet'
      }

      const html = renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card
        })
      )

      expect(html).toContain('background:#232326') // Header row
      expect(html).toContain('background:#2C2C2E') // Row badge wrapper
      expect(html).toContain('background:rgba(255,255,255,0.05)') // Badge container
      expect(html).toContain('background:#4285F4') // Primary action button
    })
  })
})
