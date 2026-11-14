// @ts-expect-error min-document lacks types
import minDocument from 'min-document'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPromptsCard } from './AgentPromptsCard'
import { AppUsageCard } from './AppUsageCard'
import { ChartTooltip } from './ChartTooltip'
import { InsightsTab } from './InsightsTab'
import { LADDER, MOCK_INSIGHTS_DATA, MOCK_VOICE_TYPE_MODEL } from './mockData'
import { PeakHoursCard } from './PeakHoursCard'
import { StreakCard } from './StreakCard'
import { VoiceTypeCard } from './VoiceTypeCard'
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

describe('Insights Components Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. MOCK_INSIGHTS_DATA and MOCK_VOICE_TYPE_MODEL', () => {
    it('validates mock metrics', () => {
      // top 25%: totalSessions (157) meets top 25% threshold (105) but is below top 20% (161)
      const top25Band = LADDER.find((b) => b.topPercent === 25)
      const top20Band = LADDER.find((b) => b.topPercent === 20)
      expect(top25Band).toBeDefined()
      expect(top20Band).toBeDefined()
      expect(MOCK_INSIGHTS_DATA.totalSessions).toBeGreaterThanOrEqual(top25Band!.minSessions)
      expect(MOCK_INSIGHTS_DATA.totalSessions).toBeLessThan(top20Band!.minSessions)

      // +4 sessions to top 20%
      expect(top20Band!.minSessions - MOCK_INSIGHTS_DATA.totalSessions).toBe(4)

      // 31 sessions daily average (calculated from active streak sessions)
      const streakValues = Array.from(MOCK_INSIGHTS_DATA.dayMap.values()).map((d) => d.sessions)
      const dailyAvg = Math.round(streakValues.reduce((a, b) => a + b, 0) / streakValues.length)
      expect(dailyAvg).toBe(31)

      // 2,717 words dictated
      expect(MOCK_INSIGHTS_DATA.totalWords).toBe(2717)

      // 151 agent prompts
      expect(MOCK_INSIGHTS_DATA.agent.prompts).toBe(151)

      // 4 apps used
      expect(MOCK_INSIGHTS_DATA.appsUsed).toBe(4)
      expect(MOCK_INSIGHTS_DATA.topApps).toHaveLength(4)

      // 5-day streak
      expect(MOCK_INSIGHTS_DATA.streak.current).toBe(5)
      expect(MOCK_INSIGHTS_DATA.streak.longest).toBe(5)

      // 7 AM peak hour
      const maxSessions = Math.max(...MOCK_INSIGHTS_DATA.hourCounts)
      const peakHour = MOCK_INSIGHTS_DATA.hourCounts.indexOf(maxSessions)
      expect(peakHour).toBe(7)
      expect(maxSessions).toBe(52)

      // MOCK_VOICE_TYPE_MODEL properties
      expect(MOCK_VOICE_TYPE_MODEL.typeName).toBe('The Agent Commander')
      expect(MOCK_VOICE_TYPE_MODEL.stats).toEqual([
        { label: 'Words dictated', value: '2,717' },
        { label: 'Time saved', value: '1h 39m' },
        { label: 'Agent tasks', value: '151' }
      ])
    })
  })

  describe('2. InsightsTab', () => {
    it('renders Insights title', () => {
      const html = renderToStaticMarkup(createElement(InsightsTab))
      expect(html).toContain('Insights')
    })

    it('renders the Voice Type button with WebkitAppRegion: no-drag in its style and relative z-[80]', () => {
      const html = renderToStaticMarkup(createElement(InsightsTab))
      expect(html).toContain('Voice Type')
      expect(html).toContain('relative z-[80]')
      expect(html).toContain('-webkit-app-region:no-drag')
    })

    it('clicking the button opens VoiceTypeModal', () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container as any)

      act(() => {
        root.render(createElement(InsightsTab))
      })

      // Initially closed
      expect(container.toString()).not.toContain('The Agent Commander')

      // Find the "Voice Type" button in the rendered DOM tree
      const findVoiceTypeButton = (node: any): any => {
        if (!node) return null
        const reactPropsKey = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
        if (reactPropsKey && typeof node[reactPropsKey]?.onClick === 'function') {
          // Check if this button contains Voice Type
          const text = node.textContent || ''
          const childText = node.childNodes?.map((c: any) => c.data || c.textContent || '').join(' ')
          if (text.includes('Voice Type') || childText.includes('Voice Type')) {
            return node
          }
        }
        if (node.childNodes) {
          for (const child of node.childNodes) {
            const found = findVoiceTypeButton(child)
            if (found) return found
          }
        }
        return null
      }

      const button = findVoiceTypeButton(container)
      expect(button).not.toBeNull()

      // Click the button
      const propsKey = Object.keys(button).find((k) => k.startsWith('__reactProps$'))!
      act(() => {
        button[propsKey].onClick()
      })

      // VoiceTypeModal is now open
      const htmlAfterClick =
        (globalThis.document?.body as any)?.toString?.() ||
        (globalThis.document?.body as any)?.innerHTML ||
        ''
      expect(htmlAfterClick).toContain('The Agent Commander')

      act(() => {
        root.unmount()
      })
      container.parentNode?.removeChild(container)
    })
  })

  describe('3. VoiceTypeCard', () => {
    it('renders Top 25%, 31 sessions, Next: top 20%, +4 sessions', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
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
        createElement(WordsDictatedCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
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
        createElement(AgentPromptsCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
      )
      expect(html).toContain('151')
      expect(html).toContain('AGENT PROMPTS')
      expect(html).toContain('Time saved')
      expect(html).toContain('49m')
      expect(html).toContain('Sessions')
      expect(html).toContain('151')
      expect(html).toContain('This week')
      expect(html).toContain('49m')
    })
  })

  describe('6. AppUsageCard', () => {
    it('renders App usage, APPS USED | 4, app names VoiceOS, explorer, Antigravity IDE, msedge', () => {
      const html = renderToStaticMarkup(
        createElement(AppUsageCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
      )
      expect(html).toContain('App usage')
      expect(html).toContain('APPS USED | 4')
      expect(html).toContain('VoiceOS')
      expect(html).toContain('explorer')
      expect(html).toContain('Antigravity IDE')
      expect(html).toContain('msedge')
    })
  })

  describe('7. StreakCard', () => {
    it('renders 5 day streak, LONGEST | 5 DAYS, month labels, weekday gutter, and heatmap cells with hover classes (cursor-pointer hover:brightness-125)', () => {
      const html = renderToStaticMarkup(
        createElement(StreakCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
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
        createElement(PeakHoursCard, { data: MOCK_INSIGHTS_DATA, isDarkMode: true })
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
          onClose: () => {}
        })
      )
      expect(html).toBe('')
    })

    it('renders inside portal on document.body with The Agent Commander, stats, action buttons, and WebkitAppRegion: no-drag when isOpen={true}', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeModal, {
          isOpen: true,
          onClose: () => {}
        })
      )

      expect(html).toContain('data-portal="true"')
      expect(html).toContain('data-portal-target="document.body"')
      expect(html).toContain('The Agent Commander')
      expect(html).toContain('2,717 Words dictated')
      expect(html).toContain('1h 39m Time saved')
      expect(html).toContain('151 Agent tasks')
      expect(html).toContain('Copy image')
      expect(html).toContain('Save image')
      expect(html).toContain('Post to LinkedIn')
      expect(html).toContain('Post to Twitter')
      expect(html).toContain('-webkit-app-region:no-drag')
    })
  })
})
