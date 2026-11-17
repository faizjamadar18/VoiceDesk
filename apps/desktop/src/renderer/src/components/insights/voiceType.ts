import { LADDER } from './insightsData'
import type { InsightsData, PercentileBand, VoiceTypeCardModel } from './types'

export interface VoiceTypeBand {
  band: PercentileBand | null
  index: number
  nextBand: PercentileBand | null
  toNextSessions: number | null
}

export const UNRANKED_VOICE_TYPE = 'Not ranked yet'

/** Highest ladder band the session total reaches, or null when still outside top 50%. */
export function bandForTotalSessions(totalSessions: number): PercentileBand | null {
  for (let index = LADDER.length - 1; index >= 0; index--) {
    if (totalSessions >= LADDER[index].minSessions) {
      return LADDER[index]
    }
  }
  return null
}

export function voiceTypeBand(data: InsightsData): VoiceTypeBand {
  const band = bandForTotalSessions(data.totalSessions)
  const index = band ? LADDER.indexOf(band) : -1
  const nextBand = LADDER[index + 1] ?? null
  const toNextSessions = nextBand ? Math.max(1, nextBand.minSessions - data.totalSessions) : null
  return { band, index, nextBand, toNextSessions }
}

/** Average sessions per active day, derived from the day map. */
export function dailyAverageSessions(data: InsightsData): number {
  let sessions = 0
  let activeDays = 0
  data.dayMap.forEach((day) => {
    if (day.sessions > 0) {
      sessions += day.sessions
      activeDays += 1
    }
  })
  return activeDays > 0 ? Math.round(sessions / activeDays) : 0
}

export function voiceTypeName(data: InsightsData): string {
  const band = bandForTotalSessions(data.totalSessions)
  return band ? `Top ${band.topPercent}%` : UNRANKED_VOICE_TYPE
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

export function buildVoiceTypeModel(data: InsightsData): VoiceTypeCardModel {
  return {
    brand: 'VoiceOS',
    kicker: 'YOUR VOICE TYPE',
    typeName: voiceTypeName(data),
    stats: [
      { label: 'Words dictated', value: data.totalWords.toLocaleString() },
      { label: 'Time saved', value: formatDuration(data.timeSavedSeconds) },
      { label: 'Agent tasks', value: data.agent.prompts.toLocaleString() }
    ]
  }
}
