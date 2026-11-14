import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceOsNotch } from './VoiceOsNotch'
import {
  VoiceOsAnswer,
  VoiceOsBottomHint,
  computeScrollFadeClass
} from './markdown'
import {
  NOTCH_DISMISS_ANIMATION_MS,
  createDismissAnimator,
  deriveNotchPresentation,
  shouldShowNotchCancel
} from './notch-ui'
import { getVoiceOsNotchStyleSheet } from './voiceos-notch-styles'

describe('voiceos-notch UI', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('computeScrollFadeClass', () => {
    it('returns empty string when content does not overflow', () => {
      expect(computeScrollFadeClass(340, 340, 0)).toBe('')
      expect(computeScrollFadeClass(341, 340, 0)).toBe('')
      expect(computeScrollFadeClass(200, 340, 0)).toBe('')
    })

    it('returns bottom fade at top scroll position when overflowing', () => {
      expect(computeScrollFadeClass(500, 340, 0)).toBe(
        ' agent-notch-response-scroll-fade-bottom'
      )
      expect(computeScrollFadeClass(500, 340, 1)).toBe(
        ' agent-notch-response-scroll-fade-bottom'
      )
    })

    it('returns both fade in the middle of an overflowing scroll region', () => {
      expect(computeScrollFadeClass(500, 340, 20)).toBe(
        ' agent-notch-response-scroll-fade-both'
      )
    })

    it('returns top fade at the bottom of an overflowing scroll region', () => {
      expect(computeScrollFadeClass(500, 340, 159)).toBe(
        ' agent-notch-response-scroll-fade-top'
      )
      expect(computeScrollFadeClass(500, 340, 160)).toBe(
        ' agent-notch-response-scroll-fade-top'
      )
    })
  })

  describe('VoiceOsAnswer', () => {
    it('renders scroll and markdown containers without SSR warnings', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const html = renderToStaticMarkup(
        createElement(VoiceOsAnswer, {
          text: 'Hello **world**',
          maxHeight: 340
        })
      )

      expect(html).toContain('agent-notch-response-scroll')
      expect(html).toContain('ask-response-markdown')
      expect(html).toContain('max-height:340px')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('applies error styling class when isError is true', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceOsAnswer, {
          text: 'Something went wrong',
          maxHeight: 340,
          isError: true
        })
      )

      expect(html).toContain('agent-notch-response-error')
    })
  })

  describe('VoiceOsBottomHint', () => {
    it('renders Type or hold [Ctrl] [Space] to speak inside .agent-notch-composer', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceOsBottomHint, { keys: ['Ctrl', 'Space'] })
      )

      expect(html).toContain('class="agent-notch-composer"')
      expect(html).toContain('Type or hold')
      expect(html).toContain('<kbd class="agent-notch-keycap">Ctrl</kbd>')
      expect(html).toContain('<kbd class="agent-notch-keycap">Space</kbd>')
      expect(html).toContain('to speak')
    })

    it('supports custom hotkey chords', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceOsBottomHint, { keys: ['Ctrl', 'Alt', 'Space'] })
      )

      expect(html).toContain('<kbd class="agent-notch-keycap">Ctrl</kbd>')
      expect(html).toContain('<kbd class="agent-notch-keycap">Alt</kbd>')
      expect(html).toContain('<kbd class="agent-notch-keycap">Space</kbd>')
    })

    it('includes .agent-notch-keycap and .agent-notch-composer CSS in stylesheet', () => {
      const css = getVoiceOsNotchStyleSheet(200, 'cubic-bezier(0.45, 0, 0.55, 1)')
      expect(css).toContain('.agent-notch-composer')
      expect(css).toContain('.agent-notch-keycap')
      expect(css).toContain('border-radius: 8px;')
    })
  })

  describe('shouldShowNotchCancel', () => {
    it('is false while listening even if other flags are set', () => {
      expect(
        shouldShowNotchCancel({
          phase: 'listening',
          isSynthesizing: false,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(false)
      expect(
        shouldShowNotchCancel({
          phase: 'listening',
          isSynthesizing: true,
          isSpeaking: true,
          isDismissing: false
        })
      ).toBe(false)
    })

    it('is true during processing, acting, synthesizing, or speaking', () => {
      expect(
        shouldShowNotchCancel({
          phase: 'processing',
          isSynthesizing: false,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(true)
      expect(
        shouldShowNotchCancel({
          phase: 'acting',
          isSynthesizing: false,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(true)
      expect(
        shouldShowNotchCancel({
          phase: 'result',
          isSynthesizing: true,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(true)
      expect(
        shouldShowNotchCancel({
          phase: 'result',
          isSynthesizing: false,
          isSpeaking: true,
          isDismissing: false
        })
      ).toBe(true)
      expect(
        shouldShowNotchCancel({
          phase: 'error',
          isSynthesizing: false,
          isSpeaking: true,
          isDismissing: false
        })
      ).toBe(true)
    })

    it('is false once result or error settles with synthesis and speech inactive', () => {
      expect(
        shouldShowNotchCancel({
          phase: 'result',
          isSynthesizing: false,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(false)
      expect(
        shouldShowNotchCancel({
          phase: 'error',
          isSynthesizing: false,
          isSpeaking: false,
          isDismissing: false
        })
      ).toBe(false)
    })

    it('is false while dismissing', () => {
      expect(
        shouldShowNotchCancel({
          phase: 'processing',
          isSynthesizing: true,
          isSpeaking: true,
          isDismissing: true
        })
      ).toBe(false)
    })
  })

  describe('deriveNotchPresentation & VoiceOsNotch rendering', () => {
    it('collapses to idle, unexpanded, and hides cancel when isDismissing is true', () => {
      const presentation = deriveNotchPresentation({
        phase: 'result',
        isSynthesizing: false,
        isSpeaking: true,
        hasExpandedContent: true,
        isDismissing: true
      })

      expect(presentation).toEqual({
        mode: 'idle',
        expanded: false,
        showCancel: false
      })

      const html = renderToStaticMarkup(
        createElement(
          VoiceOsNotch,
          {
            mode: presentation.mode,
            expanded: presentation.expanded,
            showCancel: presentation.showCancel
          },
          createElement(VoiceOsAnswer, { text: 'Answer text' })
        )
      )

      expect(html).toContain('200ms cubic-bezier(0.45, 0, 0.55, 1)')
      expect(html).toContain('opacity:0;transform:translateY(-4px)')
      expect(html).toContain('Answer text')
      expect(html).not.toContain('class="agent-notch-request-cancel"')
    })

    it('renders cancel button when showCancel is true and omits it when false', () => {
      const active = deriveNotchPresentation({
        phase: 'acting',
        isSynthesizing: false,
        isSpeaking: false,
        hasExpandedContent: true,
        isDismissing: false
      })
      expect(active).toEqual({
        mode: 'thinking',
        expanded: true,
        showCancel: true
      })

      const activeHtml = renderToStaticMarkup(
        createElement(VoiceOsNotch, {
          mode: active.mode,
          expanded: active.expanded,
          showCancel: active.showCancel
        })
      )
      expect(activeHtml).toContain('class="agent-notch-request-cancel"')

      const settled = deriveNotchPresentation({
        phase: 'result',
        isSynthesizing: false,
        isSpeaking: false,
        hasExpandedContent: true,
        isDismissing: false
      })
      expect(settled).toEqual({
        mode: 'responding',
        expanded: true,
        showCancel: false
      })

      const settledHtml = renderToStaticMarkup(
        createElement(VoiceOsNotch, {
          mode: settled.mode,
          expanded: settled.expanded,
          showCancel: settled.showCancel
        })
      )
      expect(settledHtml).not.toContain('class="agent-notch-request-cancel"')
    })

    it('uses fade-in animation without forwards', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceOsNotch, { mode: 'idle' })
      )
      expect(html).toContain('animation:agent-notch-fade-in 160ms ease-out')
      expect(html).not.toContain('agent-notch-fade-in 160ms ease-out forwards')
    })

    it('expands surfaceWidth and sets responsive content width on error with message', () => {
      const html = renderToStaticMarkup(
        createElement(
          VoiceOsNotch,
          { mode: 'error' },
          createElement(VoiceOsAnswer, {
            text: "I didn't catch that. Try again a little closer to the mic.",
            isError: true
          })
        )
      )
      // data-agent-notch-geometry-key format: `${surfaceWidth}|${visualSurfaceWidth}|${surfaceHeight}|${bandHeight}`
      expect(html).toContain('data-agent-notch-geometry-key="440|')
      expect(html).toContain('width:416px;max-width:100%')
      expect(html).toContain("I didn&#x27;t catch that. Try again a little closer to the mic.")
    })
  })

  describe('createDismissAnimator', () => {
    it('runs cancelActive immediately, keeps dismissing for NOTCH_DISMISS_ANIMATION_MS, then finishes', () => {
      vi.useFakeTimers()
      let isDismissing = false
      const cancelActive = vi.fn(() => {
        isDismissing = true
      })
      const finishDismiss = vi.fn(() => {
        isDismissing = false
      })

      const animator = createDismissAnimator({
        onStart: cancelActive,
        onFinish: finishDismiss
      })

      expect(NOTCH_DISMISS_ANIMATION_MS).toBe(220)
      expect(animator.start()).toBe(true)
      expect(cancelActive).toHaveBeenCalledTimes(1)
      expect(isDismissing).toBe(true)
      expect(animator.isActive()).toBe(true)
      expect(finishDismiss).not.toHaveBeenCalled()

      // Idempotent while dismissing.
      expect(animator.start()).toBe(false)
      expect(cancelActive).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(NOTCH_DISMISS_ANIMATION_MS - 1)
      expect(finishDismiss).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(finishDismiss).toHaveBeenCalledTimes(1)
      expect(isDismissing).toBe(false)
      expect(animator.isActive()).toBe(false)
    })

    it('cancels pending finish callback when a new session starts', () => {
      vi.useFakeTimers()
      const onStart = vi.fn()
      const onFinish = vi.fn()
      const animator = createDismissAnimator({ onStart, onFinish })

      expect(animator.start()).toBe(true)
      expect(animator.isActive()).toBe(true)

      vi.advanceTimersByTime(100)
      animator.cancel()
      expect(animator.isActive()).toBe(false)

      vi.advanceTimersByTime(NOTCH_DISMISS_ANIMATION_MS)
      expect(onFinish).not.toHaveBeenCalled()

      // Can start a fresh dismiss cycle afterward.
      expect(animator.start()).toBe(true)
      vi.advanceTimersByTime(NOTCH_DISMISS_ANIMATION_MS)
      expect(onFinish).toHaveBeenCalledTimes(1)
    })
  })
})
