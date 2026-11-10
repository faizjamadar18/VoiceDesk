import { useCallback, useEffect, useState, type FormEvent, type JSX } from 'react'
import type {
  AsrMode,
  KestrelRuntimeState,
  KestrelSettings,
  NotchActivity,
  NotchPhase
} from '../../shared/types'

type LogTone = 'info' | 'success' | 'error'

interface LogEntry {
  id: number
  at: number
  tone: LogTone
  title: string
  text: string
}

const MAX_LOG_ENTRIES = 8

const PHASE_TITLE: Record<NotchPhase, string> = {
  listening: 'Listening',
  processing: 'Transcribing',
  acting: 'Working',
  result: 'Done',
  error: 'Error'
}

function formatTime(at: number): string {
  const date = new Date(at)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')
}

function displayHotkey(hotkey: string): string {
  return hotkey.replaceAll('+', ' + ')
}

function truncate(text: string, limit = 110): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function toneForPhase(phase: NotchPhase): LogTone {
  if (phase === 'result') return 'success'
  if (phase === 'error') return 'error'
  return 'info'
}

function activityText(activity: NotchActivity): string {
  if (activity.phase === 'error') return activity.message ?? 'The turn failed.'
  if (activity.message) return activity.message
  if (activity.transcript) return truncate(activity.transcript)
  return 'Listening for your command…'
}

