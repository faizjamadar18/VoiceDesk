import { describe, expect, it } from 'vitest'
import { WMO_WEATHER_CODES, WeatherClient, WeatherResult } from './weather'

type Handler = (url: string) => Response | Promise<Response>

function fetchStub(handler: Handler): typeof fetch {
  return (async (input: unknown) => handler(String(input))) as unknown as typeof fetch
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function forecastBody(
  temperature: number,
  code: number,
  high: number[],
  low: number[]
): Record<string, unknown> {
  return {
    current: { temperature_2m: temperature, weather_code: code },
    daily: { temperature_2m_max: high, temperature_2m_min: low }
  }
}

describe('WeatherClient', () => {
  it('fetches and formats successful weather', async () => {
    const urls: string[] = []
    const client = new WeatherClient(
      fetchStub((url) => {
        urls.push(url)
        if (url.startsWith('https://geocoding-api.open-meteo.com')) {
          return jsonResponse({
            results: [{ latitude: 51.5, longitude: -0.12, name: 'London' }]
          })
        }
        return jsonResponse(forecastBody(20.4, 61, [23.6], [12.2]))
      })
    )

    const result = await client.fetch('London')

    expect(result.location).toBe('London')
    expect(result.temperature).toBe('20\u00b0C')
    expect(result.low).toBe('12\u00b0')
    expect(result.high).toBe('24\u00b0')
    expect(result.condition).toBe('Slight Rain')
    expect(result.icon).toBe('rain')
    expect(result.spoken).toBe(
      'The forecast returned slight rain skies today with a high of 24 ' +
        'degrees Celsius and a low of 12.'
    )
    expect(urls[0]).toBe(
      'https://geocoding-api.open-meteo.com/v1/search' +
        '?name=London&count=1&language=en&format=json'
    )
    expect(urls[1]).toBe(
      'https://api.open-meteo.com/v1/forecast' +
        '?latitude=51.5&longitude=-0.12' +
        '&current=temperature_2m,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&timezone=auto'
    )
  })

  it('uses Python banker rounding for .5 values', async () => {
    const client = new WeatherClient(
      fetchStub((url) =>
        url.startsWith('https://geocoding-api.open-meteo.com')
          ? jsonResponse({ results: [{ name: 'Dublin', latitude: 1, longitude: 2 }] })
          : jsonResponse(forecastBody(28.5, 0, [28.5], [17.5]))
      )
    )

    const result = await client.fetch('Dublin')

    expect(result.temperature).toBe('28\u00b0C')
    expect(result.high).toBe('28\u00b0')
    expect(result.low).toBe('18\u00b0')
  })

  it('returns the exact fallback when the network fails', async () => {
    const client = new WeatherClient(
      fetchStub(() => {
        throw new Error('offline')
      })
    )

    const result = await client.fetch('  Atlantis  ')

    expect(result.location).toBe('Atlantis')
    expect(result.temperature).toBe('29\u00b0C')
    expect(result.low).toBe('17\u00b0')
    expect(result.high).toBe('29\u00b0')
    expect(result.condition).toBe('Clear')
    expect(result.icon).toBe('sun')
    expect(result.spoken).toBe(
      'The forecast returned clear skies today with a high of 29 degrees ' +
        'Celsius and a low of 17.'
    )
  })

  it('uses Current Location for a blank location', async () => {
    const urls: string[] = []
    const client = new WeatherClient(
      fetchStub((url) => {
        urls.push(url)
        if (url.startsWith('https://geocoding-api.open-meteo.com')) {
          return jsonResponse({ results: [] })
        }
        return jsonResponse({}, 500)
      })
    )

    const result = await client.fetch('   ')

    expect(result.location).toBe('Current Location')
    expect(urls[0]).toContain('name=Current+Location')
  })

  it('still forecasts with the fallback point when geocoding fails', async () => {
    let calls = 0
    const urls: string[] = []
    const client = new WeatherClient(
      fetchStub((url) => {
        calls += 1
        urls.push(url)
        if (calls === 1) {
          throw new Error('geocoder offline')
        }
        return jsonResponse(forecastBody(30.4, 0, [33], [20]))
      })
    )

    const result = await client.fetch('London')

    expect(result.location).toBe('London')
    expect(result.temperature).toBe('30\u00b0C')
    expect(result.condition).toBe('Clear')
    expect(result.high).toBe('33\u00b0')
    expect(urls[1]).toContain('latitude=20.5937&longitude=78.9629')
  })

  it('falls back when the forecast status is not 200', async () => {
    const client = new WeatherClient(
      fetchStub((url) =>
        url.startsWith('https://geocoding-api.open-meteo.com')
          ? jsonResponse({ results: [] })
          : jsonResponse({}, 503)
      )
    )

    const result = await client.fetch('Paris')

    expect(result.temperature).toBe('29\u00b0C')
    expect(result.condition).toBe('Clear')
  })

  it('falls back when the forecast payload is malformed', async () => {
    const client = new WeatherClient(
      fetchStub((url) =>
        url.startsWith('https://geocoding-api.open-meteo.com')
          ? jsonResponse({ results: [] })
          : jsonResponse({ current: null, daily: null })
      )
    )

    const result = await client.fetch('Paris')

    expect(result.temperature).toBe('29\u00b0C')
  })
})

describe('WeatherResult', () => {
  it('turns itself into a card', () => {
    const result = new WeatherResult(
      'London',
      '20\u00b0C',
      '12\u00b0',
      '24\u00b0',
      'Slight Rain',
      'rain',
      'spoken'
    )

    expect(result.toCard()).toEqual({
      kind: 'weather',
      location: 'London',
      temperature: '20\u00b0C',
      low: '12\u00b0',
      high: '24\u00b0',
      condition: 'Slight Rain',
      icon: 'rain'
    })
  })

  it('maps WMO weather codes', () => {
    expect(WMO_WEATHER_CODES[0]).toEqual(['Clear', 'sun'])
    expect(WMO_WEATHER_CODES[61]).toEqual(['Slight Rain', 'rain'])
    expect(WMO_WEATHER_CODES[95]).toEqual(['Thunderstorm', 'storm'])
  })
})
