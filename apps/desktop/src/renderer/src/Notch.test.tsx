import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  NOTCH_ANSWER_MAX_HEIGHT_PX,
  applyNotchHistoryRestore,
  computeNotchRegion,
  deriveShowBottomHint
} from './Notch'
import { resolveNotchCards, retainConfirmation } from './card-derivation'
import { VoiceOsPrompt, VoiceOsAnswer } from './voiceos-notch/markdown'
import { deriveNotchPresentation } from './voiceos-notch/notch-ui'
import VoiceOsNotch from './voiceos-notch/VoiceOsNotch'
import { GoogleCalendarCard } from './components/GoogleCalendarCard'
import { GmailComposeCard } from './components/GmailComposeCard'
import { EmailReplyCard } from './components/EmailReplyCard'
import { GoogleDriveCard } from './components/GoogleDriveCard'
import { NotionConfirmationCard } from './components/NotionConfirmationCard'
import { SlackConfirmationCard } from './components/SlackConfirmationCard'
import type {
  HistoryRestorePayload,
  NotchCalendarCard,
  NotchDecision,
  NotchDriveCard,
  NotchEmailComposeCard,
  NotchEmailReplyCard,
  NotchNotionCard,
  NotchSlackCard,
  NotchWeatherCard
} from '../../shared/types'

const slackSentence =
  'Send "Be Ready with the launch version four" to #all-faiz-hq? Approval needed.'

const slackDecision: NotchDecision = {
  kind: 'confirm',
  planId: 'slack-plan-1',
  target: '#all-faiz-hq',
  busy: false
}

const slackCard: NotchSlackCard = {
  kind: 'slack_message',
  mode: 'send',
  target: '#all-faiz-hq',
  message: 'Be Ready with the launch version four',
  when: null
}

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

    it('resolves restored history to plain answer text', () => {
      const restored = applyNotchHistoryRestore({
        prompt: 'How far is the Moon?',
        reply: 'About 384,400 km on average.'
      })

      const resolved = resolveNotchCards({
        card: restored.card,
        decision: restored.decision,
        answeredPlanIds: [],
        message: restored.message,
        phase: restored.phase
      })

      expect(resolved.source).toBe('text')
      expect(resolved.text).toBe('About 384,400 km on average.')
      expect(resolved.showsCard).toBe(false)
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
})