export default function App(): JSX.Element {
  const [runtime, setRuntime] = useState<KestrelRuntimeState | null>(null)
  const [hotkeyDraft, setHotkeyDraft] = useState('Control+Space')
  const [asrDraft, setAsrDraft] = useState<AsrMode>('nemo')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [bridgeError, setBridgeError] = useState<string | null>(null)

  const applySettings = useCallback((next: KestrelSettings): void => {
    setHotkeyDraft(next.hotkey)
    setAsrDraft(next.asrMode)
  }, [])

  const pushActivity = useCallback((activity: NotchActivity): void => {
    setEntries((current) =>
      [
        {
          id: activity.at + Math.random(),
          at: activity.at,
          tone: toneForPhase(activity.phase),
          title: PHASE_TITLE[activity.phase],
          text: activityText(activity)
        },
        ...current
      ].slice(0, MAX_LOG_ENTRIES)
    )
  }, [])

  useEffect(() => {
    const api = window.kestrel
    if (!api) {
      setBridgeError('The preload bridge is missing. Restart Kestrel from the desktop app.')
      return
    }

    let cancelled = false
    const offState = api.onState((state) => setRuntime(state))
    const offSettings = api.onSettingsChanged(applySettings)
    const offActivity = api.onNotchActivity(pushActivity)

    void api
      .getState()
      .then((state) => {
        if (cancelled) return
        setRuntime(state)
        applySettings(state.settings)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFormError(error instanceof Error ? error.message : 'Could not read app state.')
        }
      })

    return () => {
      cancelled = true
      offState()
      offSettings()
      offActivity()
    }
  }, [applySettings, pushActivity])

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormNotice(null)

    try {
      const result = await window.kestrel.saveSettings({
        hotkey: hotkeyDraft.trim(),
        asrMode: asrDraft
      })
      setRuntime(result.state)
      applySettings(result.settings)
      setFormNotice(
        result.state.hotkeyRegistered && result.state.hookRunning
          ? `Saved. ${displayHotkey(result.settings.hotkey)} is ready.`
          : 'Saved, but the shortcut still needs attention.'
      )
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleRetry = async (): Promise<void> => {
    setFormError(null)
    setFormNotice(null)
    try {
      const next = await window.kestrel.retryHotkey()
      setRuntime(next)
      const problem = next.hotkeyError ?? next.hookError
      if (problem) {
        setFormError(problem)
      } else {
        setFormNotice('Shortcut re-armed.')
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not retry the shortcut.')
    }
  }

  const ready = Boolean(
    runtime?.hotkeyRegistered && runtime.hookRunning && runtime.asrReady
  )
  const partial = Boolean(runtime?.hotkeyRegistered && runtime.hookRunning && !runtime.asrReady)
  const broken = Boolean(runtime && (!runtime.hotkeyRegistered || !runtime.hookRunning))
  const keys = runtime?.hotkeyLabel ?? ['Ctrl', 'Space']
  const cardClass = ready ? 'is-armed' : broken ? 'is-error' : partial ? 'is-warning' : ''
  const statusLabel = broken
    ? 'Shortcut needs attention'
    : partial
      ? 'Speech engine unavailable'
      : ready
        ? 'Ready for push-to-talk'
        : 'Starting…'

  const problemText = [runtime?.hotkeyError, runtime?.hookError, runtime?.asrError]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span className="brand-name">Kestrel</span>
        </div>
        <span className="spike-badge">notch · local voice</span>
      </header>

      <section className="hero">
        <h1>Hold to talk. Release to act.</h1>
        <p>
          Hold {displayHotkey(keys.join('+'))} and speak. A notch appears at the top of the
          screen with a live transcript; releasing sends the final words to Kestrel. Taps under
          0.3 seconds are ignored, and Esc cancels. The notch never takes focus.
        </p>
      </section>

      <section className={`hotkey-card ${cardClass}`}>
        <div className="card-head">
          <div className="status" role="status" aria-live="polite">
            <span className={`status-dot ${ready ? 'is-live' : ''}`} />
            <span>{statusLabel}</span>
          </div>
          <span className="count">
            {runtime?.triggerCount
              ? `${runtime.triggerCount} ${runtime.triggerCount === 1 ? 'turn' : 'turns'}`
              : 'No turns yet'}
          </span>
        </div>

        <div className="keys" aria-label={`Push-to-talk shortcut: ${keys.join(' plus ')}`}>
          {keys.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </div>

        {broken || problemText ? (
          <div className="error-row">
            <p className={`card-note ${broken ? '' : 'is-warning'}`}>
              {problemText ||
                'Windows did not reserve the shortcut. Choose another one below.'}
            </p>
            <button className="button button-small" type="button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        ) : (
          <p className="card-note">
            The shortcut is reserved globally while Kestrel runs, so the focused app never sees
            it. Releasing runs the command; a short tap does nothing.
          </p>
        )}

        <div className="card-foot">
          <span className={`focus-live ${runtime?.windowFocused ? 'is-focused' : ''}`}>
            <span className="mini-dot" />
            {runtime?.windowFocused ? 'This window is focused' : 'This window is hidden or behind'}
          </span>
          <span className={runtime?.asrReady ? 'result-ok' : 'result-fail'}>
            {runtime?.asrMode === 'fake'
              ? 'Fake ASR · test mode'
              : runtime?.asrReady
                ? 'NVIDIA Nemotron · local'
                : runtime?.asrError
                  ? 'ASR offline'
                  : 'Starting NVIDIA Nemotron…'}
          </span>
        </div>
      </section>

      <section className="settings-card">
        <div className="card-head">
          <span className="section-label">Settings</span>
          <span className="local-tag">saved on this PC</span>
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <label className="settings-field" htmlFor="hotkey-input">
            <span>Shortcut</span>
            <input
              id="hotkey-input"
              className="settings-input"
              type="text"
              value={hotkeyDraft}
              onChange={(event) => setHotkeyDraft(event.target.value)}
              placeholder="Control+Space"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <label className="settings-field" htmlFor="asr-select">
            <span>Speech engine</span>
            <select
              id="asr-select"
              className="settings-input settings-select"
              value={asrDraft}
              onChange={(event) => setAsrDraft(event.target.value as AsrMode)}
            >
              <option value="nemo">NVIDIA Nemotron · local &amp; free</option>
              <option value="fake">Fake transcript · smoke tests</option>
            </select>
          </label>

          <div className="settings-actions">
            <button className="button button-save" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <span className="settings-note">
              Use a modifier plus a key, e.g. Control+Space or Alt+F8. If Windows refuses it,
              pick another.
            </span>
          </div>
        </form>

        {formError && <p className="form-error">{formError}</p>}
        {formNotice && <p className="form-notice">{formNotice}</p>}
      </section>

      <section className="log-card">
        <div className="log-head">
          <span className="section-label">Notch activity</span>
          <span className="local-tag">audio never stored</span>
        </div>
        <ol className="log-list" aria-live="polite">
          {entries.length === 0 ? (
            <li className="empty">Hold the shortcut and speak to see a turn here.</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className={`log-entry is-${entry.tone}`}>
                <span className="log-time">{formatTime(entry.at)}</span>
                <span className="log-mark" aria-hidden="true">
                  {entry.tone === 'success' ? '✓' : entry.tone === 'error' ? '✕' : '•'}
                </span>
                <span className="log-text">
                  <strong className="log-title">{entry.title}</strong> {entry.text}
                </span>
              </li>
            ))
          )}
        </ol>
      </section>

      <footer className="footer">
        <p>
          Backend {runtime?.apiUrl ?? '—'} · v{runtime?.appVersion ?? '0.1.0'}
          {bridgeError ? ` · ${bridgeError}` : ''}
        </p>
        <div className="actions">
          <button className="button" type="button" onClick={() => window.kestrel.hideWindow()}>
            Hide to tray
          </button>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => window.kestrel.quitApp()}
          >
            Quit
          </button>
        </div>
      </footer>
    </main>
  )
}
