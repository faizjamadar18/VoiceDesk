import { useState, useRef, useEffect, type JSX } from 'react'
import type { NotchCalendarCard, NotchCalendarEvent } from '../../../shared/types'
import calendarIcon from '../assets/calendar.png'

export interface GoogleCalendarCardProps {
  card: NotchCalendarCard
  busy?: boolean
  onConfirm: (updated?: NotchCalendarCard) => void
  onDiscard: () => void
}

export const GCAL_DARK = {
  bg: '#202124',
  bgSecondary: '#292A2D',
  bgHover: '#35363A',
  text: '#E8EAED',
  textBright: '#FFFFFF',
  textMuted: '#9AA0A6',
  textDim: '#5F6368',
  border: 'rgba(232, 234, 237, 0.12)',
  borderLight: 'rgba(232, 234, 237, 0.08)',
  borderFocus: '#8AB4F8',
  blue: '#8AB4F8',
  blueSolid: '#4285F4',
  blueHover: '#AECBFA',
  eventDefault: '#039BE5'
} as const

export const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: '4 hours', value: 240 }
]

export const TIME_OPTIONS = (() => {
  const opts: Array<{ label: string; hour: number; minute: number }> = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const ampm = h < 12 ? 'AM' : 'PM'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      const minStr = m === 0 ? '00' : String(m)
      opts.push({ label: `${h12}:${minStr} ${ampm}`, hour: h, minute: m })
    }
  }
  return opts
})()

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

export interface ISOParts {
  date: string // YYYY-MM-DD
  hour: number
  minute: number
  tz: string
}

export function parseISOParts(iso?: string): ISOParts {
  if (!iso) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      hour: 19,
      minute: 0,
      tz: ''
    }
  }
  const match = iso.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/
  )
  if (match) {
    return {
      date: match[1],
      hour: parseInt(match[2], 10),
      minute: parseInt(match[3], 10),
      tz: match[4] || ''
    }
  }
  const d = new Date(iso)
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const tzMatch = iso.match(/(Z|[+-]\d{2}:?\d{2})$/)
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hour: d.getHours(),
      minute: d.getMinutes(),
      tz: tzMatch ? tzMatch[1] : ''
    }
  }
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    hour: 19,
    minute: 0,
    tz: ''
  }
}

