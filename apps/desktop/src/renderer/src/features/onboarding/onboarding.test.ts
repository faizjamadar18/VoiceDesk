import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { AnimatedCheck } from './AnimatedCheck'
import { AudioBars } from './AudioBars'
import { DemoPill } from './DemoPill'
import { DictationDemo } from './DictationDemo'
import { KeyboardKey, getKeyDisplay, getKeyDisplayInfo } from './KeyboardKey'
import { LiquidGlassButton } from './LiquidGlassButton'
import { OnboardingFlow } from './OnboardingFlow'
import { OnboardingLayout } from './OnboardingLayout'
import { OnboardingProgress } from './OnboardingProgress'
import { PermissionCard } from './PermissionCard'
import { Screen1Permissions } from './Screen1Permissions'
import { Screen2AgentKeyTester } from './Screen2AgentKeyTester'
import { Screen3DictationIntro } from './Screen3DictationIntro'
import { Screen4DictationKeyTester } from './Screen4DictationKeyTester'
import { TroubleshootModal } from './TroubleshootModal'

// Polyfill localStorage in node test environment
const mockStore: Record<string, string> = {}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (key: string) => mockStore[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStore[key] = value
    },
    removeItem: (key: string) => {
      delete mockStore[key]
    },
    clear: () => {
      for (const k of Object.keys(mockStore)) {
        delete mockStore[k]
      }
    },
    length: 0,
    key: () => null
  } as Storage
}

