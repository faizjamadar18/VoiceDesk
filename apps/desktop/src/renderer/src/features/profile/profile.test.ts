import { describe, expect, it } from 'vitest'
import {
  HELP_CENTER_ITEMS,
  INITIAL_USER_PROFILE,
  SETTINGS_TABS,
  SHORTCUTS_DATA
} from './dummy-data'

describe('Profile & Settings Configuration', () => {
  it('defines the five VoiceOS settings tabs in exact order', () => {
    expect(SETTINGS_TABS).toHaveLength(5)
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual([
      'general',
      'appearance',
      'subscription',
      'account',
      'team'
    ])
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual([
      'General',
      'Appearance',
      'Subscription',
      'Account',
      'Team'
    ])
  })

  it('defines all four shortcuts matching VoiceOS specification and Image 2', () => {
    expect(SHORTCUTS_DATA).toHaveLength(4)

    const [agentMode, dictationMode, handsFreeDictation, handsFreeAgent] = SHORTCUTS_DATA

    // Agent Mode
    expect(agentMode.id).toBe('agent-mode')
    expect(agentMode.title).toBe('Agent Mode')
    expect(agentMode.description).toBe('Ask AI to do things in Slack, Gmail, and more')
    expect(agentMode.keys?.map((k) => k.main)).toEqual(['Alt', 'Ctrl'])
    expect(agentMode.changeable).toBe(true)

    // Dictation Mode
    expect(dictationMode.id).toBe('dictation-mode')
    expect(dictationMode.title).toBe('Dictation Mode')
    expect(dictationMode.description).toBe('Hold to dictate')
    expect(dictationMode.keys?.map((k) => k.main)).toEqual(['Ctrl', '⇧'])
    expect(dictationMode.changeable).toBe(true)

    // Hands-Free Dictation
    expect(handsFreeDictation.id).toBe('hands-free-dictation')
    expect(handsFreeDictation.title).toBe('Hands-Free Dictation')
    expect(handsFreeDictation.description).toBe(
      'Use either option to start and stop without holding a key'
    )
    expect(handsFreeDictation.hasDoubleTap).toBe(true)
    expect(handsFreeDictation.doubleTapSubtitle).toBe('Uses your Dictation shortcut')
    expect(handsFreeDictation.doubleTapKeys?.map((k) => k.main)).toEqual(['Ctrl', '⇧'])
    expect(handsFreeDictation.doubleTapEnabled).toBe(false)
    expect(handsFreeDictation.hasPressOnce).toBe(true)
    expect(handsFreeDictation.pressOnceKeys?.map((k) => k.main)).toEqual(['Ctrl', '⇧', 'space'])

    // Hands-Free Agent
    expect(handsFreeAgent.id).toBe('hands-free-agent')
    expect(handsFreeAgent.title).toBe('Hands-Free Agent')
    expect(handsFreeAgent.description).toBe(
      'Double-tap your Agent shortcut to speak without holding a key'
    )
    expect(handsFreeAgent.hasDoubleTap).toBe(true)
    expect(handsFreeAgent.doubleTapSubtitle).toBe('Uses your Agent shortcut')
    expect(handsFreeAgent.doubleTapKeys?.map((k) => k.main)).toEqual(['Alt', 'Ctrl'])
    expect(handsFreeAgent.doubleTapEnabled).toBe(false)
  })

  it('defines the Help Center channels matching VoiceOS specification and Image 3', () => {
    expect(HELP_CENTER_ITEMS).toHaveLength(4)

    const [liveChat, discord, twitter, email] = HELP_CENTER_ITEMS

    expect(liveChat.id).toBe('live-chat')
    expect(liveChat.title).toBe('Live Chat')
    expect(liveChat.description).toBe('Chat with our support team')
    expect(liveChat.actionType).toBe('live_chat')

    expect(discord.id).toBe('discord')
    expect(discord.title).toBe('Discord Community')
    expect(discord.description).toBe('Join our community for help and updates')
    expect(discord.actionType).toBe('discord')
    expect(discord.url).toBe('https://discord.gg/voiceos')

    expect(twitter.id).toBe('twitter')
    expect(twitter.title).toBe('Follow on X')
    expect(twitter.description).toBe('Get the latest news from the founder')
    expect(twitter.actionType).toBe('twitter')
    expect(twitter.url).toBe('https://x.com/kai_brokering')

    expect(email.id).toBe('email')
    expect(email.title).toBe('Email Support')
    expect(email.description).toBe('support@voiceos.com')
    expect(email.actionType).toBe('email')
    expect(email.email).toBe('support@voiceos.com')
  })

  it('defines user profile with initial Faiz data', () => {
    expect(INITIAL_USER_PROFILE.firstName).toBe('Faiz')
    expect(INITIAL_USER_PROFILE.email).toBe('faiz@voiceos.com')
    expect(INITIAL_USER_PROFILE.avatarInitial).toBe('F')
  })
})

