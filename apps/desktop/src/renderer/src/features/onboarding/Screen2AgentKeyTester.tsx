import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { OnboardingLayout } from './OnboardingLayout'
import { KeyboardKey } from './KeyboardKey'
import { LiquidGlassButton } from './LiquidGlassButton'
import { TroubleshootModal } from './TroubleshootModal'

export interface Screen2AgentKeyTesterProps {
  onNext: () => void
  onSignOut?: () => Promise<void> | void
}

export function Screen2AgentKeyTester({
  onNext,
  onSignOut
}: Screen2AgentKeyTesterProps): JSX.Element {
  const [ctrlPressed, setCtrlPressed] = useState(false)
  const [altPressed, setAltPressed] = useState(false)
  const [isTroubleshootModalOpen, setIsTroubleshootModalOpen] = useState(false)

  // Listen to physical key events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Control' || e.code === 'ControlLeft') {
        setCtrlPressed(true)
      }
      if (e.key === 'Alt' || e.code === 'AltLeft') {
        setAltPressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control' || e.code === 'ControlLeft') {
        setCtrlPressed(false)
      }
      if (e.key === 'Alt' || e.code === 'AltLeft') {
        setAltPressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const hasPressedAllTriggerKeys = ctrlPressed && altPressed

  return (
    <>
      <OnboardingLayout
        leftContent={
          <div className="flex flex-col min-h-[400px] justify-between pt-16 pb-8 w-full max-w-[480px]">
            <div>
              <h1 className="text-xl mb-4 font-normal text-gray-900 leading-relaxed">
                When pressing{' '}
                <span className="inline-flex items-center align-middle">
                  <KeyboardKey
                    keyboardKey="control-left"
                    variant="inline"
                    isDarkMode={false}
                    isPressed={ctrlPressed}
                    className="px-3 py-0.5"
                  />
                  <span className="mx-1">+</span>
                </span>
                {' '}
                <span className="inline-flex items-center align-middle">
                  <KeyboardKey
                    keyboardKey="alt-left"
                    variant="inline"
                    isDarkMode={false}
                    isPressed={altPressed}
                    className="px-3 py-0.5"
                  />
                </span>
                {' '}at the same time, do the keys light up blue?
              </h1>

              <div className="flex w-full flex-col gap-5 rounded-[28px] border-[0.75px] border-gray-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                <div className="flex w-full flex-row items-center justify-center gap-3 rounded-[20px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2.5 min-h-[42px]">
                    <KeyboardKey
                      keyboardKey="control-left"
                      isDarkMode={false}
                      isPressed={ctrlPressed}
                      className="transition-all duration-200 cursor-pointer"
                      style={{ width: '70px', height: '70px' }}
                      onClick={() => setCtrlPressed((prev) => !prev)}
                    />
                    <KeyboardKey
                      keyboardKey="alt-left"
                      isDarkMode={false}
                      isPressed={altPressed}
                      className="transition-all duration-200 cursor-pointer"
                      style={{ width: '70px', height: '70px' }}
                      onClick={() => setAltPressed((prev) => !prev)}
                    />
                  </div>
                </div>

                <div className="flex flex-row items-center justify-end gap-4 w-full">
                  <button
                    type="button"
                    onClick={() => setIsTroubleshootModalOpen(true)}
                    className="text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
                  >
                    No, change key
                  </button>

                  <LiquidGlassButton
                    disabled={!hasPressedAllTriggerKeys}
                    onClick={onNext}
                  >
                    Yes
                  </LiquidGlassButton>
                </div>
              </div>
            </div>
          </div>
        }
      />

      <TroubleshootModal
        isOpen={isTroubleshootModalOpen}
        onClose={() => setIsTroubleshootModalOpen(false)}
        onSignOut={onSignOut}
        keys={['control-left', 'alt-left']}
      />
    </>
  )
}
