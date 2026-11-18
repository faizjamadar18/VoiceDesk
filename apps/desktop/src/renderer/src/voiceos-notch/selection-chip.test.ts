import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  NotchContextStack,
  SelectionBandBadge,
  buildAgentNotchContextItems,
  collapseSelectedText,
  getAgentNotchContextPlacement
} from './selection-chip'
import { VoiceOsPrompt } from './markdown'
import { VoiceOsNotch } from './VoiceOsNotch'
import { getVoiceOsNotchStyleSheet } from './voiceos-notch-styles'

const longSelection =
  'The quick brown fox jumps over the lazy dog every single morning before sunrise'

describe('collapseSelectedText', () => {
  it('collapses newlines and tabs into single spaces and trims the ends', () => {
    expect(collapseSelectedText('  hello\n\nworld\tagain  ')).toBe(
      'hello world again'
    )
    expect(collapseSelectedText('\n\t  ')).toBe('')
  })
})

describe('buildAgentNotchContextItems', () => {
  it('keys each item with the 32-character collapsed-text suffix', () => {
    const [item] = buildAgentNotchContextItems({ selectedText: [longSelection] })

    expect(item.kind).toBe('selectedText')
    expect(item.key).toBe(`selected-text-0-${longSelection.slice(0, 32)}`)
    expect(item.key.length).toBe('selected-text-0-'.length + 32)
    expect(item.description).toBe(longSelection)
    expect(item.text).toBe(longSelection)
    expect(item.selectedTextIndex).toBe(0)
  })

  it('collapses whitespace and drops blank selections while keeping source indexes', () => {
    const items = buildAgentNotchContextItems({
      selectedText: ['first\n   pick', ' \n\t ', 'second pick']
    })

    expect(items.map((item) => item.description)).toEqual([
      'first pick',
      'second pick'
    ])
    expect(items.map((item) => item.selectedTextIndex)).toEqual([0, 2])
    expect(items.map((item) => item.key)).toEqual([
      'selected-text-0-first pick',
      'selected-text-2-second pick'
    ])
  })

  it('returns no items when nothing is selected', () => {
    expect(buildAgentNotchContextItems({ selectedText: null })).toEqual([])
    expect(buildAgentNotchContextItems({ selectedText: undefined })).toEqual([])
    expect(buildAgentNotchContextItems({ selectedText: [] })).toEqual([])
  })
})

describe('getAgentNotchContextPlacement', () => {
  const items = buildAgentNotchContextItems({ selectedText: ['pick'] })

  it('hides the stack when there is no context', () => {
    expect(
      getAgentNotchContextPlacement({ contextItems: [], hasBottomComposer: false })
    ).toBe('hidden')
    expect(
      getAgentNotchContextPlacement({ contextItems: [], hasBottomComposer: true })
    ).toBe('hidden')
  })

  it('places the stack above the turn without a bottom composer', () => {
    expect(
      getAgentNotchContextPlacement({
        contextItems: items,
        hasBottomComposer: false
      })
    ).toBe('before-turn')
  })

  it('places the stack just before the bottom composer when one is present', () => {
    expect(
      getAgentNotchContextPlacement({
        contextItems: items,
        hasBottomComposer: true
      })
    ).toBe('before-composer')
  })
})

describe('NotchContextStack', () => {
  it('renders the selected-text chip with CSS-only single-line ellipsis', () => {
    const items = buildAgentNotchContextItems({ selectedText: [longSelection] })
    const html = renderToStaticMarkup(
      createElement(NotchContextStack, { items, onRemove: () => {} })
    )

    expect(html).toContain('class="agent-notch-context-stack"')
    expect(html).toContain('class="agent-notch-context-chip"')
    expect(html).toContain('max-width:190px')
    expect(html).toContain('height:40px')
    expect(html).toContain('border-radius:11px')
    expect(html).toContain('text-overflow:ellipsis')
    expect(html).toContain('white-space:nowrap')
    // The full collapsed text is the title tooltip and the untruncated label.
    expect(html).toContain(`title="${longSelection}"`)
    expect(html).toContain(`>${longSelection}</span>`)
    expect(html).toContain('aria-label="Remove attachment"')
    expect(html).toContain('agent-notch-context-remove')
  })

  it('staggers each chip entrance by 40ms per index', () => {
    const items = buildAgentNotchContextItems({
      selectedText: ['first pick', 'second pick']
    })
    const html = renderToStaticMarkup(
      createElement(NotchContextStack, { items, onRemove: () => {} })
    )

    expect(html).toContain(
      'agent-notch-attachment-in 240ms cubic-bezier(0.16, 1, 0.3, 1) 0ms both'
    )
    expect(html).toContain(
      'agent-notch-attachment-in 240ms cubic-bezier(0.16, 1, 0.3, 1) 40ms both'
    )
  })
})

describe('SelectionBandBadge', () => {
  it('renders the passive paperclip and count pill', () => {
    const html = renderToStaticMarkup(
      createElement(SelectionBandBadge, { count: 3 })
    )

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('pointer-events:none')
    expect(html).toContain('border-radius:999px')
    expect(html).toContain('>3</span>')
  })
})

describe('voiceos notch band accessory', () => {
  it('renders the selection badge in the collapsed band and drops it once expanded', () => {
    const badge = createElement(SelectionBandBadge, { count: 2 })

    const collapsed = renderToStaticMarkup(
      createElement(VoiceOsNotch, { mode: 'listening', bandAccessory: badge })
    )
    expect(collapsed).toContain('pointer-events:none')
    expect(collapsed).toContain('>2</span>')

    const expanded = renderToStaticMarkup(
      createElement(VoiceOsNotch, {
        mode: 'responding',
        expanded: true,
        bandAccessory: badge
      })
    )
    expect(expanded).not.toContain('>2</span>')
  })
})

describe('voiceos notch stylesheet', () => {
  const css = getVoiceOsNotchStyleSheet(200, 'cubic-bezier(0.45, 0, 0.55, 1)')

  it('declares the attachment entrance keyframes', () => {
    expect(css).toContain('@keyframes agent-notch-attachment-in')
    expect(css).toContain('translateY(3px) scale(0.86)')
    expect(css).toContain('translateY(0) scale(1)')
  })

  it('styles the chip remove badge hover', () => {
    expect(css).toContain('.agent-notch-context-remove')
    expect(css).toContain('.agent-notch-context-remove:hover')
  })
})

describe('VoiceOsPrompt card', () => {
  it('renders the 24px radius prompt card with no hairline border', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceOsPrompt, { text: 'Pinned prompt' })
    )

    expect(html).toContain('border-radius:24px')
    expect(html).toContain('padding:16px 16px')
    expect(html).toContain('background:rgba(255, 255, 255, 0.07)')
    expect(html).toContain('line-height:22px')
    expect(html).not.toContain('1px solid')
  })

  it('uses the same borderless card shell while editing', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceOsPrompt, { text: 'Pinned prompt', isEditing: true })
    )

    expect(html).toContain('border-radius:24px')
    expect(html).toContain('background:rgba(255, 255, 255, 0.09)')
    expect(html).toContain('placeholder="Ask anything')
    expect(html).not.toContain('1px solid')
  })
})
