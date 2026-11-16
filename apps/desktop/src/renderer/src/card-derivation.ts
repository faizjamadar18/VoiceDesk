import type {
  NotchCalendarCard,
  NotchCard,
  NotchDecision,
  NotchDriveCard,
  NotchEmailComposeCard,
  NotchEmailListCard,
  NotchEmailReplyCard,
  NotchNotionCard,
  NotchPhase,
  NotchSlackCard,
  NotchWeatherCard
} from '../../shared/types'

/** Kinds the notch can draw straight from a backend `card` event. */
const PAYLOAD_CARD_KINDS: ReadonlySet<string> = new Set([
  'weather',
  'email_list',
  'email_compose',
  'email_reply',
  'calendar_event',
  'drive_file',
  'notion_page',
  'slack_message'
])

/** Kinds that show a result and ask for nothing. */
const DISPLAY_CARD_KINDS: ReadonlySet<string> = new Set(['weather', 'email_list'])

/** Kinds whose card is the surface for a write waiting on the user's choice. */
const APPROVAL_CARD_KINDS: ReadonlySet<string> = new Set([
  'email_compose',
  'calendar_event',
  'drive_file',
  'notion_page',
  'slack_message'
])

/** How many answered plan ids a single answer keeps around. */
const ANSWERED_PLAN_LIMIT = 8

