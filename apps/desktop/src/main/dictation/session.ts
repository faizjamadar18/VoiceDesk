export type DictationState = 'idle' | 'recording' | 'transcribing' | 'pasting' | 'error'

export type DictationEvent =
  | { type: 'start' }
  | { type: 'cancel' }
  | { type: 'stop' }
  | { type: 'audio-ready'; audio: Uint8Array; mimeType: string }
  | { type: 'transcript'; text: string }
  | { type: 'paste-success' }
  | { type: 'failure'; error: string }
  | { type: 'reset' }

export type DictationCommand =
  | { type: 'start-capture' }
  | { type: 'cancel-capture' }
  | { type: 'stop-capture' }
  | { type: 'transcribe'; audio: Uint8Array; mimeType: string }
  | { type: 'paste'; text: string }
  | { type: 'notify-error'; error: string }
  | { type: 'reset' }

export class DictationSession {
  private currentState: DictationState = 'idle'

  get state(): DictationState {
    return this.currentState
  }

  dispatch(event: DictationEvent): DictationCommand[] {
    if (event.type === 'reset') {
      if (this.currentState === 'idle') return []
      this.currentState = 'idle'
      return [{ type: 'reset' }]
    }

    switch (this.currentState) {
      case 'idle':
        if (event.type === 'start') {
          this.currentState = 'recording'
          return [{ type: 'start-capture' }]
        }
        return []

      case 'recording':
        if (event.type === 'cancel') {
          this.currentState = 'idle'
          return [{ type: 'cancel-capture' }]
        }
        if (event.type === 'stop') {
          this.currentState = 'transcribing'
          return [{ type: 'stop-capture' }]
        }
        if (event.type === 'failure') {
          this.currentState = 'error'
          return [{ type: 'notify-error', error: event.error }]
        }
        return []

      case 'transcribing':
        if (event.type === 'audio-ready') {
          return [{ type: 'transcribe', audio: event.audio, mimeType: event.mimeType }]
        }
        if (event.type === 'transcript') {
          this.currentState = 'pasting'
          return [{ type: 'paste', text: event.text }]
        }
        if (event.type === 'failure') {
          this.currentState = 'error'
          return [{ type: 'notify-error', error: event.error }]
        }
        return []

      case 'pasting':
        if (event.type === 'paste-success') {
          this.currentState = 'idle'
        }
        if (event.type === 'failure') {
          this.currentState = 'error'
          return [{ type: 'notify-error', error: event.error }]
        }
        return []

      case 'error':
        return []
    }
  }
}
