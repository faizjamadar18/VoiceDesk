import type { LiveTranscriber } from '../live-asr'
import { decodeWav } from '../pcm'
import type {
  TranscriptionClient,
  TranscriptionRequest,
  TranscriptionResult
} from './transcription'

export interface NemoTranscriptionClientOptions {
  /** Returns the shared local transcriber, or null while it is still starting. */
  getTranscriber: () => LiveTranscriber | null
  /** Reserved hook for a language override; the shared transcriber sets it at startup. */
  language?: string
}

/**
 * Dictation transcription backed by the already-running local NVIDIA Nemotron
 * transcriber, so hold-to-talk audio never leaves the machine.
 */
export class NemoTranscriptionClient implements TranscriptionClient {
  private readonly getTranscriber: () => LiveTranscriber | null

  constructor(options: NemoTranscriptionClientOptions) {
    this.getTranscriber = options.getTranscriber
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const transcriber = this.getTranscriber()
    if (!transcriber) {
      throw new Error('Local speech model is not ready yet.')
    }

    const { samples, sampleRate } = decodeWav(request.audio)
    const turn = transcriber.startTurn()

    try {
      turn.push(samples, sampleRate)
      const result = await turn.finish()
      return {
        text: result.text,
        latencyMs: result.latencyMs,
        provider: result.provider
      }
    } catch (error) {
      // Never leave a half-open socket behind when the turn fails or times out.
      turn.cancel()
      throw error
    }
  }
}