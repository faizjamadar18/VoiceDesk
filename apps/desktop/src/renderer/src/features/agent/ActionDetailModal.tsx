import { useEffect, useId } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ZapIcon } from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import { AppleSwitch } from './AppleSwitch'
import { getActionMeta } from './action-detail-catalog'
import { NativeActionScene, NotchAnswerText } from './ActionScenes'
import {
  AppLaunchIcon,
  ClockIcon,
  MusicIcon,
  PointerTrailIcon,
  PromptDocumentIcon,
  TextSelectionIcon
} from './icons'
import type { AgentActionGlyph, AgentActionId, AgentActionItem } from './types'

export interface ActionDetailModalProps {
  action: AgentActionItem | null
  onClose: () => void
  onToggleAction?: (actionId: AgentActionId, enabled: boolean) => void
  isDarkMode?: boolean
}

const storeInk = (isDarkMode: boolean): string => (isDarkMode ? '#f5f5f7' : '#1d1d1f')
const storeSecondary = (isDarkMode: boolean): string => (isDarkMode ? '#98989d' : '#6e6e73')
const storeHairline = (isDarkMode: boolean): string =>
  isDarkMode ? 'rgba(223,226,232,0.09)' : 'rgba(0,0,0,0.1)'

const PREVIEW_TILE_WIDTH = 420
const PREVIEW_FRAME_HEIGHT = 244
const PREVIEW_FRAME_RADIUS = 26
const previewScreenEdge = (isDarkMode: boolean): string =>
  isDarkMode ? '#000000' : 'rgba(15,23,42,0.22)'
const previewScreenSilhouette = (isDarkMode: boolean): string =>
  isDarkMode ? '#000000' : 'rgba(15,23,42,0.14)'

function CloseIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function UserCircleIcon({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  )
}

function renderActionGlyph(glyph: AgentActionGlyph, size = 18): JSX.Element {
  switch (glyph) {
    case 'pointerTrail':
      return <PointerTrailIcon size={size} className="agent-action-glyph" />
    case 'promptDocument':
      return <PromptDocumentIcon size={size} className="agent-action-glyph" />
    case 'textSelection':
      return <TextSelectionIcon size={size} className="agent-action-glyph" />
    case 'clock':
      return <ClockIcon size={size} className="agent-action-glyph" />
    case 'music':
      return <MusicIcon size={size} className="agent-action-glyph" />
    case 'appLaunch':
      return <AppLaunchIcon size={size} className="agent-action-glyph" />
  }
}

