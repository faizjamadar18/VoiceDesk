import type { JSX, ReactNode } from 'react'

export interface OnboardingLayoutProps {
  leftContent: ReactNode
  rightContent?: ReactNode
}

export function OnboardingLayout({
  leftContent,
  rightContent
}: OnboardingLayoutProps): JSX.Element {
  const hasRightContent = Boolean(rightContent)

  return (
    <div className="flex flex-row h-full w-full items-center justify-center relative overflow-hidden bg-transparent">
      <div className="relative z-10 flex flex-row w-full max-w-[1400px] mx-auto px-8 lg:px-12 xl:px-16">
        <div
          className={`flex flex-col justify-center items-center px-4 sm:px-8 lg:px-12 xl:px-14 ${
            hasRightContent ? 'w-[50%]' : 'w-full'
          }`}
        >
          {leftContent}
        </div>
        {hasRightContent && (
          <div className="flex w-[50%] items-center justify-center">
            {rightContent}
          </div>
        )}
      </div>

      {/* Ambient bottom blue gradient glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-20"
        style={{
          background:
            'linear-gradient(to top, rgba(12, 140, 233, 0.15), rgba(12, 140, 233, 0.05) 50%, transparent)'
        }}
      />
    </div>
  )
}

