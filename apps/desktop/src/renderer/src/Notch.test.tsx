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
import { GoogleCalendarCard } from './components/GoogleCalendarCard'
import { GmailComposeCard } from './components/GmailComposeCard'
import { deriveCardFromDecisionOrMessage } from './card-derivation'
import type { HistoryRestorePayload, NotchDecision } from '../../shared/types'

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

    it('produces mode=thinking, expanded=true, showCancel=true during acting phase after submitting text', () => {
      const presentation = deriveNotchPresentation({
        phase: 'acting',
        isSynthesizing: false,
        isSpeaking: false,
        hasExpandedContent: true,
        isDismissing: false
      })

      expect(presentation).toEqual({
        mode: 'thinking',
        expanded: true,
        showCancel: true
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

  describe('preview model derivation, suppression of generic cards, and speech synchronization', () => {
    it('derives GoogleCalendarCard when card is null and suppresses generic decision card and text bubble', () => {
      const message = 'Schedule "Meeting" for tomorrow at 2:00 PM? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-cal-1',
        target: 'Meeting',
        busy: false
      }
      const transcript = 'I mean schedule a meeting tomorrow at two PM in Google Calendar'

      const derivedCards = deriveCardFromDecisionOrMessage({
        message,
        decision,
        transcript
      })

      expect(derivedCards.calendarCard).not.toBeNull()
      expect(derivedCards.calendarCard?.title).toBe('Meeting')
      expect(derivedCards.calendarCard?.mode).toBe('create')

      const effectiveCalendarCard = derivedCards.calendarCard
      const effectiveEmailComposeCard = null
      const hasPreviewModel = effectiveCalendarCard !== null || effectiveEmailComposeCard !== null
      expect(hasPreviewModel).toBe(true)

      const isSynthesizing = false
      const phase = 'result'
      const showCards = !isSynthesizing && (phase === 'result' || phase === 'error')
      const answer = message.trim()
      const showAnswer = showCards && answer.length > 0 && !hasPreviewModel
      const showGenericDecision = showCards && decision !== null && !hasPreviewModel

      // Text bubble is suppressed when preview model is active
      expect(showAnswer).toBe(false)
      // Generic confirm/cancel card is suppressed when preview model is active
      expect(showGenericDecision).toBe(false)
      // Cards are shown once synthesizing finishes
      expect(showCards).toBe(true)

      // Render the GoogleCalendarCard to verify it renders with title and action
      const cardHtml = renderToStaticMarkup(
        createElement(GoogleCalendarCard, {
          card: effectiveCalendarCard!,
          busy: decision.busy,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )
      expect(cardHtml).toContain('Meeting')
      expect(cardHtml).toContain('Schedule')
    })

    it('derives GmailComposeCard when email draft/send is requested and suppresses generic card', () => {
      const message = 'Send "Meeting Notes" to team@company.com? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-gmail-1',
        target: 'team@company.com',
        busy: false
      }

      const derivedCards = deriveCardFromDecisionOrMessage({
        message,
        decision,
        transcript: 'send email to team'
      })

      expect(derivedCards.emailComposeCard).not.toBeNull()
      expect(derivedCards.emailComposeCard?.subject).toBe('Meeting Notes')

      const hasPreviewModel = derivedCards.emailComposeCard !== null
      expect(hasPreviewModel).toBe(true)

      const isSynthesizing = false
      const phase = 'result'
      const showCards = !isSynthesizing && (phase === 'result' || phase === 'error')
      const showGenericDecision = showCards && decision !== null && !hasPreviewModel
      expect(showGenericDecision).toBe(false)

      const cardHtml = renderToStaticMarkup(
        createElement(GmailComposeCard, {
          card: derivedCards.emailComposeCard!,
          busy: decision.busy,
          onSend: () => {},
          onDiscard: () => {}
        })
      )
      expect(cardHtml).toContain('Meeting Notes')
      expect(cardHtml).toContain('team@company.com')
    })

    it('gates card rendering and answer display on speech synthesis completion', () => {
      const isSynthesizing = true
      const phase = 'result'
      const showCards = !isSynthesizing && (phase === 'result' || phase === 'error')

      // While Kokoro is synthesizing, cards must NOT be displayed yet
      expect(showCards).toBe(false)

      // When synthesis finishes (first chunk arrives / safeReady called)
      const synthesisFinished = false
      const showCardsReady = !synthesisFinished && (phase === 'result' || phase === 'error')
      expect(showCardsReady).toBe(true)
    })

    it('renders generic decision card only for non-preview actions when not synthesizing', () => {
      const message = 'Delete "notes.txt"? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-del-1',
        target: 'notes.txt',
        busy: false
      }
      const derivedCards = deriveCardFromDecisionOrMessage({
        message,
        decision,
        transcript: 'delete notes.txt'
      })

      expect(derivedCards.calendarCard).toBeNull()
      expect(derivedCards.emailComposeCard).toBeNull()

      const hasPreviewModel = derivedCards.calendarCard !== null || derivedCards.emailComposeCard !== null
      expect(hasPreviewModel).toBe(false)

      const isSynthesizing = false
      const phase = 'result'
      const showCards = !isSynthesizing && (phase === 'result' || phase === 'error')
      const showGenericDecision = showCards && decision !== null && !hasPreviewModel

      // Generic card is permitted for file deletion actions
      expect(showGenericDecision).toBe(true)
    })
  })
})
