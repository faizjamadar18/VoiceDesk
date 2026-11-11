import { useState } from 'react'
import type { JSX } from 'react'
import type { OnboardingStep, OnboardingFlowProps } from './types'
import { OnboardingProgress } from './OnboardingProgress'
import { Screen1Permissions } from './Screen1Permissions'
import { Screen2AgentKeyTester } from './Screen2AgentKeyTester'
import { Screen3DictationIntro } from './Screen3DictationIntro'
import { Screen4DictationKeyTester } from './Screen4DictationKeyTester'
import { useAuth } from '../auth/useAuth'

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1)
  const [screenPermissionGranted, setScreenPermissionGranted] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const { signOut, user } = useAuth()

  // Calculate progress
  // Step 1: 15% before screen permission, 25% after
  // Step 2: 50%
  // Step 3: 75%
  // Step 4: 100%
  let progress = 15
  if (currentStep === 1) {
    progress = screenPermissionGranted ? 25 : 15
  } else if (currentStep === 2) {
    progress = 50
  } else if (currentStep === 3) {
    progress = 75
  } else if (currentStep === 4) {
    progress = 100
  }

  const handleBack = (): void => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as OnboardingStep)
    }
  }

  const handleFinishOnboarding = (): void => {
    try {
      localStorage.setItem('onboarding_completed', 'true')
      if (user?.id) {
        localStorage.setItem(`onboarding_completed_${user.id}`, 'true')
      }
    } catch (e) {
      console.warn('Failed to save onboarding_completed to localStorage', e)
    }
    onComplete()
  }

  return (
    <main className="w-full h-full relative overflow-clip bg-white app-window-root onboarding-force-light text-neutral-900 select-none">
      {/* Top drag strip */}
      <div
        className="fixed top-0 left-0 right-0 h-10 z-40 pointer-events-auto"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Top progress bar */}
      <OnboardingProgress progress={progress} topOffset={4} />

      {/* Main step content */}
      <div className="w-full h-full">
        {currentStep === 1 && (
          <Screen1Permissions
            onNext={() => setCurrentStep(2)}
            screenPermissionGranted={screenPermissionGranted}
            onGrantScreenPermission={() => setScreenPermissionGranted(true)}
          />
        )}

        {currentStep === 2 && (
          <Screen2AgentKeyTester
            onNext={() => setCurrentStep(3)}
            onSignOut={signOut}
          />
        )}

        {currentStep === 3 && (
          <Screen3DictationIntro
            onNext={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <Screen4DictationKeyTester
            onComplete={handleFinishOnboarding}
            onSignOut={signOut}
          />
        )}
      </div>

      {/* Bottom-left Back button (visible on steps 2, 3, 4) */}
      {currentStep > 1 && (
        <button
          type="button"
          onClick={handleBack}
          className="onboarding-back-button onboarding-navigation-back-button fixed bottom-6 left-6 z-[70] cursor-pointer"
        >
          Back
        </button>
      )}

      {/* Bottom-right sound/volume button */}
      <button
        type="button"
        onClick={() => setIsMuted((prev) => !prev)}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="onboarding-back-button onboarding-navigation-back-button onboarding-music-button fixed bottom-6 right-6 z-[70] cursor-pointer"
      >
        {isMuted ? (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>
    </main>
  )
}
