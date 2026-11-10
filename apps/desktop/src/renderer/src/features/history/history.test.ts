import { describe, expect, it } from 'vitest'
import {
  DUMMY_HISTORY_SESSIONS,
  VoiceOSMode
} from './HistoryPage'

describe('History Feature & VoiceOS Mode Contract', () => {
  it('defines the four core VoiceOS modes with exact numeric values', () => {
    expect(VoiceOSMode.DICTATE).toBe(0)
    expect(VoiceOSMode.EDIT).toBe(1)
    expect(VoiceOSMode.WRITE).toBe(2)
    expect(VoiceOSMode.AGENT).toBe(3)
  })

  it('contains expected dummy history sessions including a recoverable failure', () => {
    expect(DUMMY_HISTORY_SESSIONS.length).toBeGreaterThan(0)

    const failureSession = DUMMY_HISTORY_SESSIONS.find((s) =>
      s.transcript?.includes('Audio saved for retranscription')
    )
    expect(failureSession).toBeDefined()
    expect(failureSession?.mode).toBe(VoiceOSMode.DICTATE)
    expect(failureSession?.audio_file_path).toBeDefined()
  })

  it('contains sessions with transcript and app_name', () => {
    for (const session of DUMMY_HISTORY_SESSIONS) {
      expect(session.id).toBeDefined()
      expect(session.app_name).toBe('VoiceOS')
      expect(session.transcript).toBeDefined()
      expect(typeof session.created_at).toBe('string')
    }
  })
})

