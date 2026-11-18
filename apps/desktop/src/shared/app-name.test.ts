import { describe, expect, it } from 'vitest'
import { displayAppName } from './app-name'

describe('displayAppName', () => {
  it('falls back to VoiceDesk for a missing or blank name', () => {
    expect(displayAppName()).toBe('VoiceDesk')
    expect(displayAppName(null)).toBe('VoiceDesk')
    expect(displayAppName('')).toBe('VoiceDesk')
    expect(displayAppName('   ')).toBe('VoiceDesk')
  })

  it('shows legacy product names as VoiceDesk', () => {
    expect(displayAppName('VoiceOS')).toBe('VoiceDesk')
    expect(displayAppName('voiceos')).toBe('VoiceDesk')
    expect(displayAppName('Voice OS')).toBe('VoiceDesk')
    expect(displayAppName('  VOICE OS  ')).toBe('VoiceDesk')
    expect(displayAppName('Kestrel')).toBe('VoiceDesk')
    expect(displayAppName('kestrel')).toBe('VoiceDesk')
    expect(displayAppName('  KESTREL  ')).toBe('VoiceDesk')
  })

  it('returns any other name trimmed and unchanged', () => {
    expect(displayAppName('Slack')).toBe('Slack')
    expect(displayAppName('  Google Calendar  ')).toBe('Google Calendar')
    expect(displayAppName('VoiceDesk')).toBe('VoiceDesk')
  })
})
