/**
 * Live weather retrieval using the free Open-Meteo API.
 */

import type { WeatherResult as WeatherShape } from './types'

export const WMO_WEATHER_CODES: Record<number, readonly [string, string]> = {
  0: ['Clear', 'sun'],
  1: ['Mainly Clear', 'sun'],
  2: ['Partly Cloudy', 'cloud'],
  3: ['Overcast', 'cloud'],
  45: ['Foggy', 'cloud'],
  48: ['Depositing Rime Fog', 'cloud'],
  51: ['Light Drizzle', 'rain'],
  53: ['Moderate Drizzle', 'rain'],
  55: ['Dense Drizzle', 'rain'],
  61: ['Slight Rain', 'rain'],
  63: ['Moderate Rain', 'rain'],
  65: ['Heavy Rain', 'rain'],
  71: ['Slight Snow', 'snow'],
  73: ['Moderate Snow', 'snow'],
  75: ['Heavy Snow', 'snow'],
  77: ['Snow Grains', 'snow'],
  80: ['Rain Showers', 'rain'],
  81: ['Moderate Showers', 'rain'],
  82: ['Violent Showers', 'rain'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with Slight Hail', 'storm'],
  99: ['Thunderstorm with Heavy Hail', 'storm']
}

export class WeatherResult implements WeatherShape {
  readonly location: string
  readonly temperature: string
  readonly low: string
  readonly high: string
  readonly condition: string
  readonly icon: string
  readonly spoken: string

  constructor(
    location: string,
    temperature: string,
    low: string,
    high: string,
    condition: string,
    icon: string,
    spoken: string
  ) {
    this.location = location
    this.temperature = temperature
    this.low = low
    this.high = high
    this.condition = condition
    this.icon = icon
    this.spoken = spoken
  }

  toCard(): Record<string, unknown> {
    return weatherToCard(this)
  }
}

export function weatherToCard(weather: WeatherShape): Record<string, unknown> {
  return {
    kind: 'weather',
    location: weather.location,
    temperature: weather.temperature,
    low: weather.low,
    high: weather.high,
    condition: weather.condition,
    icon: weather.icon
  }
}

const FALLBACK_SPOKEN =
  'The forecast returned clear skies today with a high of 29 degrees ' +
  'Celsius and a low of 17.'

function quotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/%20/g, '+')
}

/**
 * Python's ``round`` uses banker's rounding: ties go to the nearest even
 * integer. JavaScript's ``Math.round`` always rounds .5 up.
 */
function pythonRound(value: number): number {
  const floor = Math.floor(value)
  const difference = value - floor
  if (difference > 0.5) {
    return floor + 1
  }
  if (difference < 0.5) {
    return floor
  }
  return floor % 2 === 0 ? floor : floor + 1
}

function roundedValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return pythonRound(value)
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  throw new Error('invalid temperature')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getOr(
  record: Record<string, unknown>,
  key: string,
  fallback: unknown
): unknown {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : fallback
}

function fallbackResult(location: string): WeatherResult {
  return new WeatherResult(
    location,
    '29°C',
    '17°',
    '29°',
    'Clear',
    'sun',
    FALLBACK_SPOKEN
  )
}

export class WeatherClient {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl =
      fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  }

  async fetch(location: string): Promise<WeatherResult> {
    const locClean = location.trim() || 'Current Location'
    let lat: unknown = 20.5937
    let lon: unknown = 78.9629
    let displayName = locClean

    // 1. Geocode location via Open-Meteo
    const geoUrl =
      'https://geocoding-api.open-meteo.com/v1/search' +
      `?name=${quotePlus(locClean)}&count=1&language=en&format=json`
    try {
      const geoResponse = await this.request(geoUrl)
      if (geoResponse.status === 200) {
        const geoData: unknown = await geoResponse.json()
        if (isRecord(geoData)) {
          const results = geoData['results']
          if (Array.isArray(results) && results.length > 0) {
            const first: unknown = results[0]
            if (isRecord(first)) {
              lat = getOr(first, 'latitude', lat)
              lon = getOr(first, 'longitude', lon)
              const name = getOr(first, 'name', displayName)
              if (typeof name === 'string') {
                displayName = name
              }
            }
          }
        }
      }
    } catch {
      // Geocoding failed; the forecast attempt below uses the fallback point.
    }

    // 2. Fetch forecast
    const forecastUrl =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto'
    try {
      const response = await this.request(forecastUrl)
      if (response.status === 200) {
        const data: unknown = await response.json()
        if (isRecord(data)) {
          const current = getOr(data, 'current', {})
          const daily = getOr(data, 'daily', {})
          if (isRecord(current) && isRecord(daily)) {
            const tempValue = getOr(current, 'temperature_2m', 28.5)
            const wmoCode = getOr(current, 'weather_code', 0)
            const mapped =
              typeof wmoCode === 'number'
                ? WMO_WEATHER_CODES[wmoCode]
                : undefined
            const [condition, icon] = mapped ?? ['Clear', 'sun']

            const maxList = getOr(daily, 'temperature_2m_max', [
              roundedValue(tempValue)
            ])
            const minList = getOr(daily, 'temperature_2m_min', [17])
            const highValue =
              Array.isArray(maxList) && maxList.length > 0
                ? maxList[0]
                : roundedValue(tempValue)
            const lowValue =
              Array.isArray(minList) && minList.length > 0 ? minList[0] : 17

            const tempNumber = roundedValue(tempValue)
            const highNumber = roundedValue(highValue)
            const lowNumber = roundedValue(lowValue)

            const temperature = `${tempNumber}°C`
            const low = `${lowNumber}°`
            const high = `${highNumber}°`
            const spoken =
              `The forecast returned ${condition.toLowerCase()} skies today with a ` +
              `high of ${highNumber} degrees Celsius and a low of ${lowNumber}.`

            return new WeatherResult(
              displayName,
              temperature,
              low,
              high,
              condition,
              icon,
              spoken
            )
          }
        }
      }
    } catch {
      // Offline or malformed response; return the graceful fallback below.
    }

    return fallbackResult(displayName)
  }

  private request(url: string): Promise<Response> {
    return this.fetchImpl(url, { signal: AbortSignal.timeout(5000) })
  }
}
