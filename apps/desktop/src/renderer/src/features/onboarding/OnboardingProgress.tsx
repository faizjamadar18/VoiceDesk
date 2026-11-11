import type { JSX } from 'react'

export interface OnboardingProgressProps {
  progress: number
  topOffset?: number
}

export function OnboardingProgress({
  progress,
  topOffset = 0
}: OnboardingProgressProps): JSX.Element {
  const isComplete = progress >= 100

  return (
    <div
      className="fixed left-0 right-0 z-50 transition-all duration-300"
      style={{
        top: `${topOffset}px`
      }}
    >
      <div className="w-full px-8 pt-6 max-w-[1400px] mx-auto">
        <div
          className="onboarding-progress-track"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className={`onboarding-progress-fill${isComplete ? ' onboarding-progress-fill--complete' : ''}`}
            style={{
              width: `${progress}%`,
              opacity: progress > 0 ? 1 : 0
            }}
          />
        </div>
      </div>
    </div>
  )
}

