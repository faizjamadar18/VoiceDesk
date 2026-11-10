import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useSystemTheme } from '../../context/ThemeContext'
import { Card } from './Card'
import { SideNotchIcon, TopNotchIcon } from './icons'

const SELECTION_BLUE = '#0A84FF'
const WALLPAPER_BACKGROUND = [
  'radial-gradient(130% 100% at 88% -12%, rgba(150, 170, 255, 0.45), transparent 55%)',
  'linear-gradient(116deg, transparent 40%, rgba(255, 255, 255, 0.15) 46%, rgba(200, 214, 255, 0.21) 51%, rgba(255, 255, 255, 0.06) 56%, transparent 64%)',
  'linear-gradient(135deg, #2b3a9e 0%, #3d52c8 34%, #5468de 58%, #2c3aa4 100%)'
].join(', ')
const TRAFFIC_LIGHTS = ['#FF5F57', '#FEBC2E', '#28C840']

interface ThemePreviewProps {
  variant: 'system' | 'light' | 'dark'
}

function ThemePreview({ variant }: ThemePreviewProps): JSX.Element {
  const pane = (dark: boolean, clipPath?: string): JSX.Element => (
    <div className="absolute inset-0" style={{ clipPath }}>
      {/* Menu bar representation */}
      <div
        className="absolute top-0 inset-x-0 flex items-center"
        style={{
          height: '11%',
          background: dark ? 'rgba(10, 10, 16, 0.55)' : 'rgba(255, 255, 255, 0.42)'
        }}
      >
        <div
          className="rounded-full"
          style={{
            width: 3,
            height: 3,
            marginLeft: '6%',
            background: dark ? 'rgba(255,255,255,0.8)' : 'rgba(40,40,45,0.75)'
          }}
        />
      </div>

      {/* Notch representation */}
      <div
        className="absolute rounded-full"
        style={{
          left: '8%',
          top: '20%',
          width: '52%',
          height: '12%',
          background: dark ? '#3564D9' : '#7CA9F8'
        }}
      />

      {/* Main window */}
      <div
        className="absolute"
        style={{
          left: '8%',
          top: '44%',
          width: '84%',
          height: '70%',
          borderRadius: 6,
          background: dark ? '#17171a' : '#f5f5f7',
          boxShadow: dark
            ? '0 1px 4px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.08)'
            : '0 1px 4px rgba(20,30,80,0.25)'
        }}
      >
        <div className="flex items-center" style={{ gap: 3, padding: '9% 0 0 9%' }}>
          {TRAFFIC_LIGHTS.map((color) => (
            <div
              key={color}
              className="rounded-full"
              style={{ width: 6, height: 6, background: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="relative w-full h-full overflow-hidden rounded-[10px]"
      style={{ background: WALLPAPER_BACKGROUND }}
    >
      {pane(variant === 'dark')}
      {variant === 'system' && pane(true, 'inset(0 0 0 50%)')}
    </div>
  )
}

interface NotchPreviewProps {
  notch: 'top' | 'side'
  material: 'liquidGlass' | 'solidBlack'
}

function NotchPreview({ notch, material }: NotchPreviewProps): JSX.Element {
  const glass = material === 'liquidGlass'
  const surfaceStyle: React.CSSProperties = glass
    ? {
        background: 'rgba(22, 24, 32, 0.38)',
        backdropFilter: 'blur(7px) saturate(170%)',
        WebkitBackdropFilter: 'blur(7px) saturate(170%)',
        boxShadow:
          'inset 0 0 0 0.5px rgba(255,255,255,0.22), inset 0 1px 1px rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.3)'
      }
    : {
        background: '#050505',
        boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.1), 0 4px 10px rgba(0,0,0,0.4)'
      }

  const shapeStyle: React.CSSProperties =
    notch === 'top'
      ? {
          width: '56%',
          height: '30%',
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12
        }
      : {
          width: '20%',
          height: '58%',
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12
        }

  return (
    <div
      className="relative w-full h-full overflow-hidden rounded-[10px]"
      style={{ background: WALLPAPER_BACKGROUND }}
    >
      <div
        className={
          notch === 'top'
            ? 'absolute top-0 left-1/2 -translate-x-1/2 overflow-hidden'
            : 'absolute left-0 top-1/2 -translate-y-1/2 overflow-hidden'
        }
        style={{ ...shapeStyle, ...surfaceStyle }}
      >
        {glass && (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(118deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.08) 34%, transparent 55%)'
            }}
          />
        )}
      </div>
    </div>
  )
}

interface PreviewTileProps {
  selected: boolean
  disabled?: boolean
  label: string
  onSelect: () => void
  isDarkMode: boolean
  width: number
  height: number
  children: ReactNode
}

function PreviewTile({
  selected,
  disabled,
  label,
  onSelect,
  isDarkMode,
  width,
  height,
  children
}: PreviewTileProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className="voiceos-preview-tile-btn"
      style={{ cursor: disabled ? 'default' : 'pointer' }}
    >
      <div
        className="voiceos-preview-tile-ring"
        style={{
          boxShadow: selected ? `0 0 0 2.5px ${SELECTION_BLUE}` : '0 0 0 2.5px transparent'
        }}
      >
        <div
          className={`voiceos-preview-tile-box ${!disabled && !selected ? 'hover-brightness' : ''}`}
          style={{
            width,
            height,
            opacity: disabled ? 0.4 : 1,
            boxShadow: isDarkMode
              ? 'inset 0 0 0 1px rgba(255,255,255,0.10)'
              : 'inset 0 0 0 1px rgba(0,0,0,0.10)'
          }}
        >
          {children}
        </div>
      </div>
      <span
        className="voiceos-preview-tile-label"
        style={{
          fontWeight: selected ? 600 : 400,
          opacity: disabled ? 0.5 : 1,
          color: isDarkMode
            ? selected
              ? 'rgba(255,255,255,0.95)'
              : 'rgba(255,255,255,0.55)'
            : selected
              ? 'rgba(0,0,0,0.9)'
              : 'rgba(0,0,0,0.55)'
        }}
      >
        {label}
      </span>
    </button>
  )
}

