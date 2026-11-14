import { useMemo, useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { Card } from '../../features/profile/Card'
import { toDayKey } from './mockData'
import type { InsightsData } from './types'

export interface StreakCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

interface TooltipState {
  x: number
  y: number
  title: string
  detail: string
}

const CELL_SIZE = 11
const CELL_GAP = 3
const WEEK_STRIDE = CELL_SIZE + CELL_GAP
const WEEKDAY_GUTTER = 16
const VISIBLE_WEEKS = 24

const DARK_RAMP = [
  'rgba(255, 255, 255, 0.05)',
  'rgba(10, 132, 255, 0.35)',
  'rgba(10, 132, 255, 0.55)',
  'rgba(10, 132, 255, 0.75)',
  '#0A84FF'
]

const LIGHT_RAMP = [
  'rgba(0, 0, 0, 0.05)',
  'rgba(0, 122, 255, 0.35)',
  'rgba(0, 122, 255, 0.55)',
  'rgba(0, 122, 255, 0.75)',
  '#007AFF'
]

function startOfHeatmapWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function StreakCard({ data, isDarkMode = true }: StreakCardProps): JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const ramp = isDarkMode ? DARK_RAMP : LIGHT_RAMP

  const { weeks, monthLabels, todayKey } = useMemo(() => {
    const today = new Date()
    const todayKeyStr = toDayKey(today)
    const currentWeekStart = startOfHeatmapWeek(today)
    const weeksList: Array<Array<{ dayKey: string; date: Date; isFuture: boolean }>> = []

    for (let w = VISIBLE_WEEKS - 1; w >= 0; w--) {
      const weekStart = new Date(currentWeekStart)
      weekStart.setDate(weekStart.getDate() - 7 * w)
      const column: Array<{ dayKey: string; date: Date; isFuture: boolean }> = []

      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(weekStart)
        cellDate.setDate(cellDate.getDate() + d)
        const dayKey = toDayKey(cellDate)
        column.push({
          dayKey,
          date: cellDate,
          isFuture: dayKey > todayKeyStr
        })
      }
      weeksList.push(column)
    }

    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })
    const monthLabelsList: Array<{ weekIndex: number; label: string }> = []
    let lastLabelIndex = -Infinity

    weeksList.forEach((column, weekIndex) => {
      const first = column[0].date
      const prevFirst = weeksList[weekIndex - 1]?.[0].date
      const isNewMonth = !prevFirst || prevFirst.getMonth() !== first.getMonth()
      if (isNewMonth && weekIndex - lastLabelIndex >= 3) {
        monthLabelsList.push({ weekIndex, label: monthFormatter.format(first) })
        lastLabelIndex = weekIndex
      }
    })

    return { weeks: weeksList, monthLabels: monthLabelsList, todayKey: todayKeyStr }
  }, [])

  const levelFor = (dayKey: string): number => {
    const day = data.dayMap.get(dayKey)
    if (!day || day.sessions === 0) return 0
    if (day.words > 500) return 4
    if (day.words > 300) return 3
    if (day.words > 100) return 2
    return 1
  }

  const handleCellEnter = (event: ReactMouseEvent<HTMLDivElement>, dayKey: string): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const day = data.dayMap.get(dayKey)
    const [y, m, d] = dayKey.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })

    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      title: dateFormatter.format(date),
      detail: day ? `${day.sessions} sessions · ${day.words.toLocaleString()} words` : 'No activity'
    })
  }

  return (
    <Card isDarkMode={isDarkMode} className="p-5 h-full relative">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3
          className={`text-[17px] font-semibold ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.02em' }}
        >
          {data.streak.current} day streak
        </h3>
        <span
          className={`text-[10px] font-semibold uppercase flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          style={{ letterSpacing: '0.06em' }}
        >
          LONGEST | {data.streak.longest} DAYS
        </span>
      </div>

      <div className="w-full overflow-x-auto" onMouseLeave={() => setTooltip(null)}>
        <div>
          {/* Month labels */}
          <div
            className="relative mb-1.5"
            style={{ height: 13, marginLeft: WEEKDAY_GUTTER }}
          >
            {monthLabels.map(({ weekIndex, label }) => (
              <span
                key={`${weekIndex}-${label}`}
                className={`absolute text-[10px] font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
                style={{ left: weekIndex * WEEK_STRIDE, top: 0 }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Grid with weekdays gutter */}
          <div className="flex">
            {/* Weekday labels */}
            <div
              className="flex flex-col"
              style={{ width: WEEKDAY_GUTTER, gap: CELL_GAP }}
            >
              {Array.from({ length: 7 }, (_, row) => (
                <div
                  key={row}
                  className={`text-[9px] leading-none flex items-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
                  style={{ height: CELL_SIZE }}
                >
                  {row === 1 ? 'M' : row === 3 ? 'W' : row === 5 ? 'F' : ''}
                </div>
              ))}
            </div>

            {/* Matrix of week columns */}
            <div className="flex" style={{ gap: CELL_GAP }}>
              {weeks.map((column) => (
                <div key={column[0].dayKey} className="flex flex-col" style={{ gap: CELL_GAP }}>
                  {column.map((cell) => {
                    if (cell.isFuture) {
                      return (
                        <div
                          key={cell.dayKey}
                          style={{ width: CELL_SIZE, height: CELL_SIZE }}
                        />
                      )
                    }

                    const level = levelFor(cell.dayKey)
                    const isToday = cell.dayKey === todayKey

                    return (
                      <div
                        key={cell.dayKey}
                        onMouseEnter={(e) => handleCellEnter(e, cell.dayKey)}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          borderRadius: 3,
                          backgroundColor: ramp[level],
                          boxShadow: isToday
                            ? isDarkMode
                              ? 'inset 0 0 0 1.5px rgba(255, 255, 255, 0.6)'
                              : 'inset 0 0 0 1.5px rgba(0, 0, 0, 0.4)'
                            : level === 0
                              ? isDarkMode
                                ? 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.03)'
                                : 'inset 0 0 0 0.5px rgba(0, 0, 0, 0.04)'
                              : undefined
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Less
          </span>
          {ramp.map((color, index) => (
            <div
              key={index}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2.5,
                backgroundColor: color
              }}
            />
          ))}
          <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            More
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2.5,
              boxShadow: isDarkMode
                ? 'inset 0 0 0 1.5px rgba(255, 255, 255, 0.6)'
                : 'inset 0 0 0 1.5px rgba(0, 0, 0, 0.4)'
            }}
          />
          <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Today
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full mb-2 rounded-lg px-2.5 py-1.5 shadow-xl text-center"
          style={{
            left: tooltip.x,
            top: tooltip.y - 6,
            backgroundColor: isDarkMode ? '#1F2024' : '#FFFFFF',
            border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
            color: isDarkMode ? '#F3F4F6' : '#111827'
          }}
        >
          <div className="text-[11px] font-semibold">{tooltip.title}</div>
          <div className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {tooltip.detail}
          </div>
        </div>
      )}
    </Card>
  )
}