function cardKind(card: NotchCard | null): string {
  if (card === null) return ''
  const kind = (card as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : ''
}

/** True when this is one of the cards the backend is allowed to mount. */
export function isKnownPayloadCard(card: NotchCard | null): boolean {
  return PAYLOAD_CARD_KINDS.has(cardKind(card))
}

/** True when the card only shows a result: weather and the email list. */
function isDisplayOnlyCard(card: NotchCard): boolean {
  return DISPLAY_CARD_KINDS.has(cardKind(card))
}

/** True when the card is the approval surface for a write. */
function isApprovalCard(card: NotchCard | null): card is NotchCard {
  return card !== null && APPROVAL_CARD_KINDS.has(cardKind(card))
}

/** The structured state the notch renders from. */
export interface NotchCardState {
  /** The structured card event from the backend, or null. */
  card: NotchCard | null
  /** The write waiting on the user, or null. Kestrel carries at most one. */
  decision: NotchDecision | null
  /** Plan ids the user already answered on this turn, oldest first. */
  answeredPlanIds: readonly string[]
  /** The result message, shown only when no card owns the body. */
  message: string | null
  /** The notch phase the state belongs to. */
  phase: NotchPhase
}

/** What owns the notch body. Exactly one of these is ever current. */
export type NotchCardSource = 'payload' | 'decision' | 'text' | 'none'

/** The one thing the notch body may show. */
export interface NotchCardResolution {
  source: NotchCardSource
  weather: NotchWeatherCard | null
  emailList: NotchEmailListCard | null
  emailCompose: NotchEmailComposeCard | null
  emailReply: NotchEmailReplyCard | null
  calendarEvent: NotchCalendarCard | null
  driveCard: NotchDriveCard | null
  notionCard: NotchNotionCard | null
  slackCard: NotchSlackCard | null
  /** The pending write when the body is a decision surface, else null. */
  decision: NotchDecision | null
  /** The plain answer text; always empty while a card owns the body. */
  text: string
  /** True when a card other than weather / the email list owns the body. */
  hasPreviewModel: boolean
  /** True when any card owns the body, so the answer bubble must not render. */
  showsCard: boolean
}

function emptyResolution(): NotchCardResolution {
  return {
    source: 'none',
    weather: null,
    emailList: null,
    emailCompose: null,
    emailReply: null,
    calendarEvent: null,
    driveCard: null,
    notionCard: null,
    slackCard: null,
    decision: null,
    text: '',
    hasPreviewModel: false,
    showsCard: false
  }
}

/**
 * Resolves the one card the notch may mount, or the plain answer text.
 *
 * VoiceOS keeps one confirmation record keyed by id plus one visible
 * confirmation id, and never builds a card from prose. Kestrel's state has the
 * same shape: one structured `card` event and one `decision` record, both
 * supplied by the backend. This is the only place that decides what the body
 * shows, through a single ladder:
 *
 *   1. payload card      the backend's structured `card` event.
 *   2. pending decision  a write still waiting on the user.
 *   3. plain result text the message, when neither of the above is current.
 *
 * A rung is only reached when every rung above it is empty, so a card and text
 * can never co-exist. Nothing here reads the confirmation sentence: the old
 * regex fallback could read a Slack approval as a Gmail send and mount a card
 * nobody asked for, so it is deleted rather than made smarter.
 *
 * Kestrel carries at most one decision, so there is no list to stack and no
 * "Confirmation 1 of N" to mount.
 */
export function resolveNotchCards(state: NotchCardState): NotchCardResolution {
  const message = state.message?.trim() ?? ''
  // An error ends the turn: whatever was pending is cleared, and only the
  // error text is left to show.
  const isError = state.phase === 'error'

  if (!isError && isKnownPayloadCard(state.card)) {
    return payloadResolution(state.card as NotchCard, state.decision)
  }

  if (!isError) {
    const decision = pendingDecision(state)
    if (decision !== null) {
      return {
        ...emptyResolution(),
        source: 'decision',
        decision,
        showsCard: true
      }
    }
  }

  return {
    ...emptyResolution(),
    source: message.length > 0 ? 'text' : 'none',
    text: message
  }
}

/**
 * The write waiting on the user, or null.
 *
 * A decision is a surface only on the result screen. It survives a normal
 * completion while still pending, and cannot come back once the user answered
 * it: answered plan ids are remembered, so a late or duplicate response cannot
 * resurrect the card. The card the user clicked is kept by
 * {@link retainConfirmation} and never re-derived from prose.
 */
function pendingDecision(state: NotchCardState): NotchDecision | null {
  const decision = state.decision
  if (decision === null) return null
  if (state.phase !== 'result') return null
  // The user already answered this plan: the decision surface is cleared and
  // cannot come back, even while the answer is still in flight. The card they
  // clicked is kept separately by `retainConfirmation`, not re-derived here.
  if (state.answeredPlanIds.indexOf(decision.planId) !== -1) return null
  // A decision still in flight that the user has not answered stays visible,
  // and the cards disable themselves on `busy`.
  return decision
}

/** The payload rung: one card, chosen by its kind, with the text suppressed. */
function payloadResolution(
  card: NotchCard,
  decision: NotchDecision | null
): NotchCardResolution {
  const kind = cardKind(card)
  return {
    source: 'payload',
    weather: kind === 'weather' ? (card as NotchWeatherCard) : null,
    emailList: kind === 'email_list' ? (card as NotchEmailListCard) : null,
    emailCompose: kind === 'email_compose' ? (card as NotchEmailComposeCard) : null,
    emailReply: kind === 'email_reply' ? (card as NotchEmailReplyCard) : null,
    calendarEvent: kind === 'calendar_event' ? (card as NotchCalendarCard) : null,
    driveCard: kind === 'drive_file' ? (card as NotchDriveCard) : null,
    notionCard: kind === 'notion_page' ? (card as NotchNotionCard) : null,
    slackCard: kind === 'slack_message' ? (card as NotchSlackCard) : null,
    // A display card asks for nothing, so a stale decision must not light the
    // generic confirm/cancel row behind it.
    decision: isApprovalCard(card) ? decision : null,
    text: '',
    hasPreviewModel: !isDisplayOnlyCard(card),
    showsCard: true
  }
}

/** Record an answered plan id, newest last, keeping the set small. */
export function rememberAnsweredPlanId(
  ids: readonly string[],
  planId: string
): readonly string[] {
  if (ids.indexOf(planId) !== -1) return ids
  return [...ids, planId].slice(-ANSWERED_PLAN_LIMIT)
}

/** The structured card behind a pending decision, kept while it is answered. */
export interface RetainedConfirmation {
  planId: string
  card: NotchCard
}

/** The card / decision pair a state update carried. */
export interface ConfirmationArrival {
  card: NotchCard | null
  decision: NotchDecision | null
  phase: NotchPhase
}

/**
 * Keep the structured card behind a pending decision so it survives the busy
 * emit. The backend sends the decision again without its card once the answer
 * is in flight, and a card that vanished there would leave the notch empty.
 *
 * This is the renderer half of VoiceOS's id-keyed confirmation record: the
 * record belongs to `planId`, and every clear checks the id first, so a
 * response for one plan never clears another's card.
 */
export function retainConfirmation(
  current: RetainedConfirmation | null,
  incoming: ConfirmationArrival
): RetainedConfirmation | null {
  // Errors clear the slot outright.
  if (incoming.phase === 'error') return null

  const decision = incoming.decision
  if (decision === null) return null

  const card = incoming.card
  if (card !== null && isApprovalCard(card)) {
    return { planId: decision.planId, card }
  }

  // A later state for the same plan keeps the card it already had.
  if (current !== null && current.planId === decision.planId) return current

  return null
}
