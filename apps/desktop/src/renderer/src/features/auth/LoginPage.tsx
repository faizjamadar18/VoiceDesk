import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import './login.css'
import logoBlack from '../../assets/voiceOsLogoBlack.png'
import skyClouds from '../../assets/skyClouds.webp'
import notionIcon from '../../assets/notion.webp'
import slackIcon from '../../assets/slack.webp'
import gmailIcon from '../../assets/gmail.webp'
import figmaIcon from '../../assets/figma.webp'
import claudeIcon from '../../assets/claude.webp'
import { useAuth } from './useAuth'

// --- Stoplights ---
type WindowAction = 'minimize' | 'maximize' | 'close'

function runWindowAction(action: WindowAction): void {
  if (action === 'minimize') {
    window.kestrel?.minimizeWindow()
  } else if (action === 'maximize') {
    window.kestrel?.toggleMaximizeWindow()
  } else {
    window.kestrel?.closeWindow()
  }
}

const STOPLIGHTS: Array<{ action: WindowAction; ariaLabel: string; color: string }> = [
  { action: 'minimize', ariaLabel: 'Minimize window', color: '#a0a0a0' },
  { action: 'maximize', ariaLabel: 'Maximize window', color: '#28c840' },
  { action: 'close', ariaLabel: 'Close window', color: '#ff5f57' }
]

function StoplightGlyph({ action }: { action: WindowAction }): JSX.Element {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      {action === 'close' && (
        <path stroke="rgba(0,0,0,0.6)" strokeWidth="1.2" d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" />
      )}
      {action === 'minimize' && (
        <line x1="1" y1="4" x2="7" y2="4" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2" />
      )}
      {action === 'maximize' && (
        <path
          stroke="rgba(0,0,0,0.6)"
          strokeWidth="1.2"
          fill="none"
          d="M1.5 2.5L4 0.5L6.5 2.5M1.5 5.5L4 7.5L6.5 5.5"
        />
      )}
    </svg>
  )
}

// --- Google 4-Color Icon ---
export function GoogleIcon({ width = 18, height = 18 }: { width?: number; height?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  )
}

// --- Animated Audio Bars ---
interface AudioBarsProps {
  isWindingDown: boolean
}

export function AnimatedAudioBars({ isWindingDown }: AudioBarsProps): JSX.Element {
  const initialBars = [0.05, 0.05, 0.05, 0.05, 0.05]
  const [bars, setBars] = useState<number[]>(() => initialBars.map(() => 0.3 + Math.random() * 0.7))

  useEffect(() => {
    if (isWindingDown) {
      setBars(initialBars)
      return
    }

    setBars(initialBars.map(() => 0.3 + Math.random() * 0.7))
    const interval = setInterval(() => {
      setBars(initialBars.map(() => 0.3 + Math.random() * 0.7))
    }, 220)

    return () => clearInterval(interval)
  }, [isWindingDown])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      {bars.map((scale, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: `${5 + scale * 16}px`,
            background: 'linear-gradient(to top, rgba(255,255,255,0.7) 0%, rgba(255,255,255,1) 100%)',
            opacity: 0.6 + scale * 0.4,
            borderRadius: 3,
            margin: '0 1px',
            transition: 'height 0.2s ease-out, opacity 0.2s ease-out'
          }}
        />
      ))}
    </div>
  )
}

// --- App Window Configurations ---
interface AppConfig {
  name: string
  backgroundColor: string
  sidebarColor: string
  sidebarWidth: number
  accentColor: string | null
}

const APP_WINDOWS: AppConfig[] = [
  {
    name: 'Notion',
    backgroundColor: '#ffffff',
    sidebarColor: '#f7f6f3',
    sidebarWidth: 50,
    accentColor: null
  },
  {
    name: 'Slack',
    backgroundColor: '#ffffff',
    sidebarColor: '#4a154b',
    sidebarWidth: 50,
    accentColor: null
  },
  {
    name: 'Gmail',
    backgroundColor: '#ffffff',
    sidebarColor: '#f6f8fc',
    sidebarWidth: 45,
    accentColor: '#1a73e8'
  },
  {
    name: 'Figma',
    backgroundColor: '#e5e5e5',
    sidebarColor: '#2c2c2c',
    sidebarWidth: 45,
    accentColor: null
  },
  {
    name: 'Claude',
    backgroundColor: '#f9f5ee',
    sidebarColor: '#ebe5db',
    sidebarWidth: 50,
    accentColor: '#d97757'
  }
]

