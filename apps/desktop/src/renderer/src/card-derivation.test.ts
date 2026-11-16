import { describe, expect, it } from 'vitest'
import {
  isKnownPayloadCard,
  rememberAnsweredPlanId,
  resolveNotchCards,
  retainConfirmation,
  type NotchCardState
} from './card-derivation'
import type {
  NotchCard,
  NotchDecision,
  NotchEmailComposeCard,
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

const gmailCard: NotchEmailComposeCard = {
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

const weatherCard: NotchWeatherCard = {
  kind: 'weather',
  location: 'Frisco',
  temperature: '72°',
  low: '64°',
  condition: 'Sunny',
  icon: 'sun'
}

function notchState(overrides: Partial<NotchCardState> = {}): NotchCardState {
  return {
    card: null,
    decision: null,
    answeredPlanIds: [],
    message: null,
    phase: 'result',
    ...overrides
  }
}

function cardCount(resolved: ReturnType<typeof resolveNotchCards>): number {
  const cards: Array<NotchCard | null> = [
    resolved.weather,
    resolved.emailList,
    resolved.emailCompose,
    resolved.emailReply,
    resolved.calendarEvent,
    resolved.driveCard,
    resolved.notionCard,
    resolved.slackCard
  ]
  return cards.filter((card) => card !== null).length
}

describe('resolveNotchCards', () => {
  describe('the observed Slack approval sequence', () => {
    it('resolves no card once the approval is answered and the payload card is gone', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: null,
          decision: { ...slackDecision, busy: true },
          answeredPlanIds: [slackDecision.planId],
          message: slackSentence
        })
      )

      expect(cardCount(resolved)).toBe(0)
      expect(resolved.source).toBe('text')
      expect(resolved.showsCard).toBe(false)
      expect(resolved.hasPreviewModel).toBe(false)
      expect(resolved.text).toBe(slackSentence)
    })

    it('mounts the Slack card, and only the Slack card, while the approval is pending', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: slackCard,
          decision: slackDecision,
          message: slackSentence
        })
      )

      expect(resolved.source).toBe('payload')
      expect(resolved.slackCard).toEqual(slackCard)
      expect(resolved.emailCompose).toBeNull()
      expect(cardCount(resolved)).toBe(1)
      expect(resolved.text).toBe('')
      expect(resolved.showsCard).toBe(true)
    })

    it('settles to plain text once the send is confirmed', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: null,
          decision: null,
          answeredPlanIds: [slackDecision.planId],
          message: 'Message sent to #all-faiz-hq.'
        })
      )

      expect(cardCount(resolved)).toBe(0)
      expect(resolved.source).toBe('text')
      expect(resolved.text).toBe('Message sent to #all-faiz-hq.')
    })
  })

  describe('no sentence ever derives a card', () => {
    const sentences: Array<{ tool: string; sentence: string; target: string }> = [
      {
        tool: 'Gmail',
        sentence: 'Send "Meeting Notes" to team@company.com? Approval needed.',
        target: 'team@company.com'
      },
      {
        tool: 'Calendar',
        sentence: 'Schedule "Sync" for tomorrow at 3:00 PM? Approval needed.',
        target: 'Sync'
      },
      {
        tool: 'Drive',
        sentence: 'Create "Roadmap" in Google Drive?',
        target: 'Roadmap'
      },
      {
        tool: 'Notion',
        sentence: 'Create "Launch Plan" in Notion under "Projects"? Approval needed.',
        target: 'Launch Plan under Projects'
      }
    ]

    for (const { tool, sentence, target } of sentences) {
      it(`resolves no ${tool} card from its sentence after the decision was answered`, () => {
        const decision: NotchDecision = {
          kind: 'confirm',
          planId: `${tool.toLowerCase()}-plan-1`,
          target,
          busy: true
        }
        const resolved = resolveNotchCards(
          notchState({
            decision,
            answeredPlanIds: [decision.planId],
            message: sentence
          })
        )

        expect(cardCount(resolved)).toBe(0)
        expect(resolved.source).toBe('text')
        expect(resolved.text).toBe(sentence)
      })
    }

    it('resolves no card from a sentence when no decision is pending', () => {
      const resolved = resolveNotchCards(notchState({ message: slackSentence }))

      expect(cardCount(resolved)).toBe(0)
      expect(resolved.source).toBe('text')
    })

    it('resolves no card from a sentence while the turn is still acting', () => {
      const resolved = resolveNotchCards(
        notchState({
          decision: slackDecision,
          message: 'Create "Roadmap" in Google Drive?',
          phase: 'acting'
        })
      )

      expect(cardCount(resolved)).toBe(0)
      expect(resolved.text).toBe('Create "Roadmap" in Google Drive?')
    })
  })

  describe('the pending decision rung', () => {
    it('mounts the generic decision surface for a write with no preview card', () => {
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'delete-plan-1',
        target: 'C:\\Users\\faiz\\notes.txt',
        busy: false
      }
      const resolved = resolveNotchCards(
        notchState({ decision, message: 'Delete "notes.txt"? Approval needed.' })
      )

      expect(resolved.source).toBe('decision')
      expect(resolved.decision).toEqual(decision)
      expect(resolved.text).toBe('')
      expect(resolved.showsCard).toBe(true)
      expect(resolved.hasPreviewModel).toBe(false)
    })

    it('keeps a decision visible but inert while its answer is in flight', () => {
      const resolved = resolveNotchCards(
        notchState({
          decision: { ...slackDecision, busy: true },
          message: slackSentence
        })
      )

      expect(resolved.source).toBe('decision')
      expect(resolved.decision?.busy).toBe(true)
    })

    it('never resurrects an answered plan id on a later render', () => {
      const first = resolveNotchCards(
        notchState({
          decision: slackDecision,
          answeredPlanIds: [slackDecision.planId]
        })
      )
      const again = resolveNotchCards(
        notchState({
          decision: slackDecision,
          answeredPlanIds: [slackDecision.planId],
          message: slackSentence
        })
      )

      expect(first.decision).toBeNull()
      expect(again.decision).toBeNull()
      expect(cardCount(again)).toBe(0)
    })

    it('answers a different plan id that arrives after the first was answered', () => {
      const next: NotchDecision = {
        kind: 'confirm',
        planId: 'delete-plan-2',
        target: 'notes.txt',
        busy: false
      }
      const resolved = resolveNotchCards(
        notchState({
          decision: next,
          answeredPlanIds: [slackDecision.planId]
        })
      )

      expect(resolved.source).toBe('decision')
      expect(resolved.decision).toEqual(next)
    })
  })

  describe('lifecycle', () => {
    it('keeps a pending card through a normal completion', () => {
      const resolved = resolveNotchCards(
        notchState({ card: slackCard, decision: slackDecision, phase: 'result' })
      )

      expect(resolved.source).toBe('payload')
      expect(resolved.slackCard).toEqual(slackCard)
    })

    it('clears the card and the decision on error', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: slackCard,
          decision: slackDecision,
          message: "That didn't work: timed out",
          phase: 'error'
        })
      )

      expect(cardCount(resolved)).toBe(0)
      expect(resolved.decision).toBeNull()
      expect(resolved.source).toBe('text')
      expect(resolved.text).toBe("That didn't work: timed out")
    })
  })

  describe('display-only payload cards', () => {
    it('keeps the weather card and counts it as no approval surface', () => {
      const resolved = resolveNotchCards(
        notchState({ card: weatherCard, message: 'Weather for Frisco: 72°, Sunny.' })
      )

      expect(resolved.source).toBe('payload')
      expect(resolved.weather).toEqual(weatherCard)
      expect(resolved.hasPreviewModel).toBe(false)
      expect(resolved.decision).toBeNull()
      expect(resolved.text).toBe('')
    })

    it('keeps the email list and counts it as no approval surface', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: { kind: 'email_list', title: 'Latest inbox emails', rows: [] },
          message: 'Here are your 0 latest emails.'
        })
      )

      expect(resolved.source).toBe('payload')
      expect(resolved.emailList?.title).toBe('Latest inbox emails')
      expect(resolved.hasPreviewModel).toBe(false)
      expect(resolved.text).toBe('')
    })

    it('does not let a stale decision light the generic card behind a display card', () => {
      const resolved = resolveNotchCards(
        notchState({ card: weatherCard, decision: slackDecision })
      )

      expect(resolved.decision).toBeNull()
      expect(resolved.source).toBe('payload')
    })

    it('draws a reply card as a preview that owns the body', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: {
            kind: 'email_reply',
            title: 'Reply drafted',
            body: 'Thanks for the update.',
            threadCount: 1
          }
        })
      )

      expect(resolved.emailReply?.title).toBe('Reply drafted')
      expect(resolved.hasPreviewModel).toBe(true)
      expect(resolved.text).toBe('')
    })
  })

  describe('payload card precedence', () => {
    it('keeps the payload card authoritative over a text-shaped decision', () => {
      const resolved = resolveNotchCards(
        notchState({
          card: gmailCard,
          decision: slackDecision,
          message: slackSentence
        })
      )

      expect(resolved.emailCompose).toEqual(gmailCard)
      expect(resolved.slackCard).toBeNull()
      expect(resolved.source).toBe('payload')
    })

    it('ignores a payload card kind it cannot draw', () => {
      const resolved = resolveNotchCards(
        notchState({ card: { kind: 'something_new' }, message: 'Done.' })
      )

      expect(resolved.source).toBe('text')
      expect(cardCount(resolved)).toBe(0)
    })
  })

  describe('text and card are mutually exclusive', () => {
    it('always empties the text while a card owns the body', () => {
      const states: NotchCardState[] = [
        notchState({ card: weatherCard, message: 'Lots of text.' }),
        notchState({ card: gmailCard, message: 'Lots of text.' }),
        notchState({ card: slackCard, decision: slackDecision, message: 'Lots of text.' }),
        notchState({ decision: slackDecision, message: 'Lots of text.' })
      ]

      for (const state of states) {
        const resolved = resolveNotchCards(state)
        expect(resolved.showsCard).toBe(true)
        expect(resolved.text).toBe('')
      }
    })

    it('never shows a card when it shows text', () => {
      const resolved = resolveNotchCards(notchState({ message: slackSentence }))

      expect(resolved.showsCard).toBe(false)
      expect(cardCount(resolved)).toBe(0)
      expect(resolved.text).toBe(slackSentence)
    })
  })

  it('recognises only the payload kinds it can draw', () => {
    expect(isKnownPayloadCard(slackCard)).toBe(true)
    expect(isKnownPayloadCard(weatherCard)).toBe(true)
    expect(isKnownPayloadCard({ kind: 'something_new' })).toBe(false)
    expect(isKnownPayloadCard(null)).toBe(false)
  })
})

