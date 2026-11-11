import { describe, expect, it } from 'vitest'
import { normalizeParameters } from './schema'

const EMPTY_OBJECT = {
  type: 'object',
  properties: {},
  required: []
}

function objectProperties(
  result: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  return result.properties as Record<string, Record<string, unknown>>
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

describe('normalizeParameters', () => {
  it('inlines refs and removes defs', () => {
    const schema = {
      $defs: {
        thing: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        }
      },
      type: 'object',
      properties: { item: { $ref: '#/$defs/thing' } },
      required: ['item']
    }

    const result = normalizeParameters(schema)

    expect(result).not.toHaveProperty('$defs')
    expect(JSON.stringify(result)).not.toContain('$ref')
    expect(objectProperties(result).item).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    })
  })

  it('also inlines the definitions keyword', () => {
    const schema = {
      definitions: { thing: { type: 'string' } },
      type: 'object',
      properties: { name: { $ref: '#/definitions/thing' } }
    }

    const result = normalizeParameters(schema)

    expect(objectProperties(result).name).toEqual({ type: 'string' })
    expect(JSON.stringify(result)).not.toContain('$ref')
  })

  it('inlines nested refs', () => {
    const schema = {
      $defs: {
        inner: { type: 'object', properties: { x: { type: 'string' } } },
        outer: {
          type: 'object',
          properties: { inner: { $ref: '#/$defs/inner' } }
        }
      },
      type: 'object',
      properties: { outer: { $ref: '#/$defs/outer' } }
    }

    const result = normalizeParameters(schema)
    const outer = objectProperties(result).outer as Record<string, unknown>
    const outerProperties = outer.properties as Record<
      string,
      Record<string, unknown>
    >

    expect(outerProperties.inner).toEqual({
      type: 'object',
      properties: { x: { type: 'string' } },
      required: []
    })
    expect(JSON.stringify(result)).not.toContain('$ref')
  })

  it('terminates a recursive def without refs', () => {
    const schema = {
      $defs: {
        node: {
          type: 'object',
          properties: { child: { $ref: '#/$defs/node' } }
        }
      },
      type: 'object',
      properties: { root: { $ref: '#/$defs/node' } }
    }

    const result = normalizeParameters(schema)

    expect(JSON.stringify(result)).not.toContain('$ref')
    expect(JSON.stringify(result)).not.toContain('$defs')
  })

  it('turns an unresolvable ref into a permissive object', () => {
    const schema = {
      type: 'object',
      properties: { x: { $ref: '#/$defs/missing' } }
    }

    expect(objectProperties(normalizeParameters(schema)).x).toEqual({
      type: 'object'
    })
  })

  it('turns const into enum', () => {
    const schema = {
      type: 'object',
      properties: { kind: { const: 'page' } }
    }

    expect(objectProperties(normalizeParameters(schema)).kind).toEqual({
      enum: ['page']
    })
  })

  it('collapses array types to a single type', () => {
    const schema = {
      type: 'object',
      properties: {
        obj: { type: ['object', 'null'] },
        text: { type: ['string', 'null'] }
      }
    }

    const properties = objectProperties(normalizeParameters(schema))

    expect(properties.obj.type).toBe('object')
    expect(properties.text).toEqual({ type: 'string' })
  })

  it('merges anyOf object branches', () => {
    const schema = {
      $defs: {
        p: { type: 'object', properties: { paragraph: { type: 'object' } } },
        b: { type: 'object', properties: { bulleted: { type: 'object' } } }
      },
      type: 'object',
      properties: {
        children: {
          type: 'array',
          items: {
            anyOf: [{ $ref: '#/$defs/p' }, { $ref: '#/$defs/b' }]
          }
        }
      }
    }

    const children = objectProperties(normalizeParameters(schema))
      .children as Record<string, unknown>
    const items = children.items as Record<string, unknown>

    expect(items.type).toBe('object')
    expect(new Set(Object.keys(items.properties as object))).toEqual(
      new Set(['paragraph', 'bulleted'])
    )
    expect(JSON.stringify(items)).not.toContain('$ref')
  })

  it('merges allOf object branches', () => {
    const schema = {
      type: 'object',
      properties: {
        child: {
          allOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } }
          ]
        }
      }
    }

    expect(objectProperties(normalizeParameters(schema)).child).toEqual({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' }
      },
      required: []
    })
  })

  it('unions oneOf enum branches', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: {
          oneOf: [{ const: 'page' }, { const: 'block' }]
        }
      }
    }

    expect(objectProperties(normalizeParameters(schema)).kind).toEqual({
      enum: ['page', 'block']
    })
  })

  it('always produces an object at the top level', () => {
    expect(normalizeParameters({ type: 'string' })).toEqual(EMPTY_OBJECT)
  })

  it('filters required to existing properties', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a', 'ghost']
    }

    expect(normalizeParameters(schema).required).toEqual(['a'])
  })

  it('drops unsupported keywords', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        a: { type: 'string', format: 'uuid', default: 'x' }
      }
    }

    const result = normalizeParameters(schema)

    expect(result).not.toHaveProperty('additionalProperties')
    expect(objectProperties(result).a).toEqual({ type: 'string' })
  })

  it('does not mutate the input schema', () => {
    const schema = {
      $defs: { thing: { type: 'string' } },
      type: 'object',
      properties: { a: { $ref: '#/$defs/thing' } },
      required: ['a']
    }
    const before = stable(schema)

    normalizeParameters(schema)

    expect(stable(schema)).toBe(before)
  })

  it('returns an empty object for missing or non-object input', () => {
    expect(normalizeParameters(null)).toEqual(EMPTY_OBJECT)
    expect(normalizeParameters('nope')).toEqual(EMPTY_OBJECT)
    expect(normalizeParameters({})).toEqual(EMPTY_OBJECT)
  })
})