interface AppWindowProps {
  appIndex: number
  isTransitioning: boolean
  width?: number
  height?: number
}

export function AppWindow({
  appIndex,
  isTransitioning,
  width = 224,
  height = 146
}: AppWindowProps): JSX.Element {
  const config = APP_WINDOWS[appIndex] || APP_WINDOWS[0]

  return (
    <div
      className="login-mock-window"
      style={{
        width,
        height,
        backgroundColor: config.backgroundColor,
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? 'scale(0.96)' : 'scale(1)'
      }}
    >
      <div
        className="login-mock-titlebar"
        style={{
          backgroundColor: config.sidebarColor,
          borderBottom: `1px solid ${
            config.backgroundColor === '#ffffff' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
          }`
        }}
      >
        <div className="login-mock-dot" style={{ backgroundColor: '#ff5f57' }} />
        <div className="login-mock-dot" style={{ backgroundColor: '#febc2e' }} />
        <div className="login-mock-dot" style={{ backgroundColor: '#28c840' }} />
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        <div
          style={{
            width: config.sidebarWidth * (width / 200),
            backgroundColor: config.sidebarColor,
            borderRight: `1px solid ${
              config.backgroundColor === '#ffffff' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'
            }`
          }}
        >
          <div
            style={{
              padding: `${width * 0.04}px ${width * 0.03}px`,
              display: 'flex',
              flexDirection: 'column',
              gap: width * 0.03
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: width * 0.028,
                  borderRadius: width * 0.014,
                  backgroundColor:
                    config.sidebarColor === '#4a154b'
                      ? 'rgba(255,255,255,0.2)'
                      : config.sidebarColor === '#2c2c2c'
                        ? 'rgba(255,255,255,0.15)'
                        : 'rgba(0,0,0,0.08)',
                  width: `${60 + i * 10}%`
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          {config.accentColor && config.name === 'Gmail' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1.5,
                backgroundColor: config.accentColor
              }}
            />
          )}
          <div
            style={{
              padding: `${width * 0.06}px ${width * 0.05}px`,
              display: 'flex',
              flexDirection: 'column',
              gap: width * 0.04
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: width * 0.024,
                  borderRadius: width * 0.012,
                  backgroundColor:
                    config.backgroundColor === '#2c2c2c'
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.06)',
                  width: `${85 - i * 15}%`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- App Pill Animation ---
const APP_ICONS = [notionIcon, slackIcon, gmailIcon, figmaIcon, claudeIcon]

export function AppPillAnimation(): JSX.Element {
  const [currentIconIndex, setCurrentIconIndex] = useState(0)
  const [isWindingDown, setIsWindingDown] = useState(false)
  const windDownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cycleDuration = 3500
    const windDownTime = 300

    const startCycle = () => {
      windDownTimerRef.current = setTimeout(() => {
        setIsWindingDown(true)
      }, cycleDuration - windDownTime)

      iconTimerRef.current = setTimeout(() => {
        setCurrentIconIndex((prev) => (prev + 1) % APP_ICONS.length)
        setIsWindingDown(false)
        startCycle()
      }, cycleDuration)
    }

    startCycle()

    return () => {
      if (windDownTimerRef.current) clearTimeout(windDownTimerRef.current)
      if (iconTimerRef.current) clearTimeout(iconTimerRef.current)
    }
  }, [])

  const pillWidth = isWindingDown ? 44 : 100
  const pillPadding = isWindingDown ? '0 4px' : '0 10px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <AppWindow
        appIndex={currentIconIndex}
        isTransitioning={isWindingDown}
        width={224}
        height={146}
      />

      <div className="login-voice-pill-wrap">
        <div
          className="login-voice-pill"
          style={{
            width: pillWidth,
            padding: pillPadding
          }}
        >
          {!isWindingDown && (
            <>
              <img
                src={APP_ICONS[currentIconIndex]}
                alt="Active App"
                className="login-voice-pill-icon"
              />
              <AnimatedAudioBars isWindingDown={isWindingDown} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main LoginPage Component ---
export function LoginPage(): JSX.Element {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { loginWithGoogle, loginWithEmail } = useAuth()

  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())
  const emailOk = isValidEmail(email)

  const handleGoogleAuth = async () => {
    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      await loginWithGoogle()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Google authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinueWithEmail = async () => {
    if (!emailOk) return
    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      await loginWithEmail(email)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to continue with email')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="voiceos-login-page">
      {/* Draggable Titlebar Strip */}
      <div className="login-drag-strip" aria-hidden="true" />

      {/* Stoplight Window Controls (Top-Right) */}
      <div className="login-stoplights">
        {STOPLIGHTS.map(({ action, ariaLabel, color }) => (
          <button
            key={action}
            type="button"
            className="login-stoplight-btn"
            style={{ backgroundColor: color }}
            onClick={() => runWindowAction(action)}
            aria-label={ariaLabel}
          >
            <StoplightGlyph action={action} />
          </button>
        ))}
      </div>

      {/* Two-Column Center Container */}
      <div className="login-container">
        {/* Left Column: Form */}
        <div className="login-left-col">
          <div className="login-form-wrapper">
            {/* Minimalist VO Logo */}
            <img src={logoBlack} alt="VoiceDesk Logo" className="login-logo" />

            {/* Header */}
            <h1 className="login-title">
              {mode === 'signin' ? 'Welcome back!' : 'Welcome to VoiceDesk'}
            </h1>
            <p className="login-subtitle">
              {mode === 'signin'
                ? 'Log in to get started'
                : 'Write faster in all your apps with voice.'}
            </p>

            {errorMessage && (
              <div
                style={{
                  width: '100%',
                  marginBottom: '16px',
                  padding: '10px 14px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '8px',
                  fontSize: '12px',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Email Input */}
            <div className="login-input-group">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleContinueWithEmail()
                  }
                }}
                className="login-input"
              />
            </div>

            {/* Continue with Email */}
            <button
              type="button"
              onClick={handleContinueWithEmail}
              disabled={!emailOk || isSubmitting}
              className={`login-btn-email ${emailOk && !isSubmitting ? 'active' : 'disabled'}`}
            >
              Continue with Email
            </button>

            {/* Divider */}
            <div className="login-divider">
              <div className="login-divider-line" />
              <span className="login-divider-text">Or continue with</span>
              <div className="login-divider-line" />
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={isSubmitting}
              className="login-btn-google"
            >
              <GoogleIcon width={18} height={18} />
              <span>Google</span>
            </button>

            {/* Terms and Privacy */}
            <p className="login-terms">
              By continuing, I accept VoiceDesk&apos;s{' '}
              <a href="https://voicedesk.ai/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>{' '}
              &amp;{' '}
              <a href="https://voicedesk.ai/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
            </p>

            {/* Mode Toggle */}
            <p className="login-mode-switch">
              {mode === 'signin' ? 'Need to create an account?' : 'Already have an account?'}
              <button
                type="button"
                onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
              >
                {mode === 'signin' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>

        {/* Right Column: Visual Spherical Clouds Backdrop */}
        <div className="login-right-col">
          <div className="login-sphere-container">
            {/* The circular sky sphere */}
            <div
              className="login-sky-sphere"
              style={{
                background: `url(${skyClouds}) center 72% / cover no-repeat`
              }}
            >
              <div className="login-sky-shine" />
            </div>

            {/* Floating content inside sphere */}
            <div className="login-floating-content">
              <AppPillAnimation />
            </div>
          </div>
        </div>
      </div>

      {/* Ambient Bottom Blue Gradient */}
      <div className="login-bottom-glow" aria-hidden="true" />
    </div>
  )
}
