import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

export const dashboardButtonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm cursor-pointer',
  {
    variants: {
      variant: {
        primary: '',
        secondary: '',
        ghost: '',
        destructive: '',
        gradient: ''
      },
      size: {
        sm: 'px-2.5 py-1.5 text-xs',
        default: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-sm'
      }
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default'
    }
  }
)

const SIDEBAR_GLASS_BASE_CLASSES =
  'liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine'

export interface DashboardButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dashboardButtonVariants> {
  isDarkMode?: boolean
}

export const DashboardButton = React.forwardRef<HTMLButtonElement, DashboardButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size,
      isDarkMode = true,
      style,
      children,
      onMouseMove,
      ...props
    },
    ref
  ) => {
    const buttonRef = React.useRef<HTMLButtonElement | null>(null)
    const usesSidebarHover = variant === 'secondary'

    const setRefs = React.useCallback(
      (node: HTMLButtonElement | null) => {
        buttonRef.current = node
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref]
    )

    const handleMouseMove = (event: React.MouseEvent<HTMLButtonElement>): void => {
      if (usesSidebarHover && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * 100
        const y = ((event.clientY - rect.top) / rect.height) * 100
        buttonRef.current.style.setProperty('--mouse-x', `${x}%`)
        buttonRef.current.style.setProperty('--mouse-y', `${y}%`)
      }
      onMouseMove?.(event)
    }

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: isDarkMode ? '#f3f6fa' : '#0a0a0a',
            color: isDarkMode ? '#0c1118' : '#ffffff',
            border: isDarkMode ? '1px solid #f3f6fa' : '1px solid #0a0a0a'
          }
        case 'secondary':
          return {}
        case 'ghost':
          return {}
        case 'destructive':
          return {
            border: isDarkMode
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid rgba(239, 68, 68, 0.2)'
          }
        case 'gradient':
          return {
            background: 'linear-gradient(135deg, #0EA5E9 0%, #0034f7 100%)',
            backgroundSize: '200% 200%',
            animation: 'gradientShift 3s ease infinite',
            color: 'white',
            boxShadow:
              '0 0 12px rgba(12, 140, 233, 0.4), 0 0 24px rgba(12, 140, 233, 0.2), 0 4px 10px rgba(30, 30, 30, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }
        default:
          return {}
      }
    }

    const getVariantClasses = (): string => {
      switch (variant) {
        case 'primary':
          return isDarkMode ? 'hover:bg-gray-200 font-semibold' : 'hover:bg-gray-800 font-semibold'
        case 'secondary':
          return isDarkMode
            ? `${SIDEBAR_GLASS_BASE_CLASSES} liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark text-white/90 hover:text-white`
            : `${SIDEBAR_GLASS_BASE_CLASSES} liquid-glass-sidebar-tab--light liquid-glass-sidebar-tab--cursor-shine--light text-black/80 hover:text-black/90`
        case 'ghost':
          return isDarkMode
            ? 'backdrop-blur-none text-gray-300 border border-white/[0.03] bg-clip-padding bg-gradient-to-b from-white/[0.05] to-white/[0.01] hover:text-gray-200 hover:border-white/[0.06]'
            : 'backdrop-blur-none text-gray-600 border border-black/[0.03] bg-clip-padding bg-gradient-to-b from-white to-black/[0.015] hover:text-gray-800 hover:border-black/[0.06]'
        case 'destructive':
          return isDarkMode
            ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
            : 'text-red-600 bg-red-50 hover:bg-red-100'
        case 'gradient':
          return 'font-bold hover:scale-[1.02] overflow-hidden'
        default:
          return ''
      }
    }

    const content = usesSidebarHover ? (
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    ) : (
      children
    )

    if (variant === 'gradient') {
      return (
        <button
          ref={setRefs}
          className={cn(
            dashboardButtonVariants({ variant, size }),
            getVariantClasses(),
            'group/btn relative',
            className
          )}
          onMouseMove={handleMouseMove}
          style={{
            ...getVariantStyles(),
            ...style
          }}
          {...props}
        >
          <div
            className="absolute inset-0 opacity-50 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
              transform: 'translateX(-100%)',
              animation: 'shimmer 2s infinite'
            }}
          />
          <span
            className="relative z-10"
            style={{
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.02em'
            }}
          >
            {children}
          </span>
          <div
            className="absolute inset-0 rounded-lg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at center, rgba(255, 255, 255, 0.2), transparent 70%)'
            }}
          />
        </button>
      )
    }

    return (
      <button
        ref={setRefs}
        className={cn(
          dashboardButtonVariants({ variant, size }),
          getVariantClasses(),
          className
        )}
        onMouseMove={handleMouseMove}
        style={{
          ...getVariantStyles(),
          ...style
        }}
        {...props}
      >
        {content}
      </button>
    )
  }
)

DashboardButton.displayName = 'DashboardButton'
