import type { ReactNode } from 'react'

export interface InsightCardProps {
  children: ReactNode
  className?: string
}

export function InsightCard({ children, className = '' }: InsightCardProps) {
  return (
    <div
      className={`p-5 rounded-[18px] backdrop-blur-sm ${className}`}
      style={{
        background: '#222327',
        border: '1px solid rgba(223, 226, 232, 0.06)',
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(239, 241, 245, 0.02)'
      }}
    >
      {children}
    </div>
  )
}
