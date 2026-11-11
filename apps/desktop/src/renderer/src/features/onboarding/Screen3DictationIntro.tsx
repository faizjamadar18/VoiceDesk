import type { JSX } from 'react'
import { OnboardingLayout } from './OnboardingLayout'
import { LiquidGlassButton } from './LiquidGlassButton'
import { DictationDemo } from './DictationDemo'

export interface Screen3DictationIntroProps {
  onNext: () => void
}

export function Screen3DictationIntro({ onNext }: Screen3DictationIntroProps): JSX.Element {
  return (
    <OnboardingLayout
      leftContent={
        <div className="flex flex-col min-h-[400px] justify-between pt-16 pb-8 w-full max-w-[480px]">
          <div>
            <h1 className="text-3xl mb-4 font-light text-gray-900 tracking-tight">
              Dictation Mode
            </h1>
            <p className="text-lg text-gray-700 leading-relaxed font-normal">
              VoiceOS transcribes your words, removing filler words and correcting mistakes.
            </p>
          </div>

          <div className="flex items-center gap-4 mt-8">
            <LiquidGlassButton onClick={onNext}>
              Continue
            </LiquidGlassButton>
          </div>
        </div>
      }
      rightContent={
        <div className="flex items-center justify-center w-full h-full py-8">
          <DictationDemo />
        </div>
      }
    />
  )
}