export function AppearanceSettingsTab({
  isDarkMode: propIsDarkMode
}: {
  isDarkMode?: boolean
}): JSX.Element {
  const { theme, setTheme, isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode
  const [topNotch, setTopNotch] = useState<'liquidGlass' | 'solidBlack'>('liquidGlass')
  const [sideNotch, setSideNotch] = useState<'liquidGlass' | 'solidBlack'>('liquidGlass')

  const themeOptions: Array<{ value: 'system' | 'light' | 'dark'; label: string }> = [
    { value: 'system', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ]

  return (
    <div className="voiceos-tab-content">
      {/* 1. Theme Card */}
      <Card isDarkMode={isDarkMode} className="p-5">
        <div className="voiceos-setting-row">
          <div className="voiceos-setting-copy">
            <h3 className="voiceos-row-title">Theme</h3>
            <p className="voiceos-row-desc">How VoiceOS windows look.</p>
          </div>
          <div className="voiceos-preview-group" role="radiogroup" aria-label="Theme">
            {themeOptions.map((opt) => (
              <PreviewTile
                key={opt.value}
                selected={theme === opt.value}
                label={opt.label}
                onSelect={() => setTheme(opt.value)}
                isDarkMode={isDarkMode}
                width={104}
                height={68}
              >
                <ThemePreview variant={opt.value} />
              </PreviewTile>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. Top Notch Card */}
      <Card isDarkMode={isDarkMode} className="p-5 mt-4">
        <div className="voiceos-setting-row">
          <div className="voiceos-setting-copy flex items-center gap-2">
            <TopNotchIcon size={20} className={isDarkMode ? 'text-gray-300' : 'text-gray-600'} />
            <div>
              <h3 className="voiceos-row-title">Top notch</h3>
              <p className="voiceos-row-desc">Expands from the menu-bar notch.</p>
            </div>
          </div>
          <div className="voiceos-preview-group" role="radiogroup" aria-label="Top notch">
            <PreviewTile
              selected={topNotch === 'liquidGlass'}
              label="Liquid Glass"
              onSelect={() => setTopNotch('liquidGlass')}
              isDarkMode={isDarkMode}
              width={128}
              height={82}
            >
              <NotchPreview notch="top" material="liquidGlass" />
            </PreviewTile>
            <PreviewTile
              selected={topNotch === 'solidBlack'}
              label="Solid Black"
              onSelect={() => setTopNotch('solidBlack')}
              isDarkMode={isDarkMode}
              width={128}
              height={82}
            >
              <NotchPreview notch="top" material="solidBlack" />
            </PreviewTile>
          </div>
        </div>
      </Card>

      {/* 3. Side Notch Card */}
      <Card isDarkMode={isDarkMode} className="p-5 mt-4">
        <div className="voiceos-setting-row">
          <div className="voiceos-setting-copy flex items-center gap-2">
            <SideNotchIcon size={20} className={isDarkMode ? 'text-gray-300' : 'text-gray-600'} />
            <div>
              <h3 className="voiceos-row-title">Side notch</h3>
              <p className="voiceos-row-desc">Docks to the left edge of the screen.</p>
            </div>
          </div>
          <div className="voiceos-preview-group" role="radiogroup" aria-label="Side notch">
            <PreviewTile
              selected={sideNotch === 'liquidGlass'}
              label="Liquid Glass"
              onSelect={() => setSideNotch('liquidGlass')}
              isDarkMode={isDarkMode}
              width={128}
              height={82}
            >
              <NotchPreview notch="side" material="liquidGlass" />
            </PreviewTile>
            <PreviewTile
              selected={sideNotch === 'solidBlack'}
              label="Solid Black"
              onSelect={() => setSideNotch('solidBlack')}
              isDarkMode={isDarkMode}
              width={128}
              height={82}
            >
              <NotchPreview notch="side" material="solidBlack" />
            </PreviewTile>
          </div>
        </div>
      </Card>

      <p className="voiceos-platform-note">Liquid Glass is available on macOS only.</p>
    </div>
  )
}

