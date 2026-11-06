import { describe, expect, it } from 'vitest'
import { DictationSession, type DictationEvent } from './session'

describe('DictationSession', () => {
  it('runs the happy path from start to a successful paste', () => {
    const session = new DictationSession()
    const audio = new Uint8Array([1, 2, 3, 4])

    expect(session.state).toBe('idle')
    expect(session.dispatch({ type: 'start' })).toEqual([{ type: 'start-capture' }])
    expect(session.state).toBe('recording')

    expect(session.dispatch({ type: 'stop' })).toEqual([{ type: 'stop-capture' }])
    expect(session.state).toBe('transcribing')

    expect(
      session.dispatch({ type: 'audio-ready', audio, mimeType: 'audio/wav' })
    ).toEqual([{ type: 'transcribe', audio, mimeType: 'audio/wav' }])
    expect(session.state).toBe('transcribing')

    expect(session.dispatch({ type: 'transcript', text: 'Hello world' })).toEqual([
      { type: 'paste', text: 'Hello world' }
    ])
    expect(session.state).toBe('pasting')

    expect(session.dispatch({ type: 'paste-success' })).toEqual([])
    expect(session.state).toBe('idle')
  })

  it('cancels a recording and returns to idle', () => {
    const session = new DictationSession()

    session.dispatch({ type: 'start' })
    expect(session.dispatch({ type: 'cancel' })).toEqual([{ type: 'cancel-capture' }])
    expect(session.state).toBe('idle')

    expect(session.dispatch({ type: 'stop' })).toEqual([])
    expect(session.state).toBe('idle')
  })

  it('enters error when transcription fails', () => {
    const session = new DictationSession()

    session.dispatch({ type: 'start' })
    session.dispatch({ type: 'stop' })

    expect(session.dispatch({ type: 'failure', error: 'Transcription failed' })).toEqual([
      { type: 'notify-error', error: 'Transcription failed' }
    ])
    expect(session.state).toBe('error')
  })

  it('enters error when audio capture fails while recording', () => {
    const session = new DictationSession()

    session.dispatch({ type: 'start' })

    expect(session.dispatch({ type: 'failure', error: 'Microphone unavailable' })).toEqual([
      { type: 'notify-error', error: 'Microphone unavailable' }
    ])
    expect(session.state).toBe('error')
  })

  it('enters error when the paste fails', () => {
    const session = new DictationSession()

    session.dispatch({ type: 'start' })
    session.dispatch({ type: 'stop' })
    session.dispatch({ type: 'audio-ready', audio: new Uint8Array([1]), mimeType: 'audio/webm' })
    session.dispatch({ type: 'transcript', text: 'Hello' })

    expect(session.dispatch({ type: 'failure', error: 'Paste failed' })).toEqual([
      { type: 'notify-error', error: 'Paste failed' }
    ])
    expect(session.state).toBe('error')
  })

  it('recovers from error with reset', () => {
    const session = new DictationSession()

    session.dispatch({ type: 'start' })
    session.dispatch({ type: 'stop' })
    session.dispatch({ type: 'failure', error: 'Transcription failed' })

    expect(session.state).toBe('error')
    expect(session.dispatch({ type: 'reset' })).toEqual([{ type: 'reset' }])
    expect(session.state).toBe('idle')
  })

  it('ignores events that are invalid for the current state', () => {
    const session = new DictationSession()
    const audioReady: DictationEvent = {
      type: 'audio-ready',
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav'
    }

    const invalidWhileIdle: DictationEvent[] = [
      { type: 'stop' },
      { type: 'cancel' },
      audioReady,
      { type: 'transcript', text: 'Too early' },
      { type: 'paste-success' },
      { type: 'failure', error: 'Nothing is running' },
      { type: 'reset' }
    ]

    for (const event of invalidWhileIdle) {
      expect(session.dispatch(event)).toEqual([])
      expect(session.state).toBe('idle')
    }

    session.dispatch({ type: 'start' })
    expect(session.dispatch({ type: 'start' })).toEqual([])
    expect(session.dispatch(audioReady)).toEqual([])
    expect(session.dispatch({ type: 'transcript', text: 'Too early' })).toEqual([])
    expect(session.state).toBe('recording')

    session.dispatch({ type: 'stop' })
    expect(session.dispatch({ type: 'start' })).toEqual([])
    expect(session.dispatch({ type: 'stop' })).toEqual([])
    expect(session.dispatch({ type: 'cancel' })).toEqual([])
    expect(session.dispatch({ type: 'paste-success' })).toEqual([])
    expect(session.state).toBe('transcribing')

    session.dispatch({ type: 'transcript', text: 'Hello' })
    expect(session.dispatch(audioReady)).toEqual([])
    expect(session.dispatch({ type: 'transcript', text: 'Again' })).toEqual([])
    expect(session.state).toBe('pasting')

    session.dispatch({ type: 'paste-success' })
    expect(session.dispatch({ type: 'paste-success' })).toEqual([])
    expect(session.state).toBe('idle')
  })
})
