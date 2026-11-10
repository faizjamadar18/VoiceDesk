import { useState } from 'react'
import type { JSX } from 'react'
import { Card } from './Card'
import { CheckIcon } from './icons'

export function SubscriptionSettingsTab({
  isDarkMode = true
}: {
  isDarkMode?: boolean
}): JSX.Element {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly')

  const freeFeatures = [
    '100 dictation / week',
    '25 agent / week',
    'AI Dictation',
    'Custom vocabulary'
  ]

  const proFeatures = [
    'Everything in Free',
    'Unlimited usage',
    'Prioritized customer support',
    'Priority feature access'
  ]

  const teamFeatures = [
    'Everything in Pro',
    'Shared keywords & knowledge',
    'Centralized billing',
    'Add seats anytime'
  ]

  return (
    <div className="voiceos-tab-content">
      {/* Interval Toggle */}
      <div className="flex items-center justify-center mb-6 relative">
        <div className="voiceos-segmented-track">
          <button
            type="button"
            onClick={() => setBillingInterval('monthly')}
            className={`voiceos-segmented-btn ${billingInterval === 'monthly' ? 'voiceos-segmented-btn--active' : ''}`}
          >
            <span>Monthly</span>
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval('yearly')}
            className={`voiceos-segmented-btn ${billingInterval === 'yearly' ? 'voiceos-segmented-btn--active' : ''}`}
          >
            <span className="flex items-center gap-1.5">
              <span>Yearly</span>
              <span className="voiceos-save-badge">Save 20%</span>
            </span>
          </button>
        </div>
      </div>

      {/* 3 Pricing Cards Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: Free */}
        <div className="relative">
          <Card isDarkMode={isDarkMode} className="p-4 flex flex-col h-full">
            <h3 className="text-base font-bold mb-4 text-gray-100">Free</h3>
            <div className="mb-1">
              <span className="text-2xl font-bold text-white">$0</span>
              <span className="text-xs ml-1 text-gray-500">/forever</span>
            </div>
            <p className="text-xs mb-4 text-gray-400">no credit card required</p>

            <span className="voiceos-plan-pill mb-4">Limited usage</span>

            <div className="space-y-2 mb-5 flex-1">
              {freeFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            <button type="button" className="voiceos-plan-btn voiceos-plan-btn--ghost">
              Downgrade
            </button>
          </Card>
        </div>

        {/* Card 2: Pro (Current active plan) */}
        <div className="relative">
          {/* Current plan badge */}
          <div className="voiceos-current-plan-badge">Current plan</div>

          <Card
            isDarkMode={isDarkMode}
            className="p-4 flex flex-col h-full voiceos-card--active-pro"
          >
            <h3 className="text-base font-bold mb-4 text-gray-100">Pro</h3>
            <div className="mb-1">
              <span className="text-2xl font-bold text-white">
                {billingInterval === 'yearly' ? '$16' : '$20'}
              </span>
              <span className="text-xs ml-1 text-gray-500">/month</span>
            </div>
            <p className="text-xs mb-4 text-gray-400">
              {billingInterval === 'yearly' ? 'billed annually' : 'billed monthly'}
            </p>

            <span className="voiceos-plan-pill voiceos-plan-pill--pro mb-4">
              Unlimited usage
            </span>

            <div className="space-y-2 mb-5 flex-1">
              {proFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-blue-400 flex-shrink-0" />
                  <span className="text-xs text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            <button type="button" className="voiceos-plan-btn voiceos-plan-btn--current">
              Current ({billingInterval === 'yearly' ? 'Yearly' : 'Monthly'})
            </button>
          </Card>
        </div>

        {/* Card 3: Team */}
        <div className="relative">
          <Card isDarkMode={isDarkMode} className="p-4 flex flex-col h-full">
            <h3 className="text-base font-bold mb-4 text-gray-100">Team</h3>
            <div className="mb-1">
              <span className="text-2xl font-bold text-white">
                {billingInterval === 'yearly' ? '$24' : '$30'}
              </span>
              <span className="text-xs ml-1 text-gray-500">/seat/month</span>
            </div>
            <p className="text-xs mb-4 text-gray-400">2 seats minimum</p>

            <span className="voiceos-plan-pill mb-4">Included in Team</span>

            <div className="space-y-2 mb-5 flex-1">
              {teamFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            <button type="button" className="voiceos-plan-btn voiceos-plan-btn--primary">
              Create Team
            </button>
          </Card>
        </div>
      </div>

      {/* Invoices & Cancel Cards */}
      <div className="mt-8 space-y-4">
        {/* Billing & Invoices */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div>
              <h3 className="voiceos-row-title">Billing & Invoices</h3>
              <p className="voiceos-row-desc">View invoices and payment</p>
            </div>
            <button type="button" className="voiceos-change-btn">
              Manage
            </button>
          </div>
        </Card>

        {/* Cancel Subscription */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div>
              <h3 className="voiceos-row-title">Cancel Subscription</h3>
              <p className="voiceos-row-desc">End your plan and billing</p>
            </div>
            <button type="button" className="voiceos-change-btn text-red-400 hover:text-red-300">
              Cancel
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}

