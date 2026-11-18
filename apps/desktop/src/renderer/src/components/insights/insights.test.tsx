// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InsightsPayload } from '../../../../shared/types'
import { AgentPromptsCard } from './AgentPromptsCard'
import { AppUsageCard } from './AppUsageCard'
import { ChartTooltip } from './ChartTooltip'
import { InsightsTab } from './InsightsTab'
import { LADDER, toDayKey, toInsightsData } from './insightsData'
import { PeakHoursCard } from './PeakHoursCard'
import { StreakCard } from './StreakCard'
import { VoiceTypeCard } from './VoiceTypeCard'
import { bandForTotalSessions, buildVoiceTypeModel } from './voiceType'
import { VoiceTypeModal } from './VoiceTypeModal'
import { WordsDictatedCard } from './WordsDictatedCard'

// Setup minimal document / window mock for portal & browser checks
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = minDocument
}
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = {
    document: globalThis.document,
    innerWidth: 1024,
    innerHeight: 768,
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLCanvasElement: class HTMLCanvasElement {
      getContext() {
        return null
      }
    },
    SVGElement: class SVGElement {},
    Element: class Element {},
    HTMLElement: class HTMLElement {},
    Node: class Node {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({
      getPropertyValue: () => ''
    }),
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  }
}

if (!(globalThis as any).HTMLIFrameElement) {
  ;(globalThis as any).HTMLIFrameElement = (globalThis as any).window.HTMLIFrameElement
  ;(globalThis as any).SVGElement = (globalThis as any).window.SVGElement
  ;(globalThis as any).Element = (globalThis as any).window.Element
  ;(globalThis as any).HTMLElement = (globalThis as any).window.HTMLElement
  ;(globalThis as any).Node = (globalThis as any).window.Node
}
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(cb, 0) as unknown as number
  ;(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id)
}

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (children: ReactNode, container: any) => {
      return createElement(
        'div',
        {
          'data-portal': 'true',
          'data-portal-target': container === globalThis.document?.body ? 'document.body' : 'other'
        },
        children
      )
    }
  }
})

function emptyPayload(): InsightsPayload {
  return {
    totalSessions: 0,
    totalWords: 0,
    timeSavedSeconds: 0,
    weekSessions: 0,
    weekWords: 0,
    weekTimeSavedSeconds: 0,
    avgWPM: null,
    typingMultiple: null,
    dayMap: {},
    hourCounts: Array.from({ length: 24 }, () => 0),
    topApps: [],
    appsUsed: 0,
    agent: {
      prompts: 0,
      sessions: 0,
      timeSavedSeconds: 0,
      weekTimeSavedSeconds: 0,
      conversations: 0
    },
    streak: { current: 0, longest: 0, activeToday: false }
  }
}

function realPayload(): InsightsPayload {
  const dayMap: InsightsPayload['dayMap'] = {}
  const today = new Date()
  const sessions = [31, 32, 30, 33, 31]
  const words = [540, 550, 520, 567, 540]
  for (let i = 0; i < sessions.length; i++) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    dayMap[toDayKey(day)] = { sessions: sessions[i], words: words[i] }
  }

  const hourCounts = Array.from({ length: 24 }, () => 0)
  hourCounts[7] = 52

  return {
    totalSessions: 157,
    totalWords: 2717,
    timeSavedSeconds: 3000,
    weekSessions: 157,
    weekWords: 2717,
    weekTimeSavedSeconds: 3000,
    avgWPM: null,
    typingMultiple: null,
    dayMap,
    hourCounts,
    topApps: [
      { appName: 'VoiceDesk', sessions: 78, words: 1350, relative: 1.0, share: 0.5 },
      { appName: 'explorer', sessions: 27, words: 450, relative: 0.35, share: 0.17 },
      { appName: 'Antigravity IDE', sessions: 26, words: 460, relative: 0.33, share: 0.17 },
      { appName: 'msedge', sessions: 26, words: 457, relative: 0.33, share: 0.17 }
    ],
    appsUsed: 4,
    agent: {
      prompts: 151,
      sessions: 151,
      timeSavedSeconds: 2940,
      weekTimeSavedSeconds: 2940,
      conversations: 151
    },
    streak: { current: 5, longest: 5, activeToday: true }
  }
}

type InsightsStub = { getInsights: () => Promise<InsightsPayload> }

function stubInsights(getInsights: () => Promise<InsightsPayload>): void {
  ;(globalThis as unknown as { window: { kestrel: InsightsStub } }).window.kestrel = {
    getInsights
  }
}

function textOf(node: Node | null): string {
  if (!node) return ''
  const children: Node[] = node.childNodes ? Array.from(node.childNodes) : []
  const ownText =
    (node as unknown as { textContent?: string }).textContent ??
    (node as unknown as { data?: string }).data ??
    ''
  return [ownText, ...children.map(textOf)].join(' ')
}

async function renderTab(): Promise<{ text: string; unmount: () => void }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(InsightsTab))
  })
  return {
    text: textOf(container),
    unmount: () => {
      act(() => root.unmount())
      container.parentNode?.removeChild(container)
    }
  }
}

