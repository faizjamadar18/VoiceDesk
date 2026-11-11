import { describe, expect, it } from 'vitest'
import {
  ActionExecutionError,
  WindowsActionExecutor,
  planAction,
  quotePlus
} from './actions'
import { AppLaunchError, AppNotInstalledError } from './app-catalog'

const FIXED_NOW = new Date(2026, 10, 7, 9, 41, 12)

describe('planAction', () => {
  it.each([
    ['open notepad', 'notepad'],
    ['Open Note Pad.', 'notepad'],
    ['launch the calculator', 'calculator'],
    ['start chrome', 'chrome'],
    ['open google chrome', 'chrome'],
    ['open file explorer', 'explorer'],
    ['open Microsoft Word', 'word'],
    ['open settings', 'settings'],
    ['open notion', 'notion'],
    ['launch spotify', 'spotify'],
    ['open terminal', 'terminal']
  ])('opens any app: %s', (transcript, app) => {
    const plan = planAction(transcript, FIXED_NOW)

    expect(plan.status).toBe('ok')
    expect(plan.action).toBe('open_app')
    expect(plan.target).toBe(app)
  })

  it.each([
    [
      'search the web for zero cost speech recognition',
      'zero cost speech recognition'
    ],
    ['search for kestrel voice agent', 'kestrel voice agent'],
    ['google best local whisper model', 'best local whisper model'],
    ['look up rust ownership', 'rust ownership']
  ])('searches the web: %s', (transcript, query) => {
    const plan = planAction(transcript, FIXED_NOW)

    expect(plan.status).toBe('ok')
    expect(plan.action).toBe('browser')
    expect(plan.url).toBe(
      `https://www.google.com/search?q=${query.replace(/ /g, '+')}`
    )
    expect(plan.message).toBe(`Searching the web for ${query}.`)
  })

  it('types text and preserves case', () => {
    const plan = planAction('type Hello from Kestrel', FIXED_NOW)

    expect(plan.status).toBe('ok')
    expect(plan.action).toBe('type')
    expect(plan.text).toBe('Hello from Kestrel')
    expect(plan.message).toBe('Typing that into the focused app.')
  })

  it('answers time and date', () => {
    const timePlan = planAction('what time is it?', FIXED_NOW)
    const datePlan = planAction("what's the date today", FIXED_NOW)

    expect(timePlan.status).toBe('ok')
    expect(timePlan.action).toBe('answer')
    expect(timePlan.message).toContain('9:41')
    expect(datePlan.status).toBe('ok')
    expect(datePlan.action).toBe('answer')
    expect(datePlan.message).toContain('2026-11-07')
  })

  it('returns unhandled for unknown speech', () => {
    const plan = planAction('make me a sandwich', FIXED_NOW)

    expect(plan.status).toBe('unhandled')
    expect(plan.action).toBe('none')
    expect(plan.message).toBe(
      'I didn\'t catch a command. Try \u201copen Notepad\u201d, \u201csearch the web for ' +
        'Kestrel\u201d, or \u201ctype hello\u201d.'
    )
  })

  it('strips app filler words', () => {
    const plan = planAction('open the app called Notion', FIXED_NOW)

    expect(plan.status).toBe('ok')
    expect(plan.action).toBe('open_app')
    expect(plan.target).toBe('notion')
  })

  it('reports an unknown app when the command still looks like an open', () => {
    const plan = planAction('open it', FIXED_NOW)

    expect(plan.status).toBe('unhandled')
    expect(plan.action).toBe('none')
    expect(plan.message).toBe("I don't know how to open that app yet.")
  })

  it('strips non-speech tags', () => {
    const plan = planAction('(clicking) open notepad')
    expect(plan.status).toBe('ok')
    expect(plan.target).toBe('notepad')

    const emptyPlan = planAction('(clap)')
    expect(emptyPlan.status).toBe('unhandled')
    expect(emptyPlan.message).toBe("I didn't hear a command.")
  })

  it('returns a frozen plan object', () => {
    const plan = planAction('open notepad', FIXED_NOW)

    expect(Object.isFrozen(plan)).toBe(true)
  })
})

describe('WindowsActionExecutor', () => {
  it('launches apps through the catalog and URLs through the opener', async () => {
    const launched: string[] = []
    const opened: string[] = []
    const executor = new WindowsActionExecutor(
      {
        launch: async (app) => {
          launched.push(app)
        }
      },
      async (url) => {
        opened.push(url)
      }
    )

    await executor.openApp('notion')
    await executor.openUrl('https://example.com')

    expect(launched).toEqual(['notion'])
    expect(opened).toEqual(['https://example.com'])
  })

  it('turns missing apps into ActionExecutionError', async () => {
    const executor = new WindowsActionExecutor({
      launch: () => {
        throw new AppNotInstalledError('notion')
      }
    })

    await expect(executor.openApp('notion')).rejects.toThrow(ActionExecutionError)
    await expect(executor.openApp('notion')).rejects.toThrow(
      'Notion is not installed on this PC.'
    )
  })

  it('turns launch failures into ActionExecutionError', async () => {
    const executor = new WindowsActionExecutor({
      launch: () => {
        throw new AppLaunchError("I found Notion, but Windows couldn't open it.")
      }
    })

    await expect(executor.openApp('notion')).rejects.toThrow(
      "I found Notion, but Windows couldn't open it."
    )
  })
})

describe('quotePlus', () => {
  it('matches Python urllib.parse.quote_plus', () => {
    expect(quotePlus('a b/c?d=é')).toBe('a+b%2Fc%3Fd%3D%C3%A9')
  })
})
