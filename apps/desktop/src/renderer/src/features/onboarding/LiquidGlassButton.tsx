import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

export interface LiquidGlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
  className?: string
}

export function LiquidGlassButton({
  children,
  className = '',
  disabled = false,
  type = 'button',
  style,
  ...props
}: LiquidGlassButtonProps): JSX.Element {
  return (
    <div className={`glassmorphic-button-rect-wrap ${className}`.trim()}>
      <div className="glassmorphic-button-rect-shadow" aria-hidden="true" />
      <button
        type={type}
        className="glassmorphic-button-rect"
        disabled={disabled}
        style={{
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          ...style
        }}
        {...props}
      >
        <span>{children}</span>
      </button>
    </div>
  )
}