describe('Insights Components Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubInsights(() => Promise.resolve(emptyPayload()))
  })

  describe('1. InsightsTab data loading', () => {
    it('renders the neutral empty state when the payload has no sessions', async () => {
      stubInsights(() => Promise.resolve(emptyPayload()))

      const { text, unmount } = await renderTab()

      expect(text).toContain('Insights')
      expect(text).toContain('Nothing yet')
      expect(text).not.toContain('Peak hours')
      expect(text).not.toContain('day streak')

      unmount()
    })

    it('renders real numbers from the fetched payload', async () => {
      stubInsights(() => Promise.resolve(realPayload()))

      const { text, unmount } = await renderTab()
      const normalized = text.replace(/\s+/g, ' ')

      expect(normalized).toContain('Insights')
      expect(normalized).toContain('2,717')
      expect(normalized).toContain('151')
      expect(normalized).toContain('Top 25%')
      expect(normalized).toContain('5 day streak')
      expect(normalized).toContain('Peak hours')
      expect(normalized).toContain('BUSIEST | 7 AM')
      expect(normalized).toContain('APPS USED | 4')
      expect(normalized).not.toContain('Nothing yet')

      unmount()
    })

    it('falls back to the empty state when loading fails', async () => {
      stubInsights(() => Promise.reject(new Error('ipc unavailable')))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const { text, unmount } = await renderTab()

      expect(text).toContain('Nothing yet')
      expect(text).not.toContain('Peak hours')

      unmount()
    })

    it('renders the Voice Type button with WebkitAppRegion: no-drag in its style and relative z-[80]', () => {
      const html = renderToStaticMarkup(createElement(InsightsTab))
      expect(html).toContain('Voice Type')
      expect(html).toContain('relative z-[80]')
      expect(html).toContain('-webkit-app-region:no-drag')
    })

    it('clicking the button opens VoiceTypeModal', async () => {
      stubInsights(() => Promise.resolve(realPayload()))

      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      await act(async () => {
        root.render(createElement(InsightsTab))
      })

      const findVoiceTypeButton = (node: Node | null): Node | null => {
        if (!node) return null
        const propsKey = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
        const props = propsKey ? (node as unknown as Record<string, { onClick?: () => void }>)[propsKey] : undefined
        if (typeof props?.onClick === 'function' && textOf(node).includes('Voice Type')) {
          return node
        }
        const children: Node[] = node.childNodes ? Array.from(node.childNodes) : []
        for (const child of children) {
          const found = findVoiceTypeButton(child)
          if (found) return found
        }
        return null
      }

      const button = findVoiceTypeButton(container)
      expect(button).not.toBeNull()

      const propsKey = Object.keys(button as object).find((k) => k.startsWith('__reactProps$'))!
      const onClick = (button as unknown as Record<string, { onClick: () => void }>)[propsKey]
        .onClick
      act(() => {
        onClick()
      })

      const bodyText =
        (globalThis.document?.body as unknown as { toString?: () => string })?.toString?.() ?? ''
      expect(bodyText).toContain('Top 25%')
      expect(bodyText).toContain('Copy image')

      act(() => {
        root.unmount()
      })
      container.parentNode?.removeChild(container)
    })
  })

  describe('2. Percentile mapping', () => {
    it('maps session totals onto the right ladder band', () => {
      expect(bandForTotalSessions(157)?.topPercent).toBe(25)
      expect(bandForTotalSessions(161)?.topPercent).toBe(20)
      expect(bandForTotalSessions(3833)?.topPercent).toBe(1)
      expect(bandForTotalSessions(3832)?.topPercent).toBe(2)
      expect(bandForTotalSessions(15)?.topPercent).toBe(50)
      expect(bandForTotalSessions(14)).toBeNull()
      expect(LADDER[0].topPercent).toBe(50)
    })

    it('builds the voice type model from the payload', () => {
      const model = buildVoiceTypeModel(toInsightsData(realPayload()))
      expect(model.typeName).toBe('Top 25%')
      expect(model.stats).toEqual([
        { label: 'Words dictated', value: '2,717' },
        { label: 'Time saved', value: '50m' },
        { label: 'Agent tasks', value: '151' }
      ])
    })

    it('flags an unranked voice type without inventing a band', () => {
      const payload = emptyPayload()
      payload.totalSessions = 3
      const model = buildVoiceTypeModel(toInsightsData(payload))
      expect(model.typeName).toBe('Not ranked yet')
      expect(bandForTotalSessions(payload.totalSessions)).toBeNull()
    })
  })

  describe('3. VoiceTypeCard', () => {
    it('derives band, daily average and next step from the data', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('Top 25%')
      expect(html).toContain('31 sessions')
      expect(html).toContain('Next: top 20%')
      expect(html).toContain('+4 sessions')
    })
  })

  describe('4. WordsDictatedCard', () => {
    it('renders 2,717, TOTAL WORDS DICTATED, Time saved (50m), Sessions (157), This week (2,717 words)', () => {
      const html = renderToStaticMarkup(
        createElement(WordsDictatedCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('2,717')
      expect(html).toContain('TOTAL WORDS DICTATED')
      expect(html).toContain('Time saved')
      expect(html).toContain('50m')
      expect(html).toContain('Sessions')
      expect(html).toContain('157')
      expect(html).toContain('This week')
      expect(html).toContain('2,717 words')
    })
  })

  describe('5. AgentPromptsCard', () => {
    it('renders 151, AGENT PROMPTS, Time saved (49m), Sessions (151), This week (49m)', () => {
      const html = renderToStaticMarkup(
        createElement(AgentPromptsCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('151')
      expect(html).toContain('AGENT PROMPTS')
      expect(html).toContain('Time saved')
      expect(html).toContain('49m')
      expect(html).toContain('Sessions')
      expect(html).toContain('This week')
    })
  })

  describe('6. AppUsageCard', () => {
    it('renders App usage, APPS USED | 4, app names VoiceDesk, explorer, Antigravity IDE, msedge', () => {
      const html = renderToStaticMarkup(
        createElement(AppUsageCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('App usage')
      expect(html).toContain('APPS USED | 4')
      expect(html).toContain('VoiceDesk')
      expect(html).toContain('explorer')
      expect(html).toContain('Antigravity IDE')
      expect(html).toContain('msedge')
    })
  })

  describe('7. StreakCard', () => {
    it('renders 5 day streak, LONGEST | 5 DAYS, month labels, weekday gutter, and heatmap cells with hover classes (cursor-pointer hover:brightness-125)', () => {
      const html = renderToStaticMarkup(
        createElement(StreakCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('5 day streak')
      expect(html).toContain('LONGEST | 5 DAYS')
      // Weekday gutter labels (Monday, Wednesday, Friday)
      expect(html).toContain('>M<')
      expect(html).toContain('>W<')
      expect(html).toContain('>F<')
      // Legend
      expect(html).toContain('Less')
      expect(html).toContain('More')
      expect(html).toContain('Today')
      // Heatmap cells have hover classes
      expect(html).toContain('cursor-pointer')
      expect(html).toContain('hover:brightness-125')
    })
  })

  describe('8. PeakHoursCard', () => {
    it('renders Peak hours, BUSIEST | 7 AM, 24 hourly columns with hover styling (cursor-pointer group-hover:brightness-125)', () => {
      const html = renderToStaticMarkup(
        createElement(PeakHoursCard, { data: toInsightsData(realPayload()), isDarkMode: true })
      )
      expect(html).toContain('Peak hours')
      expect(html).toContain('BUSIEST | 7 AM')
      expect(html).toContain('cursor-pointer')
      expect(html).toContain('group-hover:brightness-125')
      // 24 hourly bars rendered
      const matches = html.match(/group-hover:brightness-125/g)
      expect(matches).toHaveLength(24)
    })
  })

  describe('9. ChartTooltip', () => {
    it('returns null when tooltip data is null', () => {
      const html = renderToStaticMarkup(createElement(ChartTooltip, { tooltip: null }))
      expect(html).toBe('')
    })

    it('renders the title and detail text inside document.body (portal)', () => {
      const html = renderToStaticMarkup(
        createElement(ChartTooltip, {
          tooltip: { x: 200, y: 150, title: 'Wed, Nov 11', detail: '3 sessions · 420 words' }
        })
      )

      expect(html).toContain('data-portal="true"')
      expect(html).toContain('data-portal-target="document.body"')
      expect(html).toContain('Wed, Nov 11')
      expect(html).toContain('3 sessions · 420 words')
    })
  })

  describe('10. VoiceTypeModal', () => {
    it('returns null when isOpen={false}', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeModal, {
          isOpen: false,
          onClose: () => {},
          data: toInsightsData(realPayload())
        })
      )
      expect(html).toBe('')
    })

    it('renders inside portal on document.body with the derived model, stats and action buttons', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeModal, {
          isOpen: true,
          onClose: () => {},
          data: toInsightsData(realPayload())
        })
      )

      expect(html).toContain('data-portal="true"')
      expect(html).toContain('data-portal-target="document.body"')
      expect(html).toContain('Top 25%')
      expect(html).toContain('2,717 Words dictated')
      expect(html).toContain('50m Time saved')
      expect(html).toContain('151 Agent tasks')
      expect(html).toContain('Copy image')
      expect(html).toContain('Save image')
      expect(html).toContain('Post to LinkedIn')
      expect(html).toContain('Post to Twitter')
      expect(html).toContain('-webkit-app-region:no-drag')
      // Sizing and layout matching VoiceOS
      expect(html).toContain('px-5 pt-5 pb-6 w-[480px] max-w-[calc(100vw-32px)]')
      expect(html).toContain('top-8 right-8 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.12] text-white transition-colors hover:bg-white/[0.22] focus:outline-none cursor-pointer')
      expect(html).toContain('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none cursor-pointer')
      expect(html).toContain('flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none cursor-pointer')
    })
  })
})
