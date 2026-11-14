import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DUMMY_INSIGHTS_DATA } from './dummy-data'
import { InsightsPage } from './InsightsPage'
import { VoiceTypeCard } from './VoiceTypeCard'
import { WordsDictatedCard } from './WordsDictatedCard'
import { AgentPromptsCard } from './AgentPromptsCard'
import { AppUsageCard } from './AppUsageCard'
import { StreakCard } from './StreakCard'
import { PeakHoursCard } from './PeakHoursCard'
import { VoiceTypeModal } from './VoiceTypeModal'

describe('VoiceOS Insights Feature', () => {
  describe('DUMMY_INSIGHTS_DATA', () => {
    it('has exact reference values matching the screenshots', () => {
      expect(DUMMY_INSIGHTS_DATA.percentile.topPercent).toBe(25)
      expect(DUMMY_INSIGHTS_DATA.percentile.dailyAverageSessions).toBe(31)
      expect(DUMMY_INSIGHTS_DATA.percentile.nextTopPercent).toBe(20)
      expect(DUMMY_INSIGHTS_DATA.percentile.sessionsToNext).toBe(4)

      expect(DUMMY_INSIGHTS_DATA.words.totalWords).toBe(2717)
      expect(DUMMY_INSIGHTS_DATA.words.timeSavedMinutes).toBe(50)
      expect(DUMMY_INSIGHTS_DATA.words.sessions).toBe(157)
      expect(DUMMY_INSIGHTS_DATA.words.weekWords).toBe(2717)

      expect(DUMMY_INSIGHTS_DATA.agent.prompts).toBe(151)
      expect(DUMMY_INSIGHTS_DATA.agent.timeSavedMinutes).toBe(49)
      expect(DUMMY_INSIGHTS_DATA.agent.sessions).toBe(151)
      expect(DUMMY_INSIGHTS_DATA.agent.weekMinutes).toBe(49)

      expect(DUMMY_INSIGHTS_DATA.apps).toHaveLength(4)
      expect(DUMMY_INSIGHTS_DATA.apps[0].name).toBe('VoiceOS')
      expect(DUMMY_INSIGHTS_DATA.apps[0].share).toBe(0.5)

      expect(DUMMY_INSIGHTS_DATA.streak.current).toBe(5)
      expect(DUMMY_INSIGHTS_DATA.streak.longest).toBe(5)

      expect(DUMMY_INSIGHTS_DATA.peakHours.busiestHour).toBe(7)
      expect(DUMMY_INSIGHTS_DATA.peakHours.hourCounts).toHaveLength(24)

      expect(DUMMY_INSIGHTS_DATA.voiceType.typeName).toBe('The Agent Commander')
      expect(DUMMY_INSIGHTS_DATA.voiceType.stats).toHaveLength(3)
    })
  })

  describe('VoiceTypeCard', () => {
    it('renders top percent, ladder labels, and daily average stats', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeCard, { data: DUMMY_INSIGHTS_DATA.percentile })
      )
      expect(html).toContain('Top 25%')
      expect(html).toContain('OF VOICEOS USERS')
      expect(html).toContain('Top 50%')
      expect(html).toContain('Top 1%')
      expect(html).toContain('Daily average')
      expect(html).toContain('31 sessions')
      expect(html).toContain('Next: top 20%')
      expect(html).toContain('+4 sessions')
    })
  })

  describe('WordsDictatedCard', () => {
    it('renders total words and stat rows', () => {
      const html = renderToStaticMarkup(
        createElement(WordsDictatedCard, { data: DUMMY_INSIGHTS_DATA.words })
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

  describe('AgentPromptsCard', () => {
    it('renders agent prompts and stat rows', () => {
      const html = renderToStaticMarkup(
        createElement(AgentPromptsCard, { data: DUMMY_INSIGHTS_DATA.agent })
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

  describe('AppUsageCard', () => {
    it('renders app names, percentages, and session counts', () => {
      const html = renderToStaticMarkup(
        createElement(AppUsageCard, { apps: DUMMY_INSIGHTS_DATA.apps })
      )
      expect(html).toContain('App usage')
      expect(html).toContain('APPS USED | 4')
      expect(html).toContain('VoiceOS')
      expect(html).toContain('50%')
      expect(html).toContain('explorer')
      expect(html).toContain('Antigravity IDE')
      expect(html).toContain('msedge')
    })
  })

  describe('StreakCard', () => {
    it('renders streak header, weekday labels, and legend', () => {
      const html = renderToStaticMarkup(
        createElement(StreakCard, { data: DUMMY_INSIGHTS_DATA.streak })
      )
      expect(html).toContain('5 day streak')
      expect(html).toContain('LONGEST | 5 DAYS')
      expect(html).toContain('Jun')
      expect(html).toContain('Aug')
      expect(html).toContain('Sep')
      expect(html).toContain('Oct')
      expect(html).toContain('Nov')
      expect(html).toContain('Less')
      expect(html).toContain('More')
      expect(html).toContain('Today')
    })
  })

  describe('PeakHoursCard', () => {
    it('renders peak hours header, busiest hour 7 AM, and time ticks', () => {
      const html = renderToStaticMarkup(
        createElement(PeakHoursCard, { data: DUMMY_INSIGHTS_DATA.peakHours })
      )
      expect(html).toContain('Peak hours')
      expect(html).toContain('BUSIEST | 7 AM')
      expect(html).toContain('12 AM')
      expect(html).toContain('6 AM')
      expect(html).toContain('12 PM')
      expect(html).toContain('6 PM')
    })
  })

  describe('VoiceTypeModal', () => {
    it('renders nothing when closed', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeModal, {
          isOpen: false,
          onClose: () => {},
          data: DUMMY_INSIGHTS_DATA.voiceType
        })
      )
      expect(html).toBe('')
    })

    it('renders action buttons and canvas container when open', () => {
      const html = renderToStaticMarkup(
        createElement(VoiceTypeModal, {
          isOpen: true,
          onClose: () => {},
          data: DUMMY_INSIGHTS_DATA.voiceType
        })
      )
      expect(html).toContain('canvas')
      expect(html).toContain('Post to LinkedIn')
      expect(html).toContain('Post to Twitter')
      expect(html).toContain('Copy image')
      expect(html).toContain('Download image')
    })
  })

  describe('InsightsPage', () => {
    it('renders header, Voice Type button, and all bento cards', () => {
      const html = renderToStaticMarkup(
        createElement(InsightsPage, { data: DUMMY_INSIGHTS_DATA })
      )
      expect(html).toContain('Insights')
      expect(html).toContain('Voice Type')
      expect(html).toContain('Top 25%')
      expect(html).toContain('TOTAL WORDS DICTATED')
      expect(html).toContain('AGENT PROMPTS')
      expect(html).toContain('App usage')
      expect(html).toContain('5 day streak')
      expect(html).toContain('Peak hours')
    })
  })
})
