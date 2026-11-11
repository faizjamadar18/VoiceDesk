import { useState } from 'react'
import type { JSX } from 'react'
import { OnboardingLayout } from './OnboardingLayout'
import { PermissionCard } from './PermissionCard'
import { LiquidGlassButton } from './LiquidGlassButton'
import screenPermissionVideo from '../../assets/screenPermission.webm'

export interface Screen1PermissionsProps {
  onNext: () => void
  screenPermissionGranted: boolean
  onGrantScreenPermission: () => void
}

export function Screen1Permissions({
  onNext,
  screenPermissionGranted,
  onGrantScreenPermission
}: Screen1PermissionsProps): JSX.Element {
  const [checkingScreen, setCheckingScreen] = useState(false)

  const handleAllowScreen = (): void => {
    setCheckingScreen(true)
    setTimeout(() => {
      onGrantScreenPermission()
      setCheckingScreen(false)
    }, 200)
  }

  return (
    <OnboardingLayout
      leftContent={
        <div className="flex min-h-[400px] w-full max-w-[600px] flex-col pt-16 pb-8">
          <div>
            <h1 className="text-2xl font-normal text-gray-900 tracking-tight">
              Enable core features
            </h1>
            <div className="mt-8 flex flex-col gap-3">
              {/* 1. Microphone */}
              <PermissionCard
                isGranted={true}
                grantedTitle="Microphone permission granted."
                pendingTitle="Allow VoiceOS to use your microphone."
                grantedDescription="Your speech will be transcribed."
                pendingDescription="Let VoiceOS transcribe your speech. Only active during dictation."
                isExpanded={false}
              />

              {/* 2. Accessibility */}
              <PermissionCard
                isGranted={true}
                grantedTitle="Accessibility permission granted."
                pendingTitle="Allow VoiceOS to insert spoken words."
                grantedDescription="VoiceOS can insert and edit text."
                pendingDescription="Let VoiceOS type your spoken words in the textbox."
                isExpanded={false}
              />

              {/* 3. Screen Recording */}
              <PermissionCard
                isGranted={screenPermissionGranted}
                grantedTitle="Screen permission granted."
                pendingTitle="Allow VoiceOS to see your screen."
                grantedDescription="Agent Mode can answer questions about your screen."
                pendingDescription="Only when you ask Agent Mode for help. Screenshots are never stored or shared."
                isExpanded={!screenPermissionGranted}
              >
                <div className="flex flex-col items-start gap-2">
                  <LiquidGlassButton
                    onClick={handleAllowScreen}
                    disabled={checkingScreen || screenPermissionGranted}
                  >
                    {checkingScreen ? 'Checking...' : 'Allow'}
                  </LiquidGlassButton>
                </div>
              </PermissionCard>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <div
              style={{
                opacity: screenPermissionGranted ? 1 : 0,
                pointerEvents: screenPermissionGranted ? 'auto' : 'none',
                transition: 'opacity 0.3s ease-in-out'
              }}
            >
              <LiquidGlassButton
                onClick={onNext}
                disabled={!screenPermissionGranted}
              >
                Continue
              </LiquidGlassButton>
            </div>
          </div>
        </div>
      }
      rightContent={
        <div className="w-full max-w-[500px] h-[400px] rounded-2xl flex items-center justify-center overflow-hidden">
          <video
            src={screenPermissionVideo}
            autoPlay
            loop
            muted
            playsInline
            className="max-h-full max-w-full object-contain rounded-2xl shadow-lg"
          />
        </div>
      }
    />
  )
}