describe('rememberAnsweredPlanId', () => {
  it('records an id once', () => {
    expect(rememberAnsweredPlanId([], 'a')).toEqual(['a'])
    expect(rememberAnsweredPlanId(['a'], 'a')).toEqual(['a'])
  })

  it('keeps the set small, dropping the oldest ids first', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    const kept = ids.reduce<readonly string[]>(
      (current, id) => rememberAnsweredPlanId(current, id),
      []
    )

    expect(kept).toEqual(['2', '3', '4', '5', '6', '7', '8', '9'])
  })
})

describe('retainConfirmation', () => {
  it('records the card behind a pending decision', () => {
    const retained = retainConfirmation(null, {
      card: slackCard,
      decision: slackDecision,
      phase: 'result'
    })

    expect(retained).toEqual({ planId: slackDecision.planId, card: slackCard })
  })

  it('keeps the card when the busy emit drops it for the same plan', () => {
    const current = { planId: slackDecision.planId, card: slackCard }
    const retained = retainConfirmation(current, {
      card: null,
      decision: { ...slackDecision, busy: true },
      phase: 'result'
    })

    expect(retained).toBe(current)
  })

  it('clears on error', () => {
    const current = { planId: slackDecision.planId, card: slackCard }
    expect(
      retainConfirmation(current, {
        card: null,
        decision: slackDecision,
        phase: 'error'
      })
    ).toBeNull()
  })

  it('clears once the decision is gone', () => {
    const current = { planId: slackDecision.planId, card: slackCard }
    expect(
      retainConfirmation(current, { card: null, decision: null, phase: 'result' })
    ).toBeNull()
  })

  it('drops a stale card when a different plan arrives without one', () => {
    const current = { planId: slackDecision.planId, card: slackCard }
    const retained = retainConfirmation(current, {
      card: null,
      decision: { kind: 'confirm', planId: 'other-plan', target: 'x', busy: true },
      phase: 'result'
    })

    expect(retained).toBeNull()
  })

  it('replaces the card for a new plan', () => {
    const current = { planId: slackDecision.planId, card: slackCard }
    const retained = retainConfirmation(current, {
      card: gmailCard,
      decision: { kind: 'confirm', planId: 'mail-plan', target: 'team@company.com', busy: false },
      phase: 'result'
    })

    expect(retained).toEqual({ planId: 'mail-plan', card: gmailCard })
  })

  it('does not retain a display card', () => {
    expect(
      retainConfirmation(null, {
        card: weatherCard,
        decision: slackDecision,
        phase: 'result'
      })
    ).toBeNull()
  })
})