function AppIcon({
  size = 88,
  glyph,
  isDarkMode
}: {
  size?: number
  glyph: AgentActionGlyph
  isDarkMode: boolean
}): JSX.Element {
  const shadows = [
    `0 0 0 1px ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
    isDarkMode ? '0 18px 36px rgba(0,0,0,0.5)' : '0 18px 36px rgba(0,0,0,0.16)'
  ].join(', ')

  return (
    <div
      className="relative flex shrink-0 select-none items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.2237),
        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        boxShadow: shadows
      }}
    >
      {renderActionGlyph(glyph, Math.round(size * 0.45))}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background:
            'linear-gradient(152deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.13) 20%, rgba(255,255,255,0.02) 36%, rgba(255,255,255,0) 50%), radial-gradient(125% 82% at 50% 112%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 62%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.18)'
        }}
      />
    </div>
  )
}

interface InfoCell {
  label: string
  value: ReactNode
  caption?: string
}

function InfoStrip({
  cells,
  isDarkMode
}: {
  cells: InfoCell[]
  isDarkMode: boolean
}): JSX.Element {
  const secondary = storeSecondary(isDarkMode)
  return (
    <div
      className="scrollbar-transparent-track flex overflow-x-auto"
      style={{
        borderTop: `1px solid ${storeHairline(isDarkMode)}`,
        borderBottom: `1px solid ${storeHairline(isDarkMode)}`
      }}
    >
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className="flex min-w-[104px] flex-1 flex-col items-center gap-1.5 px-3 py-4 text-center"
          style={index > 0 ? { borderLeft: `1px solid ${storeHairline(isDarkMode)}` } : undefined}
        >
          <span
            className="text-[11px] font-medium uppercase tracking-[0.08em]"
            style={{ color: secondary }}
          >
            {cell.label}
          </span>
          <span
            className="flex h-7 items-center whitespace-nowrap text-[21px] font-semibold tracking-[-0.02em]"
            style={{ color: secondary }}
          >
            {cell.value}
          </span>
          {cell.caption && (
            <span
              className="line-clamp-1 max-w-full text-[11px]"
              style={{ color: secondary }}
            >
              {cell.caption}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function SectionHeader({
  title,
  isDarkMode,
  size = 'lg'
}: {
  title: string
  isDarkMode: boolean
  size?: 'sm' | 'md' | 'lg'
}): JSX.Element {
  const sizeClasses = {
    sm: 'text-[15px] font-semibold tracking-[-0.01em]',
    md: 'text-[17px] font-bold tracking-[-0.02em]',
    lg: 'text-[20px] font-bold tracking-[-0.02em]'
  }
  return (
    <div className="flex items-center gap-2">
      <h3
        className={sizeClasses[size]}
        style={{ color: storeInk(isDarkMode) }}
      >
        {title}
      </h3>
    </div>
  )
}

function InfoRows({
  rows,
  isDarkMode
}: {
  rows: Array<{ label: string; value: string }>
  isDarkMode: boolean
}): JSX.Element {
  return (
    <div>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className="flex items-start justify-between gap-6 py-3"
          style={index > 0 ? { borderTop: `1px solid ${storeHairline(isDarkMode)}` } : undefined}
        >
          <span
            className="shrink-0 text-[13px]"
            style={{ color: storeSecondary(isDarkMode) }}
          >
            {row.label}
          </span>
          <span
            className="min-w-0 text-right text-[13px] leading-relaxed"
            style={{ color: storeInk(isDarkMode) }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function PreviewFrame({
  caption,
  isDarkMode,
  dark,
  children
}: {
  caption: string
  isDarkMode: boolean
  dark?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <figure className="min-w-0">
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={
          {
            height: PREVIEW_FRAME_HEIGHT,
            borderRadius: PREVIEW_FRAME_RADIUS,
            ['--ids-scene-radius' as string]: `${PREVIEW_FRAME_RADIUS}px`,
            background: dark ? '#111' : undefined,
            boxShadow: `0 0 0 1px ${previewScreenSilhouette(isDarkMode)}`
          } as CSSProperties
        }
      >
        {children}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: 'inherit',
            boxShadow: `inset 0 0 0 1px ${previewScreenEdge(isDarkMode)}`
          }}
        />
      </div>
      <figcaption
        className="mt-2 text-center text-[11px]"
        style={{ color: storeSecondary(isDarkMode) }}
      >
        {caption}
      </figcaption>
    </figure>
  )
}

export function ActionDetailModal({
  action,
  onClose,
  onToggleAction,
  isDarkMode: propIsDarkMode
}: ActionDetailModalProps): JSX.Element | null {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode
  const titleId = useId()

  useEffect(() => {
    if (!action) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [action, onClose])

  if (!action) return null

  const meta = getActionMeta(action.id)
  const copy = meta.copy.en

  const cells: InfoCell[] = [
    {
      label: 'STATUS',
      value: action.enabled ? 'On' : 'Off',
      caption: 'Agent'
    },
    {
      label: 'TYPE',
      value: <ZapIcon size={22} />,
      caption: meta.type
    },
    {
      label: 'DEVELOPER',
      value: <UserCircleIcon size={22} />,
      caption: meta.developer
    }
  ]

  const infoRows = [
    { label: 'Developer', value: meta.developer },
    { label: 'Type', value: meta.type },
    {
      label: 'Status',
      value: action.enabled ? 'On' : 'Off'
    },
    ...(action.id === 'insertText'
      ? [
          {
            label: 'Permissions',
            value: 'Screen Recording'
          }
        ]
      : [])
  ]

  const modalElement = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default"
        style={{
          backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.38)'
        }}
        onClick={onClose}
      />

      {/* Accessible Dialog Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[110] mx-4 flex max-h-[86vh] w-full flex-col overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxWidth: 620,
          backgroundColor: isDarkMode ? 'var(--dark-modal-background, #1c1c1e)' : '#fafafa',
          border: isDarkMode
            ? '1px solid var(--dark-modal-border, rgba(255, 255, 255, 0.1))'
            : '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '20px',
          boxShadow: isDarkMode
            ? 'var(--dark-modal-shadow, 0 25px 50px -12px rgba(0, 0, 0, 0.6))'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.9)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-5 top-5 z-20 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            isDarkMode
              ? 'bg-white/10 text-gray-300 hover:bg-white/15'
              : 'bg-black/5 text-gray-500 hover:bg-black/10'
          }`}
        >
          <CloseIcon size={16} />
        </button>

        {/* Scrollable Body */}
        <div className="scrollbar-transparent-track flex-1 overflow-y-auto px-9 pb-10 pt-8">
          <div className="space-y-7">
            {/* Header row */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <AppIcon size={88} glyph={action.glyph} isDarkMode={isDarkMode} />

              <div className="flex min-w-0 flex-1 flex-col sm:min-h-[88px]">
                <div className="flex items-start justify-between gap-4 pr-8">
                  <div className="min-w-0">
                    <h3
                      id={titleId}
                      className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em]"
                      style={{ color: storeInk(isDarkMode) }}
                    >
                      {action.title}
                    </h3>
                    <p
                      className="mt-1 text-[15px]"
                      style={{ color: storeSecondary(isDarkMode) }}
                    >
                      {action.description}
                    </p>
                  </div>

                  <div className="shrink-0 pt-2">
                    <AppleSwitch
                      checked={action.enabled}
                      disabled={!action.available}
                      label={action.title}
                      onToggle={() => onToggleAction?.(action.id, !action.enabled)}
                      isDarkMode={isDarkMode}
                      variant="green"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* InfoStrip */}
            <InfoStrip cells={cells} isDarkMode={isDarkMode} />

            {/* Notch Preview Carousel */}
            <section>
              <SectionHeader title="Preview" isDarkMode={isDarkMode} />
              <div className="scrollbar-transparent-track -ml-9 -mr-10 mt-3 flex gap-4 overflow-x-auto py-2 pl-9 pr-9">
                {/* Tile 1: Hero preview scene */}
                <div className="shrink-0" style={{ width: PREVIEW_TILE_WIDTH }}>
                  <PreviewFrame caption={copy.heroCaption} isDarkMode={isDarkMode}>
                    <div className="h-full w-full">
                      <NativeActionScene
                        id={action.id}
                        copy={copy}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  </PreviewFrame>
                </div>

                {/* Tile 2: Notch answer card */}
                <div className="shrink-0" style={{ width: PREVIEW_TILE_WIDTH }}>
                  <PreviewFrame
                    caption={copy.glanceCaption}
                    isDarkMode={isDarkMode}
                    dark={true}
                  >
                    <div className="w-[404px]">
                      <NotchAnswerText text={copy.answer} />
                    </div>
                  </PreviewFrame>
                </div>
              </div>
            </section>

            {/* About */}
            <section>
              <SectionHeader title="About" isDarkMode={isDarkMode} />
              <p
                className="mt-2 max-w-2xl text-[14px] leading-relaxed"
                style={{ color: storeInk(isDarkMode) }}
              >
                {copy.about}
              </p>
            </section>

            {/* Try saying */}
            <section>
              <SectionHeader title="Try saying" isDarkMode={isDarkMode} />
              <div className="mt-3 space-y-2">
                {copy.sampleCommands.map((command) => (
                  <p
                    key={command}
                    className="text-[13px]"
                    style={{ color: storeSecondary(isDarkMode) }}
                  >
                    “{command}”
                  </p>
                ))}
              </div>
            </section>

            {/* Information */}
            <section>
              <SectionHeader title="Information" isDarkMode={isDarkMode} />
              <div className="mt-1">
                <InfoRows rows={infoRows} isDarkMode={isDarkMode} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalElement, document.body)
  }

  return modalElement
}
