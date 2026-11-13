import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  NOTCH_ANSWER_MAX_HEIGHT_PX,
  applyNotchHistoryRestore,
  computeNotchRegion
} from './Notch'
import { VoiceOsPrompt, VoiceOsAnswer } from './voiceos-notch/markdown'
import { deriveNotchPresentation } from './voiceos-notch/notch-ui'
import VoiceOsNotch from './voiceos-notch/VoiceOsNotch'
import type { HistoryRestorePayload } from '../../shared/types'

describe('Notch history restore', () => {
  it('exports NOTCH_ANSWER_MAX_HEIGHT_PX as 340', () => {
    expect(NOTCH_ANSWER_MAX_HEIGHT_PX).toBe(340)
  })

  describe('applyNotchHistoryRestore', () => {
    it('clears transient states and configures prompt, reply, and result phase', () => {
      const payload: HistoryRestorePayload = {
        prompt: 'What is the speed of light?',
        reply: 'The speed of light in vacuum is approximately 299,792,458 m/s.'
      }

      const restored = applyNotchHistoryRestore(payload)

      // Clears transient cards (weather, emailList, emailCompose are derived from card)
      expect(restored.card).toBeNull()
      expect(restored.results).toBeNull()
      expect(restored.resultsLabel).toBeNull()
      expect(restored.decision).toBeNull()
      expect(restored.rowError).toBeNull()
      expect(restored.openingId).toBeNull()

      // Resets active/transient flags
      expect(restored.isSpeaking).toBe(false)
      expect(restored.isSynthesizing).toBe(false)
      expect(restored.isDismissing).toBe(false)
      expect(restored.isEditingText).toBe(false)
      expect(restored.typedDraft).toBe('')

      // Sets restored content and phase
      expect(restored.transcript).toBe('What is the speed of light?')
      expect(restored.message).toBe(
        'The speed of light in vacuum is approximately 299,792,458 m/s.'
      )
      expect(restored.phase).toBe('result')
    })
  })

  describe('deriveNotchPresentation for restored history', () => {
    it('produces mode=responding, expanded=true, showCancel=false', () => {
      const payload: HistoryRestorePayload = {
        prompt: 'How far is the Moon?',
        reply: 'About 384,400 km on average.'
      }
      const restored = applyNotchHistoryRestore(payload)
      const answer = restored.message?.trim() ?? ''
      const showAnswer =
        !restored.isSynthesizing &&
        (restored.phase === 'result' || restored.phase === 'error') &&
        answer.length > 0
      const hasTranscript = restored.transcript.trim().length > 0
      const hasExpandedContent = hasTranscript || showAnswer

      const presentation = deriveNotchPresentation({
        phase: restored.phase,
        isSynthesizing: restored.isSynthesizing,
        isSpeaking: restored.isSpeaking,
        hasExpandedContent,
        isDismissing: restored.isDismissing
      })

      expect(presentation).toEqual({
        mode: 'responding',
        expanded: true,
        showCancel: false
      })
    })
  })

  describe('computeNotchRegion', () => {
    it('calculates the centered interactive bounding box for expanded notch', () => {
      const region = computeNotchRegion({ width: 640, height: 380 }, 1920)

      expect(region).toEqual({
        left: 640,
        top: 0,
        width: 640,
        height: 380
      })
    })

    it('centers properly on narrower viewports', () => {
      const region = computeNotchRegion({ width: 640, height: 260 }, 1280)

      expect(region).toEqual({
        left: 320,
        top: 0,
        width: 640,
        height: 260
      })
    })

    it('returns null when surface dimensions are zero to allow click-through', () => {
      expect(computeNotchRegion({ width: 0, height: 0 }, 1920)).toBeNull()
      expect(computeNotchRegion({ width: 0, height: 100 }, 1920)).toBeNull()
      expect(computeNotchRegion({ width: 100, height: 0 }, 1920)).toBeNull()
    })
  })

  describe('rendering restored prompt and answer', () => {
    it('renders prompt and answer cards without error styling', () => {
      const payload: HistoryRestorePayload = {
        prompt: 'Summarize today meetings',
        reply: 'You have **two** meetings scheduled today.'
      }

      const promptHtml = renderToStaticMarkup(
        createElement(VoiceOsPrompt, { text: payload.prompt })
      )
      expect(promptHtml).toContain('Summarize today meetings')
      expect(promptHtml).toContain('agent-notch-card-present')

      const answerHtml = renderToStaticMarkup(
        createElement(VoiceOsAnswer, {
          text: payload.reply,
          maxHeight: NOTCH_ANSWER_MAX_HEIGHT_PX,
          isError: false
        })
      )
      expect(answerHtml).toContain('agent-notch-response-scroll')
      expect(answerHtml).toContain('ask-response-markdown')
      expect(answerHtml).toContain('max-height:340px')
      expect(answerHtml).not.toContain('agent-notch-response-error')
      expect(answerHtml).toContain('You have')
    })

    it('renders complete restored notch layout without cancel button or transient cards', () => {
      const payload: HistoryRestorePayload = {
        prompt: 'Check disk space',
        reply: 'You have 120 GB free.'
      }

      const presentation = deriveNotchPresentation({
        phase: 'result',
        isSynthesizing: false,
        isSpeaking: false,
        hasExpandedContent: true,
        isDismissing: false
      })

      const notchHtml = renderToStaticMarkup(
        createElement(
          VoiceOsNotch,
          {
            mode: presentation.mode,
            expanded: presentation.expanded,
            showCancel: presentation.showCancel
          },
          createElement(VoiceOsPrompt, { text: payload.prompt }),
          createElement(VoiceOsAnswer, {
            text: payload.reply,
            maxHeight: NOTCH_ANSWER_MAX_HEIGHT_PX,
            isError: false
          })
        )
      )

      // Contains prompt and reply
      expect(notchHtml).toContain('Check disk space')
      expect(notchHtml).toContain('You have 120 GB free.')

      // Cancel button is omitted (showCancel=false)
      expect(notchHtml).not.toContain('class="agent-notch-request-cancel"')

      // Transient state components are omitted
      expect(notchHtml).not.toContain('kestrel-weather-card')
      expect(notchHtml).not.toContain('kestrel-email-list')
      expect(notchHtml).not.toContain('kestrel-email-compose')
      expect(notchHtml).not.toContain('kestrel-file-results')
      expect(notchHtml).not.toContain('kestrel-decision')
    })
  })
})