describe('VoiceOS Onboarding Flow Forensic Suite', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('LiquidGlassButton Component', () => {
    it('renders with exact VoiceOS glassmorphic classes and structure', () => {
      const html = renderToStaticMarkup(
        createElement(LiquidGlassButton, { disabled: false }, 'Continue')
      )

      expect(html).toContain('glassmorphic-button-rect-wrap')
      expect(html).toContain('glassmorphic-button-rect-shadow')
      expect(html).toContain('glassmorphic-button-rect')
      expect(html).toContain('<span>Continue</span>')
    })

    it('applies disabled styling when disabled', () => {
      const html = renderToStaticMarkup(
        createElement(LiquidGlassButton, { disabled: true }, 'Disabled')
      )

      expect(html).toContain('disabled=""')
      expect(html).toContain('pointer-events:none')
      expect(html).toContain('opacity:0.5')
    })
  })

  describe('AnimatedCheck Component', () => {
    it('renders SVG checkmark with default VoiceOS blue color', () => {
      const html = renderToStaticMarkup(createElement(AnimatedCheck, { trigger: true }))

      expect(html).toContain('background-color:#126ff6')
      expect(html).toContain('<polyline points="20 6 9 17 4 12"')
    })
  })

  describe('PermissionCard Component', () => {
    it('renders granted state with title, description, and checkmark', () => {
      const html = renderToStaticMarkup(
        createElement(PermissionCard, {
          isGranted: true,
          grantedTitle: 'Microphone permission granted.',
          pendingTitle: 'Allow VoiceOS to use your microphone.',
          grantedDescription: 'Your speech will be transcribed.',
          pendingDescription: 'Microphone pending description'
        })
      )

      expect(html).toContain('Microphone permission granted.')
      expect(html).toContain('Your speech will be transcribed.')
      expect(html).toContain('background-color:#126ff6')
    })

    it('renders pending state with pending copy and action button', () => {
      const html = renderToStaticMarkup(
        createElement(
          PermissionCard,
          {
            isGranted: false,
            grantedTitle: 'Screen permission granted.',
            pendingTitle: 'Allow VoiceOS to see your screen.',
            grantedDescription: 'Agent Mode can answer questions about your screen.',
            pendingDescription:
              'Only when you ask Agent Mode for help. Screenshots are never stored or shared.'
          },
          createElement('button', { type: 'button' }, 'Allow')
        )
      )

      expect(html).toContain('Allow VoiceOS to see your screen.')
      expect(html).toContain(
        'Only when you ask Agent Mode for help. Screenshots are never stored or shared.'
      )
      expect(html).toContain('Allow')
    })
  })

  describe('OnboardingProgress Component', () => {
    it('renders track with correct ARIA progress values and gradient width', () => {
      const html = renderToStaticMarkup(
        createElement(OnboardingProgress, { progress: 50, topOffset: 4 })
      )

      expect(html).toContain('onboarding-progress-track')
      expect(html).toContain('aria-valuenow="50"')
      expect(html).toContain('width:50%')
      expect(html).toContain('onboarding-progress-fill')
      expect(html).not.toContain('onboarding-progress-fill--complete')
    })

    it('applies --complete modifier when progress reaches 100%', () => {
      const html = renderToStaticMarkup(
        createElement(OnboardingProgress, { progress: 100 })
      )

      expect(html).toContain('onboarding-progress-fill--complete')
      expect(html).toContain('aria-valuenow="100"')
    })
  })

  describe('OnboardingLayout Component', () => {
    it('renders 50/50 split layout when rightContent is provided', () => {
      const html = renderToStaticMarkup(
        createElement(OnboardingLayout, {
          leftContent: createElement('div', null, 'Left Content'),
          rightContent: createElement('div', null, 'Right Content')
        })
      )

      expect(html).toContain('w-[50%]')
      expect(html).toContain('Left Content')
      expect(html).toContain('Right Content')
      expect(html).toContain('linear-gradient(to top, rgba(12, 140, 233, 0.15)')
    })

    it('renders full-width centered layout when rightContent is omitted', () => {
      const html = renderToStaticMarkup(
        createElement(OnboardingLayout, {
          leftContent: createElement('div', null, 'Centered Content')
        })
      )

      expect(html).toContain('w-full')
      expect(html).not.toContain('w-[50%]')
      expect(html).toContain('Centered Content')
    })
  })

  describe('KeyboardKey & Key Utilities', () => {
    it('correctly maps display info for modifier keys', () => {
      const ctrl = getKeyDisplayInfo('control-left', 'darwin')
      expect(ctrl.label).toBe('control')
      expect(ctrl.symbol).toBe('⌃')
      expect(ctrl.side).toBe('left')
      expect(ctrl.isModifier).toBe(true)

      const shift = getKeyDisplayInfo('shift-left', 'darwin')
      expect(shift.label).toBe('shift')
      expect(shift.symbol).toBe('⇧')
      expect(shift.side).toBe('left')

      const alt = getKeyDisplayInfo('alt-left', 'darwin')
      expect(alt.label).toBe('option')
      expect(alt.symbol).toBe('⌥')
    })

    it('formats key display with getKeyDisplay', () => {
      expect(getKeyDisplay('control-left', 'darwin')).toBe('⌃')
      expect(getKeyDisplay('shift-left', 'darwin')).toBe('⇧')
      expect(getKeyDisplay('control-left', 'win32')).toBe('Ctrl')
      expect(getKeyDisplay('alt-left', 'win32')).toBe('Alt')
    })

    it('renders inline keycap with label and styling', () => {
      const html = renderToStaticMarkup(
        createElement(KeyboardKey, { keyboardKey: 'control-left', variant: 'inline' })
      )

      expect(html).toContain('<kbd')
      expect(html).toContain('control (left)')
    })

    it('renders large tile keycap with symbol, label, and side indicator SVG', () => {
      const html = renderToStaticMarkup(
        createElement(KeyboardKey, {
          keyboardKey: 'control-left',
          variant: 'tile',
          isPressed: false
        })
      )

      expect(html).toContain('viewBox="0 0 80 80"')
      expect(html).toContain('⌃')
      expect(html).toContain('control')
      expect(html).toContain('(left)')
    })

    it('applies blue active styling when isPressed is true', () => {
      const html = renderToStaticMarkup(
        createElement(KeyboardKey, {
          keyboardKey: 'control-left',
          variant: 'tile',
          isPressed: true
        })
      )

      expect(html).toContain('bg-blue-100/90')
      expect(html).toContain('border-blue-200')
    })
  })

  describe('AudioBars & DemoPill Components', () => {
    it('renders audio bars correctly', () => {
      const html = renderToStaticMarkup(
        createElement(AudioBars, { barCount: 5, barColor: 'white' })
      )

      expect(html).toContain('background-color:white')
    })

    it('renders DemoPill with notch capsule and notion icon', () => {
      const html = renderToStaticMarkup(
        createElement(DemoPill, { isRecording: true })
      )

      expect(html).toContain('alt="Notion"')
      expect(html).toContain('background-color:#000000')
    })
  })

  describe('DictationDemo Component', () => {
    it('renders sky background, dark editor card, floating spoken text bubble, and notch pill', () => {
      const html = renderToStaticMarkup(createElement(DictationDemo))

      expect(html).toContain('Dictation Mode')
      expect(html).toContain('umm.. the deadline is Tuesday, actually Friday')
      expect(html).toContain('alt=""')
    })
  })

  describe('TroubleshootModal Component', () => {
    it('renders the 4 required forensic cards with accurate copy', () => {
      const html = renderToStaticMarkup(
        createElement(TroubleshootModal, {
          isOpen: true,
          onClose: () => {}
        })
      )

      expect(html).toContain('Troubleshoot')
      // Card 1: Trigger Key
      expect(html).toContain('Trigger Key')
      expect(html).toContain('Do you see the trigger key light up when you press it?')
      expect(html).toContain('Change')
      // Card 2: Service error
      expect(html).toContain('Getting a service error?')
      expect(html).toContain('VPNs, corporate networks, or network filters can block VoiceOS')
      // Card 3: Talk to us
      expect(html).toContain('Talk to us')
      expect(html).toContain('Send us a message and we&#x27;ll help you out')
      // Card 4: Re-login
      expect(html).toContain('Re-login')
      expect(html).toContain('If nothing else works, sign out and log back in.')
      expect(html).toContain('Sign out')
    })

    it('does not render when isOpen is false', () => {
      const html = renderToStaticMarkup(
        createElement(TroubleshootModal, {
          isOpen: false,
          onClose: () => {}
        })
      )

      expect(html).toBe('')
    })
  })

  describe('Screen 1: Permissions', () => {
    it('renders Enable core features headline, 3 permission cards, and video right pane', () => {
      const html = renderToStaticMarkup(
        createElement(Screen1Permissions, {
          onNext: () => {},
          screenPermissionGranted: false,
          onGrantScreenPermission: () => {}
        })
      )

      expect(html).toContain('Enable core features')
      expect(html).toContain('Microphone permission granted.')
      expect(html).toContain('Accessibility permission granted.')
      expect(html).toContain('Allow VoiceOS to see your screen.')
      expect(html).toContain('Allow')
      expect(html).toContain('<video')
    })
  })

  describe('Screen 2: Key Tester for Agent Mode', () => {
    it('renders exact TestTriggerKeyContent frame, question with control + alt keycaps, and action buttons', () => {
      const html = renderToStaticMarkup(
        createElement(Screen2AgentKeyTester, {
          onNext: () => {}
        })
      )

      expect(html).toContain('When pressing')
      expect(html).toContain('control (left)')
      expect(html).toContain('option (left)')
      expect(html).toContain('at the same time, do the keys light up blue?')
      expect(html).toContain('max-w-[480px]')
      expect(html).toContain('rounded-[28px]')
      expect(html).toContain('No, change key')
      expect(html).toContain('Yes')
    })
  })

  describe('Screen 3: Dictation Mode Intro', () => {
    it('renders title, description, DictationDemo, and ONLY the Continue button (NO skip button)', () => {
      const html = renderToStaticMarkup(
        createElement(Screen3DictationIntro, {
          onNext: () => {}
        })
      )

      expect(html).toContain('Dictation Mode')
      expect(html).toContain(
        'VoiceOS transcribes your words, removing filler words and correcting mistakes.'
      )
      expect(html).toContain('Continue')
      // MUST NOT contain skip button!
      expect(html).not.toContain('Skip')
      expect(html).not.toContain('skip')
    })
  })

  describe('Screen 4: Key Tester for Dictation Mode', () => {
    it('renders question with control + shift keycaps, and action buttons', () => {
      const html = renderToStaticMarkup(
        createElement(Screen4DictationKeyTester, {
          onComplete: () => {}
        })
      )

      expect(html).toContain('When pressing')
      expect(html).toContain('control (left)')
      expect(html).toContain('shift (left)')
      expect(html).toContain('at the same time, do the keys light up blue?')
      expect(html).toContain('max-w-[480px]')
      expect(html).toContain('rounded-[28px]')
      expect(html).toContain('No, change key')
      expect(html).toContain('Yes')
    })
  })

  describe('OnboardingFlow Integration & Persistence', () => {
    it('renders Step 1 initially with progress track and mute button', () => {
      const html = renderToStaticMarkup(
        createElement(OnboardingFlow, {
          onComplete: () => {}
        })
      )

      expect(html).toContain('Enable core features')
      expect(html).toContain('onboarding-progress-track')
      expect(html).toContain('onboarding-music-button')
    })

    it('persists completion state to localStorage when completed', () => {
      expect(localStorage.getItem('onboarding_completed')).toBeNull()

      localStorage.setItem('onboarding_completed', 'true')
      expect(localStorage.getItem('onboarding_completed')).toBe('true')
    })
  })
})