export function buildISO(date: string, hour: number, minute: number, tz: string = ''): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date}T${pad(hour)}:${pad(minute)}:00${tz}`
}

export function computeEndISO(startISO: string, durationMin: number): string {
  const parts = parseISOParts(startISO)
  const totalMin = parts.hour * 60 + parts.minute + durationMin
  const endHour = Math.floor(totalMin / 60) % 24
  const endMin = totalMin % 60
  return buildISO(parts.date, endHour, endMin, parts.tz)
}

function CloseCrossIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M9 3L3 9M3 3l6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronDownIcon({
  open = false,
  size = 9
}: {
  open?: boolean
  size?: number
}): JSX.Element {
  return (
    <svg
      width={size}
      height={Math.round((size * 6) / 10)}
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.15s ease'
      }}
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CalendarIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"
        fill="currentColor"
      />
    </svg>
  )
}

function ClockIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
        fill="currentColor"
      />
    </svg>
  )
}

function ClockMetaIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" stroke={GCAL_DARK.textMuted} strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke={GCAL_DARK.textMuted}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LocationMetaIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"
        stroke={GCAL_DARK.textMuted}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke={GCAL_DARK.textMuted} strokeWidth="1.8" />
    </svg>
  )
}

export function formatEventDateTimeLine(
  startISO?: string,
  endISO?: string,
  durationMinutes?: number
): string {
  if (!startISO) return ''
  const startParts = parseISOParts(startISO)
  const [sy, sm, sd] = startParts.date.split('-').map(Number)
  if (!sy || !sm || !sd) return ''
  const startDate = new Date(sy, sm - 1, sd, startParts.hour, startParts.minute)
  if (isNaN(startDate.getTime())) return ''

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  const datePart = dateFmt.format(startDate)
  const startTime = timeFmt.format(startDate)

  let effectiveEndISO = endISO
  if (!effectiveEndISO && durationMinutes && durationMinutes > 0) {
    effectiveEndISO = computeEndISO(startISO, durationMinutes)
  }

  let endTime = ''
  if (effectiveEndISO) {
    const endParts = parseISOParts(effectiveEndISO)
    const [ey, em, ed] = endParts.date.split('-').map(Number)
    const endDate = new Date(ey, em - 1, ed, endParts.hour, endParts.minute)
    if (!isNaN(endDate.getTime())) {
      endTime = timeFmt.format(endDate)
    }
  }

  return endTime ? `${datePart} · ${startTime} \u2013 ${endTime}` : `${datePart} · ${startTime}`
}

interface MiniTimelineProps {
  startHour: number
  startMinute: number
  durationMinutes: number
  title: string
  existingEvents?: NotchCalendarEvent[]
}

function GCalMiniTimeline({
  startHour,
  startMinute,
  durationMinutes,
  title,
  existingEvents = []
}: MiniTimelineProps): JSX.Element {
  const TIMELINE_PADDING_HOURS = 2
  const focusStartHour = startHour + startMinute / 60
  const focusEndHour = focusStartHour + durationMinutes / 60

  let minHour = Math.max(0, Math.floor(focusStartHour) - TIMELINE_PADDING_HOURS)
  let maxHour = Math.min(24, Math.ceil(focusEndHour) + TIMELINE_PADDING_HOURS)

  // Expand if duration window is too narrow
  if (maxHour - minHour < 4) {
    minHour = Math.max(0, minHour - 1)
    maxHour = Math.min(24, maxHour + 1)
  }

  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i)
  const totalMinutes = (maxHour - minHour) * 60

  const startMin = Math.max(0, (focusStartHour - minHour) * 60)
  const durationMin = Math.max(15, durationMinutes)
  const topPct = (startMin / totalMinutes) * 100
  const heightPct = (durationMin / totalMinutes) * 100

  return (
    <div className="kestrel-gcal-timeline">
      {/* Time axis on the left */}
      <div className="kestrel-gcal-axis">
        {hours.map((h, i) => (
          <div
            key={h}
            className="kestrel-gcal-axis-hour"
            style={{ top: `${(i / hours.length) * 100}%` }}
          >
            {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
          </div>
        ))}
      </div>

      {/* Grid lines and scheduled event block */}
      <div className="kestrel-gcal-grid">
        {hours.map((h) => (
          <div
            key={h}
            className="kestrel-gcal-grid-line"
            style={{ top: `${((h - minHour) / (maxHour - minHour)) * 100}%` }}
          />
        ))}

        {/* Existing events if any */}
        {existingEvents.map((ev) => {
          const evParts = parseISOParts(ev.start)
          const evStartHour = evParts.hour + evParts.minute / 60
          const evEndParts = ev.end ? parseISOParts(ev.end) : null
          const evEndHour = evEndParts ? evEndParts.hour + evEndParts.minute / 60 : evStartHour + 1
          const evStartMin = Math.max(0, (evStartHour - minHour) * 60)
          const evDurationMin = Math.max(12, (evEndHour - evStartHour) * 60)
          const evTopPct = (evStartMin / totalMinutes) * 100
          const evHeightPct = (evDurationMin / totalMinutes) * 100
          const color = ev.backgroundColor || GCAL_DARK.eventDefault

          return (
            <div
              key={ev.id}
              className="kestrel-gcal-event-block is-existing"
              style={{
                top: `calc(${evTopPct}% + 1px)`,
                height: `calc(${evHeightPct}% - 2px)`,
                background: `${color}40`,
                borderLeftColor: color
              }}
              title={ev.summary}
            >
              <span className="kestrel-gcal-event-title">{ev.summary}</span>
            </div>
          )
        })}

        {/* Current scheduled new event */}
        <div
          className="kestrel-gcal-event-block is-new"
          style={{
            top: `calc(${topPct}% + 1px)`,
            height: `calc(${heightPct}% - 2px)`,
            background: GCAL_DARK.blueSolid,
            borderLeftColor: GCAL_DARK.blueSolid
          }}
          title={title || 'New event'}
        >
          <span className="kestrel-gcal-event-title">{title || 'New event'}</span>
        </div>
      </div>
    </div>
  )
}

export function GoogleCalendarScheduleCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: GoogleCalendarCardProps): JSX.Element {
  const [title, setTitle] = useState(card.title || 'Meeting')
  const [startISO, setStartISO] = useState(card.start)
  const [duration, setDuration] = useState(card.durationMinutes || 60)

  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false)
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false)
  const [isActionOverlayVisible, setIsActionOverlayVisible] = useState(false)
  const [saveHovered, setSaveHovered] = useState(false)

  const datePickerRef = useRef<HTMLDivElement>(null)
  const timeDropdownRef = useRef<HTMLDivElement>(null)
  const durationDropdownRef = useRef<HTMLDivElement>(null)

  const startParts = parseISOParts(startISO)
  const [dateYear, setDateYear] = useState(() => {
    const parts = parseISOParts(card.start)
    return parseInt(parts.date.slice(0, 4), 10)
  })
  const [dateMonth, setDateMonth] = useState(() => {
    const parts = parseISOParts(card.start)
    return parseInt(parts.date.slice(5, 7), 10)
  })

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (datePickerOpen && datePickerRef.current && !datePickerRef.current.contains(target)) {
        setDatePickerOpen(false)
      }
      if (timeDropdownOpen && timeDropdownRef.current && !timeDropdownRef.current.contains(target)) {
        setTimeDropdownOpen(false)
      }
      if (
        durationDropdownOpen &&
        durationDropdownRef.current &&
        !durationDropdownRef.current.contains(target)
      ) {
        setDurationDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [datePickerOpen, timeDropdownOpen, durationDropdownOpen])

  const handleDateChange = (newDate: string) => {
    const newStart = buildISO(newDate, startParts.hour, startParts.minute, startParts.tz)
    setStartISO(newStart)
    setDatePickerOpen(false)
  }

  const handleTimeSelect = (hour: number, minute: number) => {
    const newStart = buildISO(startParts.date, hour, minute, startParts.tz)
    setStartISO(newStart)
    setTimeDropdownOpen(false)
  }

  const handleDurationSelect = (mins: number) => {
    setDuration(mins)
    setDurationDropdownOpen(false)
  }

  const handleMonthChange = (delta: number) => {
    let m = dateMonth + delta
    let y = dateYear
    if (m < 1) {
      m = 12
      y--
    }
    if (m > 12) {
      m = 1
      y++
    }
    setDateMonth(m)
    setDateYear(y)
  }

  // Formatting strings
  const [currentY, currentM, currentD] = startParts.date
    .split('-')
    .map((s) => parseInt(s, 10))
  const dateDisplayLabel = `${MONTH_NAMES_SHORT[currentM - 1]} ${currentD}, ${currentY}`

  const ampm = startParts.hour < 12 ? 'AM' : 'PM'
  const h12 =
    startParts.hour === 0 ? 12 : startParts.hour > 12 ? startParts.hour - 12 : startParts.hour
  const minStr = String(startParts.minute).padStart(2, '0')
  const startTimeLabel = `${h12}:${minStr} ${ampm}`

  const durationMatch = DURATION_OPTIONS.find((o) => o.value === duration)
  const durationLabel = durationMatch
    ? durationMatch.label
    : duration >= 60
      ? `${Math.floor(duration / 60)}h ${duration % 60 ? `${duration % 60}m` : ''}`.trim()
      : `${duration} min`

  const accountEmail = card.account || 'faizj18.work@gmail.com'
  const actionLabel = card.mode === 'patch' ? 'Save' : 'Schedule'

  const handleSchedule = () => {
    if (busy) return
    const updatedCard: NotchCalendarCard = {
      ...card,
      title: title.trim() || 'Meeting',
      start: startISO,
      end: computeEndISO(startISO, duration),
      durationMinutes: duration
    }
    onConfirm(updatedCard)
  }

  // Month grid calculation
  const firstDayOfWeek = new Date(dateYear, dateMonth - 1, 1).getDay()
  const daysInMonth = new Date(dateYear, dateMonth, 0).getDate()

  return (
    <div
      className="kestrel-calendar-card"
      onMouseEnter={() => setIsActionOverlayVisible(true)}
      onMouseLeave={() => setIsActionOverlayVisible(false)}
    >
      {/* Header bar */}
      <div className="kestrel-calendar-head">
        <div className="kestrel-calendar-head-left">
          <img
            src={calendarIcon}
            alt="Google Calendar"
            width={18}
            height={18}
            className="kestrel-calendar-icon"
          />
          <div className="kestrel-calendar-account-btn">
            <span className="kestrel-calendar-account-dot" />
            <span className="kestrel-calendar-account-name">{accountEmail}</span>
            <span className="kestrel-calendar-chevron">
              <ChevronDownIcon size={8} />
            </span>
          </div>
        </div>
        <button
          type="button"
          className="kestrel-calendar-close-btn"
          aria-label="Cancel"
          disabled={busy}
          onClick={onDiscard}
        >
          <CloseCrossIcon size={11} />
        </button>
      </div>

      {/* Body: Split View (Left Form + Right Timeline) */}
      <div className="kestrel-calendar-body">
        {/* Left Form Column */}
        <div className="kestrel-calendar-form">
          <input
            type="text"
            className="kestrel-calendar-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            aria-label="Event title"
            spellCheck={false}
          />

          {/* Date Picker Row */}
          <div ref={datePickerRef} className="kestrel-calendar-field-row">
            <span className="kestrel-calendar-field-icon">
              <CalendarIcon />
            </span>
            <button
              type="button"
              className={`kestrel-calendar-picker-btn ${datePickerOpen ? 'is-active' : ''}`}
              onClick={() => {
                setDatePickerOpen(!datePickerOpen)
                setTimeDropdownOpen(false)
                setDurationDropdownOpen(false)
              }}
            >
              <span>{dateDisplayLabel}</span>
              <ChevronDownIcon open={datePickerOpen} size={8} />
            </button>

            {/* Month Calendar Grid Dropdown */}
            {datePickerOpen && (
              <div className="kestrel-calendar-month-picker" onMouseDown={(e) => e.stopPropagation()}>
                <div className="kestrel-calendar-month-header">
                  <button
                    type="button"
                    className="kestrel-calendar-month-nav"
                    onClick={() => handleMonthChange(-1)}
                  >
                    ‹
                  </button>
                  <span className="kestrel-calendar-month-title">
                    {MONTH_NAMES_SHORT[dateMonth - 1]} {dateYear}
                  </span>
                  <button
                    type="button"
                    className="kestrel-calendar-month-nav"
                    onClick={() => handleMonthChange(1)}
                  >
                    ›
                  </button>
                </div>

                <div className="kestrel-calendar-weekdays">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <span key={d} className="kestrel-calendar-weekday">
                      {d}
                    </span>
                  ))}
                </div>

                <div className="kestrel-calendar-days-grid">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <span key={`pad-${i}`} className="kestrel-calendar-day is-pad" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1
                    const isSelected =
                      day === currentD && dateMonth === currentM && dateYear === currentY
                    const padDay = String(day).padStart(2, '0')
                    const padMonth = String(dateMonth).padStart(2, '0')
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`kestrel-calendar-day-btn ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleDateChange(`${dateYear}-${padMonth}-${padDay}`)}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Time & Duration Row */}
          <div className="kestrel-calendar-field-row">
            <span className="kestrel-calendar-field-icon">
              <ClockIcon />
            </span>

            {/* Start Time Dropdown */}
            <div ref={timeDropdownRef} className="kestrel-calendar-dropdown-wrap">
              <button
                type="button"
                className={`kestrel-calendar-picker-btn ${timeDropdownOpen ? 'is-active' : ''}`}
                onClick={() => {
                  setTimeDropdownOpen(!timeDropdownOpen)
                  setDatePickerOpen(false)
                  setDurationDropdownOpen(false)
                }}
              >
                <span>{startTimeLabel}</span>
                <ChevronDownIcon open={timeDropdownOpen} size={8} />
              </button>

              {timeDropdownOpen && (
                <div
                  className="kestrel-calendar-dropdown-menu scrollbar-transparent-track"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {TIME_OPTIONS.map((opt) => {
                    const isSelected =
                      opt.hour === startParts.hour && opt.minute === startParts.minute
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        className={`kestrel-calendar-dropdown-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleTimeSelect(opt.hour, opt.minute)}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <span className="kestrel-calendar-for-label">for</span>

            {/* Duration Dropdown */}
            <div ref={durationDropdownRef} className="kestrel-calendar-dropdown-wrap">
              <button
                type="button"
                className={`kestrel-calendar-picker-btn ${durationDropdownOpen ? 'is-active' : ''}`}
                onClick={() => {
                  setDurationDropdownOpen(!durationDropdownOpen)
                  setDatePickerOpen(false)
                  setTimeDropdownOpen(false)
                }}
              >
                <span>{durationLabel}</span>
                <ChevronDownIcon open={durationDropdownOpen} size={8} />
              </button>

              {durationDropdownOpen && (
                <div
                  className="kestrel-calendar-dropdown-menu scrollbar-transparent-track"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {DURATION_OPTIONS.map((opt) => {
                    const isSelected = opt.value === duration
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        className={`kestrel-calendar-dropdown-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleDurationSelect(opt.value)}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Mini-Timeline Column */}
        <div className="kestrel-calendar-timeline-col">
          <GCalMiniTimeline
            startHour={startParts.hour}
            startMinute={startParts.minute}
            durationMinutes={duration}
            title={title}
            existingEvents={card.existingEvents}
          />
        </div>
      </div>

      {/* Floating Action Button Overlay */}
      <div
        className="kestrel-calendar-action-overlay"
        style={{
          opacity: isActionOverlayVisible ? 1 : 0,
          transform: isActionOverlayVisible ? 'translateY(0)' : 'translateY(4px)',
          pointerEvents: isActionOverlayVisible ? 'auto' : 'none'
        }}
      >
        <button
          type="button"
          className="kestrel-calendar-save-pill"
          disabled={busy || title.trim().length === 0}
          onClick={handleSchedule}
          onMouseEnter={() => setSaveHovered(true)}
          onMouseLeave={() => setSaveHovered(false)}
          style={{
            background: saveHovered ? GCAL_DARK.blueHover : GCAL_DARK.blue
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

export function GoogleCalendarDeleteCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: GoogleCalendarCardProps): JSX.Element {
  const [isActionOverlayVisible, setIsActionOverlayVisible] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)

  const eventColor = card.backgroundColor || GCAL_DARK.eventDefault
  const calendarName = card.calendarName || card.account || 'primary'
  const dateTimeLine = formatEventDateTimeLine(card.start, card.end, card.durationMinutes)

  return (
    <div
      className="kestrel-calendar-card kestrel-calendar-delete-card"
      onMouseEnter={() => setIsActionOverlayVisible(true)}
      onMouseLeave={() => setIsActionOverlayVisible(false)}
    >
      {/* Header bar */}
      <div className="kestrel-calendar-head">
        <div className="kestrel-calendar-head-left">
          <img
            src={calendarIcon}
            alt="Google Calendar"
            width={18}
            height={18}
            className="kestrel-calendar-icon"
          />
          <span className="kestrel-calendar-delete-header-title">Delete event</span>
        </div>
        <button
          type="button"
          className="kestrel-calendar-close-btn"
          aria-label="Cancel"
          disabled={busy}
          onClick={onDiscard}
        >
          <CloseCrossIcon size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="kestrel-calendar-delete-body">
        <div
          className="kestrel-calendar-delete-box"
          style={{
            background: `${eventColor}26`,
            borderLeft: `4px solid ${eventColor}`
          }}
        >
          <div className="kestrel-calendar-delete-title">{card.title || 'Meeting'}</div>

          {dateTimeLine ? (
            <div className="kestrel-calendar-delete-time-row">
              <ClockMetaIcon size={14} />
              <span>{dateTimeLine}</span>
            </div>
          ) : null}

          {card.location ? (
            <div className="kestrel-calendar-delete-loc-row">
              <LocationMetaIcon size={14} />
              <span>{card.location}</span>
            </div>
          ) : null}

          {calendarName ? (
            <div className="kestrel-calendar-delete-cal-row">
              <span
                className="kestrel-calendar-delete-cal-dot"
                style={{ background: eventColor }}
              />
              <span className="kestrel-calendar-delete-cal-name">{calendarName}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Floating Action Button Overlay */}
      <div
        className="kestrel-calendar-action-overlay"
        style={{
          opacity: isActionOverlayVisible ? 1 : 0,
          transform: isActionOverlayVisible ? 'translateY(0)' : 'translateY(4px)',
          pointerEvents: isActionOverlayVisible ? 'auto' : 'none'
        }}
      >
        <button
          type="button"
          className="kestrel-calendar-delete-pill"
          disabled={busy}
          onClick={() => {
            if (!busy) onConfirm(card)
          }}
          onMouseEnter={() => setDeleteHovered(true)}
          onMouseLeave={() => setDeleteHovered(false)}
          style={{
            background: busy
              ? 'rgba(234, 67, 53, 0.45)'
              : deleteHovered
                ? '#F06A5E'
                : '#EA4335'
          }}
        >
          Delete event
        </button>
      </div>
    </div>
  )
}

export function GoogleCalendarCard(props: GoogleCalendarCardProps): JSX.Element {
  if (props.card.mode === 'delete') {
    return <GoogleCalendarDeleteCard {...props} />
  }
  return <GoogleCalendarScheduleCard {...props} />
}
