import type {
  KestrelApi,
  SpeechChunkPayload,
  SpeechStreamDonePayload,
  SpeechStreamErrorPayload
} from '../../shared/types'

declare global {
  interface Window {
    kestrel: KestrelApi
    api?: {
      synthesizeSpeech: (text: string) => Promise<Uint8Array | null>
      startSpeechStream: (requestId: string, text: string) => void
      cancelSpeechStream: (requestId: string) => void
      onSpeechChunk: (callback: (payload: SpeechChunkPayload) => void) => () => void
      onSpeechStreamDone: (callback: (payload: SpeechStreamDonePayload) => void) => () => void
      onSpeechStreamError: (callback: (payload: SpeechStreamErrorPayload) => void) => () => void
    }
  }
}

export {}
