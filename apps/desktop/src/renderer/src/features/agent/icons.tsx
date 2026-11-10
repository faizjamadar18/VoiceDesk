import type { CSSProperties, JSX } from 'react'

export interface IconProps {
  className?: string
  width?: number | string
  height?: number | string
  size?: number | string
  style?: CSSProperties
}

export function PointerTrailIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M2.51 3.25a.564.564 0 0 1 .742-.742l18.24 7.41a.57.57 0 0 1-.072 1.08l-6.981 1.801a2.28 2.28 0 0 0-1.639 1.636l-1.8 6.984a.57.57 0 0 1-1.08.072z" />
    </svg>
  )
}

export function PromptDocumentIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M13.5 20.5H7a2.5 2.5 0 0 1-2.5-2.5V5A2.5 2.5 0 0 1 7 2.5h9A2.5 2.5 0 0 1 18.5 5v6" />
      <path d="M8.5 7h7M8.5 11h4.5" />
      <path
        d="M18 14.2l.86 2.24a1 1 0 0 0 .58.58l2.24.86-2.24.86a1 1 0 0 0-.58.58L18 21.56l-.86-2.24a1 1 0 0 0-.58-.58l-2.24-.86 2.24-.86a1 1 0 0 0 .58-.58z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

export function TextSelectionIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M4 5.8h16" />
      <g fill="currentColor" stroke="none" opacity="0.4">
        <rect x="3.2" y="9.1" width="17.6" height="5.6" rx="1.4" />
        <rect x="3.2" y="14.1" width="10.6" height="5.6" rx="1.4" />
      </g>
      <path d="M5.4 11.9h13.2M5.4 16.9h5.4" />
    </svg>
  )
}

export function ClockIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function MusicIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

export function AppLaunchIcon({
  className,
  width,
  height,
  size = 18,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M20 12.5V17a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4h4.5" />
      <path d="M15 3h6v6" />
      <path d="M21 3l-8.4 8.4" />
    </svg>
  )
}

export function UserRoundIcon({
  className,
  width,
  height,
  size = 20,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  )
}

export function LockIcon({
  className,
  width,
  height,
  size = 14,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function LockOpenIcon({
  className,
  width,
  height,
  size = 14,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

export function ChevronDownIcon({
  className,
  width,
  height,
  size = 14,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function CheckIcon({
  className,
  width,
  height,
  size = 16,
  style
}: IconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
