import { describe, expect, it } from 'vitest'
import {
  deriveCalendarCard,
  deriveEmailComposeCard,
  deriveCardFromDecisionOrMessage
} from './card-derivation'
import type { NotchDecision } from '../../shared/types'

describe('card-derivation', () => {
  describe('deriveCalendarCard', () => {
    it('derives calendar_create_event from standard schedule approval message', () => {
      const message = 'Schedule "Meeting" for tomorrow at 2:00 PM? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-123',
        target: 'Meeting',
        busy: false
      }

      const card = deriveCalendarCard({
        message,
        decision,
        transcript: 'I mean schedule a meeting tomorrow at two PM in Google Calendar'
      })

      expect(card).not.toBeNull()
      expect(card?.kind).toBe('calendar_event')
      expect(card?.mode).toBe('create')
      expect(card?.title).toBe('Meeting')
      expect(card?.calendarName).toBe('Google Calendar')
      expect(card?.durationMinutes).toBe(60)
      expect(card?.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(card?.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(card?.start).toContain('T14:00:00')
    })

    it('derives delete calendar card from cancel message', () => {
      const message = 'Cancel "Dentist"? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-456',
        target: 'Dentist',
        busy: false
      }

      const card = deriveCalendarCard({
        message,
        decision,
        transcript: 'cancel my dentist appointment'
      })

      expect(card).not.toBeNull()
      expect(card?.kind).toBe('calendar_event')
      expect(card?.mode).toBe('delete')
      expect(card?.title).toBe('Dentist')
    })

    it('derives patch calendar card from move message', () => {
      const message = 'Move "Team Sync" to tomorrow at 10:00 AM? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-789',
        target: 'Team Sync',
        busy: false
      }

      const card = deriveCalendarCard({
        message,
        decision,
        transcript: 'move team sync to 10am tomorrow'
      })

      expect(card).not.toBeNull()
      expect(card?.kind).toBe('calendar_event')
      expect(card?.mode).toBe('patch')
      expect(card?.title).toBe('Team Sync')
      expect(card?.start).toContain('T10:00:00')
    })

    it('returns null when message does not describe calendar event', () => {
      const message = 'Delete "notes.txt"? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-000',
        target: 'notes.txt',
        busy: false
      }

      const card = deriveCalendarCard({
        message,
        decision,
        transcript: 'delete notes.txt'
      })

      expect(card).toBeNull()
    })
  })

  describe('deriveEmailComposeCard', () => {
    it('derives email compose card from send email approval message', () => {
      const message = 'Send "Meeting Notes" to sarah@example.com? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-email-1',
        target: 'sarah@example.com',
        busy: false
      }

      const card = deriveEmailComposeCard({
        message,
        decision,
        transcript: 'send an email to sarah with meeting notes'
      })

      expect(card).not.toBeNull()
      expect(card?.kind).toBe('email_compose')
      expect(card?.subject).toBe('Meeting Notes')
      expect(card?.to).toEqual(['sarah@example.com'])
    })

    it('derives draft card from save draft message', () => {
      const message = 'Save a draft to bob@example.com with subject "Project Pitch"? Approval needed.'
      const decision: NotchDecision = {
        kind: 'confirm',
        planId: 'plan-email-2',
        target: 'bob@example.com',
        busy: false
      }

      const card = deriveEmailComposeCard({
        message,
        decision,
        transcript: 'draft an email to bob about project pitch'
      })

      expect(card).not.toBeNull()
      expect(card?.kind).toBe('email_compose')
      expect(card?.subject).toBe('Project Pitch')
      expect(card?.to).toEqual(['bob@example.com'])
    })

    it('returns null when message is not email related', () => {
      const message = 'Schedule "Meeting" for tomorrow at 2:00 PM? Approval needed.'
      const card = deriveEmailComposeCard({
        message,
        decision: null,
        transcript: 'schedule a meeting'
      })
      expect(card).toBeNull()
    })
  })

  describe('deriveCardFromDecisionOrMessage', () => {
    it('returns derived calendar card when calendar event detected', () => {
      const result = deriveCardFromDecisionOrMessage({
        message: 'Schedule "Sync" for tomorrow at 3:00 PM? Approval needed.',
        decision: { kind: 'confirm', planId: '1', target: 'Sync', busy: false },
        transcript: 'schedule sync tomorrow at 3pm'
      })

      expect(result.calendarCard).not.toBeNull()
      expect(result.calendarCard?.title).toBe('Sync')
      expect(result.emailComposeCard).toBeNull()
    })
  })
})
