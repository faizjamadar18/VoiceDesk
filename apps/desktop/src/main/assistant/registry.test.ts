import { describe, expect, it } from 'vitest'
import { ToolRegistry } from './registry'
import type { Tool } from './types'

function makeTool(name: string): Tool {
  return {
    spec: {
      name,
      description: `${name} tool`,
      parameters: { type: 'object', properties: {}, required: [] },
      risk: 'read',
      requiresConfirmation: false
    },
    run: () => ({ status: 'ok', action: name, message: '' })
  }
}

function toolNames(registry: ToolRegistry): string[] {
  return registry.specs().map((spec) => spec.name)
}

describe('ToolRegistry.delete', () => {
  it('removes a registered tool and reports it', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('open_app'))

    expect(registry.delete('open_app')).toBe(true)
    expect(registry.get('open_app')).toBeUndefined()
    expect(toolNames(registry)).not.toContain('open_app')
  })

  it('returns false for an unknown name', () => {
    const registry = new ToolRegistry()

    expect(registry.delete('missing')).toBe(false)
  })

  it('replaces rather than duplicates a re-registered name', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('open_app'))
    const replacement = makeTool('open_app')

    registry.register(replacement)

    expect(toolNames(registry).filter((name) => name === 'open_app')).toHaveLength(1)
    expect(registry.get('open_app')).toBe(replacement)
  })
})
