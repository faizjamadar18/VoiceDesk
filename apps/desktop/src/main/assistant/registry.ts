/**
 * In-memory tool registry, mirroring ToolRegistry in apps/api/app/tools.py.
 * Tools are offered sorted by name, so the menu is stable across runs.
 */

import type { JsonSchema, Tool, ToolSpec } from './types'

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.spec.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /** Remove a tool. Returns true when something was removed. Idempotent. */
  delete(name: string): boolean {
    return this.tools.delete(name)
  }

  /** Tools sorted by name (code-unit order), independent of registration order. */
  specs(): ToolSpec[] {
    return [...this.tools.values()]
      .map((tool) => tool.spec)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  functionDeclarations(): Array<{
    name: string
    description: string
    parameters: JsonSchema
  }> {
    return functionDeclarationsFromSpecs(this.specs())
  }
}

export function functionDeclarationsFromSpecs(
  specs: ToolSpec[]
): Array<{ name: string; description: string; parameters: JsonSchema }> {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters
  }))
}
