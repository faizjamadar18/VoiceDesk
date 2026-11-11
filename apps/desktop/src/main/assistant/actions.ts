/**
 * Rule-based action planning for the Kestrel prototype.
 *
 * No model, API key, or network call is needed to decide what to do. The
 * transcript is matched against a small, deterministic command set. Executing
 * an action happens on the same Windows machine that runs the desktop app.
 */

import {
  APP_ALIASES,
  AppLaunchError,
  AppNotInstalledError,
  WindowsAppCatalog,
  appLabel
} from './app-catalog'
import type { ActionExecutor } from './types'

export interface ActionPlan {
  status: string
  action: string
  message: string
  target?: string | null
  url?: string | null
  text?: string | null
}

export class ActionExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionExecutionError'
  }
}

export interface AppLauncherCatalog {
  launch(app: string): void | Promise<void>
}

export type UrlOpener = (url: string) => void | Promise<void>

export class WindowsActionExecutor implements ActionExecutor {
  private readonly catalog: AppLauncherCatalog
  private readonly openUrlImpl: UrlOpener

  constructor(catalog: AppLauncherCatalog = new WindowsAppCatalog(), openUrl?: UrlOpener) {
    this.catalog = catalog
    this.openUrlImpl =
      openUrl ??
      (async (url: string) => {
        const { shell } = await import('electron')
        await shell.openExternal(url)
      })
  }

  async openApp(app: string): Promise<void> {
    try {
      await this.catalog.launch(app)
    } catch (error) {
      if (error instanceof AppNotInstalledError || error instanceof AppLaunchError) {
        throw new ActionExecutionError(error.message)
      }
      throw error
    }
  }

  async openUrl(url: string): Promise<void> {
    await this.openUrlImpl(url)
  }
}

function plan(plan: ActionPlan): ActionPlan {
  return Object.freeze(plan)
}

export function planAction(transcript: string, now: Date = new Date()): ActionPlan {
  const cleaned = transcript.replace(/\([^)]*\)|\[[^\]]*\]|\*[^*]*\*/g, ' ')
  const original = cleaned.split(/\s+/).filter(Boolean).join(' ')
  const normalized = original.trim().replace(/[.,!?;:]+$/, '')
  if (!normalized) {
    return plan({
      status: 'unhandled',
      action: 'none',
      message: "I didn't hear a command."
    })
  }

  const lowered = normalized.toLowerCase()

  const timePlan = matchTime(lowered, now)
  if (timePlan !== null) {
    return timePlan
  }

  const datePlan = matchDate(lowered, now)
  if (datePlan !== null) {
    return datePlan
  }

  const openAppPlan = matchOpenApp(lowered)
  if (openAppPlan !== null) {
    return openAppPlan
  }

  const searchPlan = matchSearch(normalized)
  if (searchPlan !== null) {
    return searchPlan
  }

  const typingPlan = matchTyping(original)
  if (typingPlan !== null) {
    return typingPlan
  }

  if (
    lowered.startsWith('open ') ||
    lowered.startsWith('launch ') ||
    lowered.startsWith('start ')
  ) {
    return plan({
      status: 'unhandled',
      action: 'none',
      message: "I don't know how to open that app yet."
    })
  }

  return plan({
    status: 'unhandled',
    action: 'none',
    message:
      'I didn\'t catch a command. Try \u201copen Notepad\u201d, \u201csearch the web for ' +
      'Kestrel\u201d, or \u201ctype hello\u201d.'
  })
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function matchTime(text: string, now: Date): ActionPlan | null {
  if (
    text === 'time' ||
    text === 'what time is it' ||
    text === "what's the time" ||
    text === 'what is the time'
  ) {
    return plan({
      status: 'ok',
      action: 'answer',
      message: `It's ${pad2(now.getHours())}:${pad2(now.getMinutes())}.`
    })
  }
  return null
}

function matchDate(text: string, now: Date): ActionPlan | null {
  if (
    text === 'date' ||
    text === "what's the date" ||
    text === 'what is the date' ||
    text === "what's today's date" ||
    text === "what is today's date" ||
    text === "what's the date today" ||
    text === 'what is the date today'
  ) {
    const year = now.getFullYear().toString().padStart(4, '0')
    return plan({
      status: 'ok',
      action: 'answer',
      message: `Today is ${year}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.`
    })
  }
  return null
}

const OPEN_APP_PATTERN =
  /^(?:open|launch|start)\s+(?:(?:the|my|a|an)\s+)?(?:app(?:lication)?\s+(?:called|named)\s+)?(?<target>.+)$/i

function matchOpenApp(text: string): ActionPlan | null {
  const match = OPEN_APP_PATTERN.exec(text)
  if (match === null) {
    return null
  }
  let target = (match.groups?.['target'] ?? '').trim()
  target = target.replace(/\s+(?:app|application)$/, '').trim()
  if (!target || target === 'it' || target === 'that' || target === 'this') {
    return null
  }
  const lowered = target.toLowerCase()
  const canonical = APP_ALIASES[lowered] ?? lowered
  return plan({
    status: 'ok',
    action: 'open_app',
    message: `Opening ${appLabel(canonical)}.`,
    target: canonical
  })
}

function matchSearch(original: string): ActionPlan | null {
  const lowered = original.toLowerCase()
  const prefixes = [
    'search the web for ',
    'search the web ',
    'search for ',
    'search ',
    'google ',
    'look up '
  ]
  for (const prefix of prefixes) {
    if (lowered.startsWith(prefix)) {
      const query = original.slice(prefix.length).trim()
      if (!query) {
        return null
      }
      return plan({
        status: 'ok',
        action: 'browser',
        message: `Searching the web for ${query}.`,
        url: `https://www.google.com/search?q=${quotePlus(query)}`
      })
    }
  }
  return null
}

function matchTyping(original: string): ActionPlan | null {
  const lowered = original.toLowerCase()
  for (const prefix of ['type ', 'write ', 'insert ']) {
    if (lowered.startsWith(prefix)) {
      const text = original.slice(prefix.length).trim()
      if (!text) {
        return null
      }
      return plan({
        status: 'ok',
        action: 'type',
        message: 'Typing that into the focused app.',
        text
      })
    }
  }
  return null
}

/**
 * Python's ``urllib.parse.quote_plus``: every byte except letters, digits,
 * ``_.-~`` is percent-encoded, and spaces become ``+``.
 */
export function quotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/%20/g, '+')
}
