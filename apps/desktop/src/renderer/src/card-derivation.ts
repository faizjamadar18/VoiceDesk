import type {
  NotchCalendarCard,
  NotchEmailComposeCard,
  NotchDecision
} from '../../shared/types'

export interface CardDerivationInput {
  message?: string | null
  decision?: NotchDecision | null
  transcript?: string | null
  now?: () => Date
}

export interface DerivedCards {
  calendarCard: NotchCalendarCard | null
  emailComposeCard: NotchEmailComposeCard | null
}

const SCHEDULE_PATTERN =
  /(?:Schedule|Set\s+up|Create)\s+"([^"]+)"(?:\s+for\s+([^?]+))?\?\s*Approval needed/i
const MOVE_PATTERN =
  /(?:Move|Reschedule)\s+"([^"]+)"(?:\s+to\s+([^?]+))?\?\s*Approval needed/i
const CANCEL_PATTERN = /(?:Cancel)\s+"([^"]+)"\?\s*Approval needed/i

const SEND_EMAIL_PATTERN =
  /(?:Send)\s+"?([^"]*)"?\s+to\s+([^?]+)\?\s*Approval needed/i
const DRAFT_EMAIL_PATTERN =
  /(?:Save a draft to)\s+([^]+?)\s+with subject\s+"?([^"?]*)"?\s*\?\s*Approval needed/i
const REPLY_EMAIL_PATTERN =
  /(?:Reply to)\s+"?([^"]*)"?\s+from\s+([^?]+)\?\s*Approval needed/i

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function parseNaturalWhen(whenStr: string | null | undefined, baseDate: Date): { start: string; end: string } {
  const d = new Date(baseDate.getTime())
  const normalized = (whenStr ?? '').toLowerCase().trim()

  if (normalized.includes('tomorrow')) {
    d.setDate(d.getDate() + 1)
  }

  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10)
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const ampm = timeMatch[3]

    if (ampm === 'pm' && hour < 12) {
      hour += 12
    } else if (ampm === 'am' && hour === 12) {
      hour = 0
    }
    d.setHours(hour, minute, 0, 0)
  } else {
    // Default to next full hour or 14:00
    d.setHours(14, 0, 0, 0)
  }

  const end = new Date(d.getTime() + 60 * 60 * 1000)
  return {
    start: formatIso(d),
    end: formatIso(end)
  }
}

export function deriveCalendarCard(input: CardDerivationInput): NotchCalendarCard | null {
  const message = input.message?.trim() ?? ''
  const transcript = input.transcript?.toLowerCase() ?? ''
  const decisionTarget = input.decision?.target ?? ''
  const baseDate = input.now?.() ?? new Date()

  let title = ''
  let whenStr = ''
  let mode: 'create' | 'patch' | 'delete' = 'create'

  const scheduleMatch = message.match(SCHEDULE_PATTERN)
  const moveMatch = message.match(MOVE_PATTERN)
  const cancelMatch = message.match(CANCEL_PATTERN)

  if (scheduleMatch) {
    mode = 'create'
    title = scheduleMatch[1]
    whenStr = scheduleMatch[2] ?? ''
  } else if (moveMatch) {
    mode = 'patch'
    title = moveMatch[1]
    whenStr = moveMatch[2] ?? ''
  } else if (cancelMatch) {
    mode = 'delete'
    title = cancelMatch[1]
  } else if (
    input.decision !== null &&
    !SEND_EMAIL_PATTERN.test(message) &&
    !DRAFT_EMAIL_PATTERN.test(message) &&
    !REPLY_EMAIL_PATTERN.test(message) &&
    (transcript.includes('calendar') ||
      transcript.includes('schedule a meeting') ||
      message.toLowerCase().includes('google calendar'))
  ) {
    title = decisionTarget || 'Meeting'
    if (transcript.includes('cancel') || transcript.includes('delete')) {
      mode = 'delete'
    } else if (transcript.includes('move') || transcript.includes('reschedule')) {
      mode = 'patch'
    } else {
      mode = 'create'
    }
    whenStr = message
  } else {
    return null
  }

  if (!title) {
    title = decisionTarget || 'Meeting'
  }

  const { start, end } = parseNaturalWhen(whenStr, baseDate)

  return {
    kind: 'calendar_event',
    mode,
    title,
    start,
    end,
    durationMinutes: 60,
    calendarName: 'Google Calendar'
  }
}

export function deriveEmailComposeCard(input: CardDerivationInput): NotchEmailComposeCard | null {
  const message = input.message?.trim() ?? ''
  const transcript = input.transcript?.toLowerCase() ?? ''
  const decisionTarget = input.decision?.target ?? ''

  let subject = ''
  let recipient = ''
  let mode: 'send' | 'draft' | 'reply' = 'send'

  const sendMatch = message.match(SEND_EMAIL_PATTERN)
  const draftMatch = message.match(DRAFT_EMAIL_PATTERN)
  const replyMatch = message.match(REPLY_EMAIL_PATTERN)

  if (sendMatch) {
    mode = 'send'
    subject = sendMatch[1]
    recipient = sendMatch[2]
  } else if (draftMatch) {
    mode = 'draft'
    recipient = draftMatch[1]
    subject = draftMatch[2]
  } else if (replyMatch) {
    mode = 'reply'
    subject = replyMatch[1]
    recipient = replyMatch[2]
  } else if (
    input.decision !== null &&
    (transcript.includes('email') ||
      transcript.includes('gmail') ||
      transcript.includes('mail') ||
      message.toLowerCase().includes('email') ||
      message.toLowerCase().includes('mail'))
  ) {
    recipient = decisionTarget
    subject = 'New Message'
  } else {
    return null
  }

  const cleanRecipient = recipient.replace(/[?.,]$/, '').trim()

  return {
    kind: 'email_compose',
    mode: mode === 'reply' ? 'reply' : 'send',
    title: mode === 'reply' ? 'Reply' : 'New Message',
    to: cleanRecipient ? [cleanRecipient] : [],
    cc: [],
    bcc: [],
    subject: subject || '',
    body: '',
    threadCount: null
  }
}

export function deriveCardFromDecisionOrMessage(input: CardDerivationInput): DerivedCards {
  const calendarCard = deriveCalendarCard(input)
  if (calendarCard !== null) {
    return { calendarCard, emailComposeCard: null }
  }

  const emailComposeCard = deriveEmailComposeCard(input)
  return { calendarCard: null, emailComposeCard }
}
