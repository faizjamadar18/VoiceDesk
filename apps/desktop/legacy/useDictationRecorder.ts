import { useEffect, useRef } from 'react'

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

interface GestureCapture {
  cancelled: boolean
  stopRequested: boolean
}

function pickMimeType(): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

/**
 * Owns the microphone stream for the window's lifetime and creates one
 * MediaRecorder per hold gesture. Audio stays in memory and is discarded on a
 * tap-cancel. The stream is acquired at startup so a hold can start recording
 * immediately.
 */
export function useDictationRecorder(): void {
  const streamRef = useRef<MediaStream | null>(null)
  const streamPromiseRef = useRef<Promise<MediaStream> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const captureRef = useRef<GestureCapture | null>(null)

  useEffect(() => {
    const api = window.kestrel
    if (!api) return

    const acquireStream = (): Promise<MediaStream> => {
      const current = streamRef.current
      if (current && current.active) return Promise.resolve(current)
      if (current) {
        current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (streamPromiseRef.current) return streamPromiseRef.current

      const pending = navigator.mediaDevices
        .getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        })
        .then((stream) => {
          streamRef.current = stream
          streamPromiseRef.current = null
          return stream
        })
        .catch((error: unknown) => {
          streamPromiseRef.current = null
          throw error
        })

      streamPromiseRef.current = pending
      return pending
    }

    const errorText = (error: unknown): string =>
      error instanceof Error ? error.message : String(error)

    const sendError = (message: string): void => {
      api.sendDictationAudioError(message)
    }

    const discardRecorder = (): void => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // Already stopping; onstop will clean up.
        }
      }
      recorderRef.current = null
    }

    const start = async (): Promise<void> => {
      if (captureRef.current) captureRef.current.cancelled = true
      discardRecorder()

      const capture: GestureCapture = { cancelled: false, stopRequested: false }
      captureRef.current = capture

      try {
        const stream = await acquireStream()
        if (capture.cancelled) {
          captureRef.current = null
          return
        }

        const mimeType = pickMimeType()
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 32_000 })
        const chunks: Blob[] = []

        recorder.ondataavailable = (event: BlobEvent): void => {
          if (event.data.size > 0) chunks.push(event.data)
        }

        recorder.onerror = (event: Event): void => {
          const detail =
            'error' in event && event.error instanceof Error
              ? event.error.message
              : 'MediaRecorder failed.'
          sendError(detail)
        }

        recorder.onstop = (): void => {
          if (recorderRef.current === recorder) recorderRef.current = null
          if (captureRef.current === capture) captureRef.current = null

          if (capture.cancelled) {
            chunks.length = 0
            return
          }

          const type = recorder.mimeType || mimeType || 'audio/webm'
          const blob = new Blob(chunks, { type })
          chunks.length = 0

          if (blob.size === 0) {
            sendError('The microphone captured no audio.')
            return
          }

          void blob
            .arrayBuffer()
            .then((buffer) => api.sendDictationAudio(buffer, type))
            .catch((error: unknown) => sendError(errorText(error)))
        }

        recorderRef.current = recorder
        recorder.start()

        if (capture.stopRequested) recorder.stop()
      } catch (error) {
        if (captureRef.current === capture) captureRef.current = null
        if (!capture.cancelled) sendError(errorText(error))
      }
    }

    const stop = (): void => {
      const capture = captureRef.current
      if (capture) capture.stopRequested = true
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    }

    const cancel = (): void => {
      const capture = captureRef.current
      if (capture) capture.cancelled = true
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    }

    const offStart = api.onDictationStart(() => {
      void start()
    })
    const offStop = api.onDictationStop(stop)
    const offCancel = api.onDictationCancel(cancel)

    // Warm the microphone so the first hold is not delayed by getUserMedia.
    void acquireStream().catch(() => {
      // Retried on the next gesture; a real error is reported then.
    })

    api.notifyDictationReady()

    return () => {
      offStart()
      offStop()
      offCancel()
      cancel()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      streamPromiseRef.current = null
    }
  }, [])
}
