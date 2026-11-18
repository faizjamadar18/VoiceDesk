import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { AppsPage } from './features/apps/AppsPage'
import { ActionsSection } from './features/agent/ActionsSection'
import { HistoryPage } from './features/history/HistoryPage'
import { PolishingSection } from './features/dictation/PolishingSection'
import { WritingStyleSection } from './features/dictation/WritingStyleSection'
import { InsightsPage } from './features/insights/InsightsPage'

describe('VoiceOS Responsive Layout & Container Queries', () => {
  let stylesCss = ''

  beforeAll(() => {
    const proc = (globalThis as unknown as { process?: { getBuiltinModule?: (m: string) => any; cwd: () => string } }).process
    const fsMod = proc?.getBuiltinModule?.('node:fs')
    const pathMod = proc?.getBuiltinModule?.('node:path')
    if (fsMod && pathMod && proc) {
      const cssPath = pathMod.resolve(
        proc.cwd(),
        'apps/desktop/src/renderer/src/styles.css'
      )
      stylesCss = fsMod.readFileSync(cssPath, 'utf-8')
    }
  })

  it('defines container-type: inline-size for @container and content wrappers', () => {
    expect(stylesCss).toMatch(/\.\\@container[\s\S]*?container-type:\s*inline-size/)
    expect(stylesCss).toMatch(/\.dashboard-content[\s\S]*?container-type:\s*inline-size/)
  })

  it('removes dead conflicting media queries (@media (max-width: 880px) and @media (max-width: 700px))', () => {
    expect(stylesCss).not.toContain('@media (max-width: 880px)')
    expect(stylesCss).not.toContain('@media (max-width: 700px)')
  })

  it('provides CSS @container rules for responsive grids', () => {
    // Quick start grid collapses to 1 col narrow, 2 cols on container >= 600px
    expect(stylesCss).toMatch(/@container\s*\(min-width:\s*600px\)[\s\S]*?\.quick-start-grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)

    // Agent actions grid collapses to 1 col narrow, 2 cols with gap 48px on container >= 600px
    expect(stylesCss).toMatch(/@container\s*\(min-width:\s*600px\)[\s\S]*?\.agent-actions-grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)

    // Apps grid collapses to 1 col narrow, 2 cols with gap 48px on container >= 600px
    expect(stylesCss).toMatch(/@container\s*\(min-width:\s*600px\)[\s\S]*?\.apps-grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)

    // Dictation polish grid collapses to 1 col narrow, 3 cols on container >= 600px
    expect(stylesCss).toMatch(/@container\s*\(min-width:\s*600px\)[\s\S]*?\.dictation-polish-grid[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('provides VoiceOS container utility classes for @[600px]:grid-cols-2 and @max-[560px]', () => {
    expect(stylesCss).toMatch(/@container\s*\(min-width:\s*600px\)[\s\S]*?\.\\@\\\[600px\\\]\\:grid-cols-2/)
    expect(stylesCss).toMatch(/@container\s*not\s*\(min-width:\s*560px\)[\s\S]*?\.\\@max-\\\[560px\\\]/)
  })

  it('supports History toolbar responsive flex behavior', () => {
    // History toolbar has gap and flex
    expect(stylesCss).toMatch(/\.history-toolbar\s*\{[\s\S]*?display:\s*flex/)
    // Search input has min-width: 0 and flex: 1 to avoid overflow
    expect(stylesCss).toMatch(/\.history-search\s*\{[\s\S]*?min-width:\s*0/)
  })

  it('renders AppsPage with @container wrapper and responsive 2-column grid classes', () => {
    const html = renderToStaticMarkup(createElement(AppsPage, { initialApps: [] }))
    expect(html).toContain('apps-page @container w-full min-w-0')
  })

  it('renders ActionsSection with responsive 2-column grid matching VoiceOS', () => {
    const html = renderToStaticMarkup(
      createElement(ActionsSection, { actions: [], onToggleAction: () => {} })
    )
    expect(html).toContain('agent-actions-grid md:grid md:grid-cols-2 md:gap-x-12 @[600px]:grid-cols-2 @[600px]:gap-x-12')
  })

  it('renders HistoryPage with @container wrapper, responsive toolbar and shrink-0 dropdowns', () => {
    const html = renderToStaticMarkup(createElement(HistoryPage, { records: [] }))
    expect(html).toContain('history-page @container w-full min-w-0')
    expect(html).toContain('history-toolbar mb-6 flex gap-3 flex-wrap @[560px]:flex-nowrap')
    expect(html).toContain('history-search flex-1 relative min-w-0')
    expect(html).toContain('shrink-0')
  })

  it('renders Dictation polish and style sections with responsive grid classes', () => {
    const polishHtml = renderToStaticMarkup(
      createElement(PolishingSection, { selectedStyle: 'polished', onSelectStyle: () => {} })
    )
    expect(polishHtml).toContain('dictation-polish-grid grid grid-cols-1 @[600px]:grid-cols-3 gap-3 items-stretch')

    const styleHtml3Cols = renderToStaticMarkup(
      createElement(WritingStyleSection, {
        activeContext: 'work_chat',
        selectedPreset: 'casual',
        onSelectContext: () => {},
        onSelectPreset: () => {}
      })
    )
    expect(styleHtml3Cols).toContain('dictation-style-grid--3cols grid-cols-1 @[600px]:grid-cols-3')

    const styleHtml4Cols = renderToStaticMarkup(
      createElement(WritingStyleSection, {
        activeContext: 'personal_chat',
        selectedPreset: 'casual',
        onSelectContext: () => {},
        onSelectPreset: () => {}
      })
    )
    expect(styleHtml4Cols).toContain('dictation-style-grid--4cols grid-cols-1 @[500px]:grid-cols-2 @[800px]:grid-cols-4')
  })

  it('renders InsightsPage with @container wrapper and responsive grid classes', () => {
    const html = renderToStaticMarkup(createElement(InsightsPage, {}))
    expect(html).toContain('insights-page @container w-full min-w-0')
    expect(html).toContain('grid grid-cols-1 @[700px]:grid-cols-3 md:grid-cols-3 gap-4')
    expect(html).toContain('grid grid-cols-1 @[600px]:grid-cols-2 lg:grid-cols-2 gap-4 items-stretch')
  })
})
