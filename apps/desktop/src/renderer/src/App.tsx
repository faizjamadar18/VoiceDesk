import { useCallback, useEffect, useRef, useState } from 'react'
import { HOTKEY_LABEL, type KestrelRuntimeState, type SummonResult } from '../../shared/types'

type LogTone = 'info' | 'success' | 'error'

interface LogEntry {
  id: number
  at: number
  tone: LogTone
  text: string
}

const MAX_LOG_ENTRIES = 6

function formatTime(at: number): string {
  const date = new Date(at)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')
}

function displayHotkey(hotkey: string): string {
  return hotkey.replaceAll('+', ' + ')
}

export default function App(): React.JSX.Element {
  const [runtime, setRuntime] = useState<KestrelRuntimeState | null>(null)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [lastFocus, setLastFocus] = useState<SummonResult | null>(null)
  const [typed, setTyped] = useState('')
  const nextEntryId = useRef(1)
  const inputRef = useRef<HTMLInputElement>(null)

  const pushLog = useCallback((text: string, tone: LogTone, at = Date.now()): void => {
    setEntries((current) =>
      [{ id: nextEntryId.current++, at, tone, text }, ...current].slice(0, MAX_LOG_ENTRIES)
    )
  }, [])

  useEffect(() => {
    if (!window.kestrel) {
      pushLog('Preload bridge is missing. The window cannot talk to the app.', 'error')
      return
    }

    const offState = window.kestrel.onState((state) => setRuntime(state))

    const offSummon = window.kestrel.onSummon((event) => {
      pushLog(`Hotkey received from Windows (#${event.count})`, 'info', event.at)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 80)
    })

    const offSummonResult = window.kestrel.onSummonResult((result) => {
      setLastFocus(result)
      pushLog(
        result.focused
          ? `Focus verified ${result.verifiedAfterMs} ms after the hotkey`
          : `Focus was not confirmed after ${result.verifiedAfterMs} ms`,
        result.focused ? 'success' : 'error',
        result.at
      )
    })

    let cancelled = false
    void window.kestrel
      .getState()
      .then((state) => {
        if (cancelled) return
        setRuntime(state)
        if (state.hotkeyRegistered) {
          pushLog(`Hotkey armed — ${displayHotkey(state.hotkey)}`, 'success')
        } else {
          pushLog(state.hotkeyError ?? 'Hotkey registration failed.', 'error')
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        pushLog(error instanceof Error ? error.message : 'Could not read app state.', 'error')
      })

    return () => {
      cancelled = true
      offState()
      offSummon()
      offSummonResult()
    }
  }, [pushLog])

  useEffect(() => {
    const focusInput = (): void => inputRef.current?.focus()
    window.addEventListener('focus', focusInput)
    focusInput()
    return () => window.removeEventListener('focus', focusInput)
  }, [])

  const handleRetry = async (): Promise<void> => {
    const next = await window.kestrel.retryHotkey()
    setRuntime(next)
    if (next.hotkeyRegistered) {
      pushLog(`Hotkey re-armed — ${displayHotkey(next.hotkey)}`, 'success')
    } else {
      pushLog(next.hotkeyError ?? 'Hotkey is still unavailable.', 'error')
    }
  }

  const handleHide = (): void => {
    pushLog('Hidden to tray. Press the hotkey to summon Kestrel.', 'info')
    window.kestrel.hideWindow()
  }

  const handleQuit = (): void => {
    window.kestrel.quitApp()
  }

  const armed = runtime?.hotkeyRegistered ?? false
  const keys = runtime?.hotkeyLabel ?? HOTKEY_LABEL
  const summonCount = runtime?.triggerCount ?? 0

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span className="brand-name">Kestrel</span>
        </div>
        <span className="spike-badge">Day 1 spike</span>
      </header>

      <section className="hero">
        <h1>Summon it from anywhere.</h1>
        <p>
          No mic. No backend. This build proves one risky thing: the global hotkey works and the
          window takes keyboard focus.
        </p>
      </section>

      <section className={`hotkey-card ${armed ? 'is-armed' : 'is-error'}`}>
        <div className="card-head">
          <div className="status" role="status" aria-live="polite">
            <span className={`status-dot ${armed ? 'is-live' : ''}`} />
            <span>{armed ? 'Hotkey active' : 'Hotkey unavailable'}</span>
          </div>
          <span className="count">
            {summonCount === 0
              ? 'No summons yet'
              : `${summonCount} ${summonCount === 1 ? 'summon' : 'summons'}`}
          </span>
        </div>

        <div className="keys" aria-label={`Global hotkey: ${keys.join(' plus ')}`}>
          {keys.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </div>

        {armed ? (
          <p className="card-note">
            Press it from any app. Kestrel should come to the front with the caret in the field
            below.
          </p>
        ) : (
          <div className="error-row">
            <p className="card-note">
              {runtime?.hotkeyError ?? 'The shortcut could not be registered.'}
            </p>
            <button className="button button-small" type="button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}

        <div className="card-foot">
          <span className={`focus-live ${runtime?.windowFocused ? 'is-focused' : ''}`}>
            <span className="mini-dot" />
            {runtime?.windowFocused ? 'Window focused' : 'Window in background'}
          </span>
          {lastFocus && (
            <span className={lastFocus.focused ? 'result-ok' : 'result-fail'}>
              {lastFocus.focused
                ? `Focus verified · ${lastFocus.verifiedAfterMs} ms`
                : 'Focus not confirmed'}
            </span>
          )}
        </div>
      </section>

      <section className="field-card">
        <label className="field-label" htmlFor="focus-test">
          Focus check
          <span>Type anything — these keystrokes should land here.</span>
        </label>
        <input
          id="focus-test"
          ref={inputRef}
          className="focus-input"
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="The caret should be here."
          autoComplete="off"
          spellCheck={false}
        />
      </section>

      <section className="log-card">
        <div className="log-head">
          <span className="section-label">Proof log</span>
          <span className="local-tag">local only</span>
        </div>
        <ol className="log-list" aria-live="polite">
          {entries.length === 0 ? (
            <li className="empty">Waiting for the first hotkey press.</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className={`log-entry is-${entry.tone}`}>
                <span className="log-time">{formatTime(entry.at)}</span>
                <span className="log-mark" aria-hidden="true">
                  {entry.tone === 'success' ? '✓' : entry.tone === 'error' ? '✕' : '•'}
                </span>
                <span className="log-text">{entry.text}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <footer className="footer">
        <p>Closing this window keeps Kestrel in the tray. v{runtime?.appVersion ?? '0.1.0'}</p>
        <div className="actions">
          <button className="button" type="button" onClick={handleHide}>
            Hide to tray
          </button>
          <button className="button button-ghost" type="button" onClick={handleQuit}>
            Quit
          </button>
        </div>
      </footer>
    </main>
  )
}