describe('notch body shows one thing', () => {
  it('renders the Slack card while the approval is pending, with the answer text suppressed', () => {
    const resolved = resolveNotchCards({
      card: slackCard,
      decision: slackDecision,
      answeredPlanIds: [],
      message: slackSentence,
      phase: 'result'
    })

    expect(resolved.source).toBe('payload')
    expect(resolved.slackCard).toEqual(slackCard)
    expect(resolved.text).toBe('')

    const cardHtml = renderToStaticMarkup(
      createElement(SlackConfirmationCard, {
        card: resolved.slackCard!,
        busy: resolved.decision?.busy,
        onConfirm: () => {},
        onDiscard: () => {}
      })
    )
    expect(cardHtml).toContain('#all-faiz-hq')
    expect(cardHtml).toContain('Be Ready with the launch version four')
  })

  it('shows no Gmail card when the Slack approval is answered and the payload card is gone', () => {
    let retained = retainConfirmation(null, {
      card: slackCard,
      decision: slackDecision,
      phase: 'result'
    })

    // Approve: the renderer answers optimistically and the backend marks the
    // decision busy, dropping the card from its payload.
    const inFlight: NotchDecision = { ...slackDecision, busy: true }
    retained = retainConfirmation(retained, {
      card: null,
      decision: inFlight,
      phase: 'result'
    })

    const retainedCard =
      retained !== null && inFlight.busy && retained.planId === inFlight.planId
        ? retained.card
        : null

    const resolved = resolveNotchCards({
      card: retainedCard,
      decision: inFlight,
      answeredPlanIds: [slackDecision.planId],
      message: slackSentence,
      phase: 'result'
    })

    expect(resolved.emailCompose).toBeNull()
    expect(resolved.calendarEvent).toBeNull()
    expect(resolved.driveCard).toBeNull()
    expect(resolved.notionCard).toBeNull()
    // The card the user clicked stays visible, inert, while the send is out.
    expect(resolved.slackCard).toEqual(slackCard)
    expect(resolved.decision?.busy).toBe(true)

    const cardHtml = renderToStaticMarkup(
      createElement(SlackConfirmationCard, {
        card: resolved.slackCard!,
        busy: true,
        onConfirm: () => {},
        onDiscard: () => {}
      })
    )
    expect(cardHtml).toContain('disabled')
    expect(cardHtml).toContain('animate-spin')
  })

  it('settles to the confirmed text once the send completes', () => {
    const retained = retainConfirmation(
      { planId: slackDecision.planId, card: slackCard },
      { card: null, decision: null, phase: 'result' }
    )
    const resolved = resolveNotchCards({
      card: retained?.card ?? null,
      decision: null,
      answeredPlanIds: [slackDecision.planId],
      message: 'Message sent to #all-faiz-hq.',
      phase: 'result'
    })

    expect(resolved.source).toBe('text')
    expect(resolved.slackCard).toBeNull()
    expect(resolved.text).toBe('Message sent to #all-faiz-hq.')
  })

  it('renders the generic decision surface for a file delete with no preview card', () => {
    const decision: NotchDecision = {
      kind: 'confirm',
      planId: 'delete-plan-1',
      target: 'C:\\Users\\faiz\\notes.txt',
      busy: false
    }
    const resolved = resolveNotchCards({
      card: null,
      decision,
      answeredPlanIds: [],
      message: 'Delete "notes.txt"? Approval needed.',
      phase: 'result'
    })

    expect(resolved.source).toBe('decision')
    expect(resolved.decision).toEqual(decision)
    expect(resolved.hasPreviewModel).toBe(false)
    expect(resolved.text).toBe('')
    expect(resolved.showsCard).toBe(true)
  })

  it('clears the card and shows the error text when the turn fails', () => {
    const resolved = resolveNotchCards({
      card: slackCard,
      decision: slackDecision,
      answeredPlanIds: [],
      message: "That didn't work: timed out",
      phase: 'error'
    })

    expect(resolved.slackCard).toBeNull()
    expect(resolved.decision).toBeNull()
    expect(resolved.source).toBe('text')
    expect(resolved.text).toBe("That didn't work: timed out")
  })

  it('keeps the payload card through a normal completion while the decision is pending', () => {
    const resolved = resolveNotchCards({
      card: slackCard,
      decision: slackDecision,
      answeredPlanIds: [],
      message: slackSentence,
      phase: 'result'
    })

    expect(resolved.slackCard).toEqual(slackCard)
    expect(resolved.decision).toEqual(slackDecision)
    expect(resolved.text).toBe('')
  })

  it('cannot resurrect an answered plan on a later render', () => {
    const resolved = resolveNotchCards({
      card: null,
      decision: slackDecision,
      answeredPlanIds: [slackDecision.planId],
      message: slackSentence,
      phase: 'result'
    })

    expect(resolved.decision).toBeNull()
    expect(resolved.slackCard).toBeNull()
    expect(resolved.source).toBe('text')
  })

  it('shows the bottom hint while a preview card owns the body', () => {
    const resolved = resolveNotchCards({
      card: slackCard,
      decision: slackDecision,
      answeredPlanIds: [],
      message: slackSentence,
      phase: 'result'
    })

    expect(
      deriveShowBottomHint({
        isEditingText: false,
        phase: 'result',
        showCards: true,
        showAnswer: false,
        results: null,
        weather: resolved.weather,
        emailList: resolved.emailList,
        hasPreviewModel: resolved.hasPreviewModel
      })
    ).toBe(true)
  })

  it('keeps weather and the email list as display-only cards that own the body', () => {
    const weather: NotchWeatherCard = {
      kind: 'weather',
      location: 'Frisco',
      temperature: '72°',
      low: '64°',
      condition: 'Sunny',
      icon: 'sun'
    }
    const weatherResolved = resolveNotchCards({
      card: weather,
      decision: null,
      answeredPlanIds: [],
      message: 'Weather for Frisco: 72°, Sunny.',
      phase: 'result'
    })

    expect(weatherResolved.weather).toEqual(weather)
    expect(weatherResolved.hasPreviewModel).toBe(false)
    expect(weatherResolved.text).toBe('')

    const listResolved = resolveNotchCards({
      card: { kind: 'email_list', title: 'Latest inbox emails', rows: [] },
      decision: null,
      answeredPlanIds: [],
      message: 'Here are your 0 latest emails.',
      phase: 'result'
    })

    expect(listResolved.emailList?.title).toBe('Latest inbox emails')
    expect(listResolved.hasPreviewModel).toBe(false)
    expect(listResolved.text).toBe('')
  })

  it('never shows the answer bubble next to a card', () => {
    const cases = [
      { card: slackCard, decision: slackDecision, message: slackSentence },
      { card: null, decision: slackDecision, message: slackSentence },
      { card: null, decision: null, message: slackSentence }
    ]

    for (const testCase of cases) {
      const resolved = resolveNotchCards({
        card: testCase.card,
        decision: testCase.decision,
        answeredPlanIds: [],
        message: testCase.message,
        phase: 'result'
      })
      const showAnswer = resolved.source === 'text'

      expect(showAnswer && resolved.showsCard).toBe(false)
      if (resolved.showsCard) expect(resolved.text).toBe('')
    }
  })

  it('renders the Gmail, Calendar, Drive and Notion payload cards as the only card', () => {
    const email: NotchEmailComposeCard = {
      kind: 'email_compose',
      mode: 'send',
      title: 'New Message',
      to: ['team@company.com'],
      cc: [],
      bcc: [],
      subject: 'Meeting Notes',
      body: '',
      threadCount: null
    }
    const calendar: NotchCalendarCard = {
      kind: 'calendar_event',
      mode: 'create',
      title: 'Meeting',
      start: '2026-11-17T14:00:00',
      end: '2026-11-17T15:00:00',
      durationMinutes: 60,
      calendarName: 'Primary'
    }
    const drive: NotchDriveCard = {
      kind: 'drive_file',
      mode: 'create',
      format: 'document',
      name: 'Quarterly Report',
      folder: null
    }
    const notion: NotchNotionCard = {
      kind: 'notion_page',
      mode: 'create',
      title: 'Project Roadmap',
      parentName: 'Product',
      isDatabase: false,
      content: '# Roadmap'
    }
    const reply: NotchEmailReplyCard = {
      kind: 'email_reply',
      title: 'Reply drafted',
      body: 'Thanks for the update.',
      threadCount: 1
    }

    const emailResolved = resolveNotchCards({
      card: email,
      decision: {
        kind: 'confirm',
        planId: 'mail-plan',
        target: 'team@company.com',
        busy: false
      },
      answeredPlanIds: [],
      message: 'Send "Meeting Notes" to team@company.com? Approval needed.',
      phase: 'result'
    })
    expect(emailResolved.emailCompose).toEqual(email)
    expect(emailResolved.hasPreviewModel).toBe(true)
    expect(emailResolved.slackCard).toBeNull()
    expect(emailResolved.text).toBe('')
    expect(
      renderToStaticMarkup(
        createElement(GmailComposeCard, {
          card: emailResolved.emailCompose!,
          busy: emailResolved.decision?.busy,
          onSend: () => {},
          onDiscard: () => {}
        })
      )
    ).toContain('team@company.com')

    const calendarResolved = resolveNotchCards({
      card: calendar,
      decision: {
        kind: 'confirm',
        planId: 'cal-plan',
        target: 'Meeting',
        busy: false
      },
      answeredPlanIds: [],
      message: 'Schedule "Meeting" for tomorrow at 2:00 PM? Approval needed.',
      phase: 'result'
    })
    expect(calendarResolved.calendarEvent).toEqual(calendar)
    expect(calendarResolved.emailCompose).toBeNull()
    expect(
      renderToStaticMarkup(
        createElement(GoogleCalendarCard, {
          card: calendarResolved.calendarEvent!,
          busy: calendarResolved.decision?.busy,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )
    ).toContain('Meeting')

    const driveResolved = resolveNotchCards({
      card: drive,
      decision: {
        kind: 'confirm',
        planId: 'drive-plan',
        target: 'Quarterly Report',
        busy: false
      },
      answeredPlanIds: [],
      message: 'Create "Quarterly Report" in Google Drive?',
      phase: 'result'
    })
    expect(driveResolved.driveCard).toEqual(drive)
    expect(driveResolved.calendarEvent).toBeNull()
    expect(
      renderToStaticMarkup(
        createElement(GoogleDriveCard, {
          card: driveResolved.driveCard!,
          busy: driveResolved.decision?.busy,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )
    ).toContain('Quarterly Report')

    const notionResolved = resolveNotchCards({
      card: notion,
      decision: {
        kind: 'confirm',
        planId: 'notion-plan',
        target: 'Project Roadmap under Product',
        busy: false
      },
      answeredPlanIds: [],
      message: 'Create "Project Roadmap" in Notion under "Product"? Approval needed.',
      phase: 'result'
    })
    expect(notionResolved.notionCard).toEqual(notion)
    expect(notionResolved.driveCard).toBeNull()
    expect(
      renderToStaticMarkup(
        createElement(NotionConfirmationCard, {
          card: notionResolved.notionCard!,
          busy: notionResolved.decision?.busy,
          onConfirm: () => {},
          onDiscard: () => {}
        })
      )
    ).toContain('Project Roadmap')

    const replyResolved = resolveNotchCards({
      card: reply,
      decision: null,
      answeredPlanIds: [],
      message: '',
      phase: 'result'
    })
    expect(replyResolved.emailReply).toEqual(reply)
    expect(replyResolved.hasPreviewModel).toBe(true)
    expect(
      renderToStaticMarkup(
        createElement(EmailReplyCard, {
          card: replyResolved.emailReply!,
          onCopy: () => {}
        })
      )
    ).toContain('Copy to Clipboard')
  })
})
