import type { JSX, ReactNode } from 'react'
import { AnimatedCheck } from './AnimatedCheck'

export interface PermissionCardProps {
  isGranted: boolean
  checkTrigger?: boolean
  grantedTitle: string
  pendingTitle: string
  grantedDescription: string
  pendingDescription: string
  children?: ReactNode
  isExpanded?: boolean
}

export function PermissionCard({
  isGranted,
  checkTrigger = true,
  grantedTitle,
  pendingTitle,
  grantedDescription,
  pendingDescription,
  children,
  isExpanded = true
}: PermissionCardProps): JSX.Element {
  const showContent = isExpanded || isGranted

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-xs"
      style={{
        transition: 'all 0.3s ease-in-out',
        gap: showContent ? '12px' : '0px'
      }}
    >
      {isGranted && (
        <div className="absolute top-4 right-4">
          <AnimatedCheck trigger={checkTrigger} color="#126ff6" />
        </div>
      )}
      <div className="flex items-center gap-2 pr-8">
        <div className="text-base font-normal text-gray-900">
          {isGranted ? grantedTitle : pendingTitle}
        </div>
      </div>
      <div
        style={{
          maxHeight: showContent ? '200px' : '0px',
          opacity: showContent ? 1 : 0,
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
          overflow: 'hidden'
        }}
      >
        <div className="text-sm text-gray-500">
          {isGranted ? grantedDescription : pendingDescription}
        </div>
        {children && !isGranted && (
          <div className="flex items-center justify-between mt-3 pb-1">
            <div className="flex items-center gap-2">{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}

