/**
 * Turn MCP tool schemas into provider-safe parameter schemas.
 *
 * MCP servers publish full JSON Schema: `$ref`/`$defs`, `anyOf`/`oneOf`
 * unions, array types (`["object", "null"]`), `const`, `additionalProperties`,
 * and so on. OpenAI-style function calling — and therefore Groq — rejects
 * several of these, and because every tool shares one request, a single bad
 * schema fails the whole planner call.
 *
 * `normalizeParameters` flattens any schema into a small, conservative object
 * schema that every provider accepts, while keeping the property names and
 * types a model needs to call the tool.
 */

import type { JsonSchema } from '../types'

/**
 * How deep to follow nested `$ref`/`properties` before giving up and emitting
 * a permissive object. Bounds both recursion and payload size.
 */
export const MAX_DEPTH = 8

const OBJECT = 'object'
const ALLOWED_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean'
])
const REF_PREFIXES = ['#/$defs/', '#/definitions/'] as const

/**
 * Return a provider-safe object schema for `schema`.
 *
 * The result always has `type`, `properties` and `required` keys, never
 * contains `$ref` or `$defs`, and never mutates the input.
 */
export function normalizeParameters(schema: unknown): JsonSchema {
  const root = isRecord(schema) ? schema : {}
  const defs = collectDefs(root)
  const converted = convert(root, defs, [], 0)

  const properties = isRecord(converted.properties) ? converted.properties : {}
  const required = Array.isArray(converted.required)
    ? converted.required.filter(
        (name) => typeof name === 'string' && Object.hasOwn(properties, name)
      )
    : []
  return { type: OBJECT, properties, required }
}

function collectDefs(root: Record<string, unknown>): Map<string, unknown> {
  const defs = new Map<string, unknown>()
  for (const key of ['$defs', 'definitions']) {
    const value = root[key]
    if (!isRecord(value)) continue
    for (const [name, subschema] of Object.entries(value)) {
      if (isRecord(subschema)) defs.set(name, subschema)
    }
  }
  return defs
}

function convert(
  node: unknown,
  defs: Map<string, unknown>,
  refStack: readonly string[],
  depth: number
): Record<string, unknown> {
  if (depth > MAX_DEPTH || !isRecord(node)) return { type: OBJECT }

  const ref = node.$ref
  if (typeof ref === 'string') {
    return resolveRef(ref, defs, refStack, depth)
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = node[keyword]
    if (Array.isArray(branches) && branches.length > 0) {
      return mergeBranches(branches, defs, refStack, depth)
    }
  }

  let nodeType = normalizeType(node.type)
  const properties = node.properties
  const hasProperties = isRecord(properties)
  if (nodeType === null && hasProperties) {
    nodeType = OBJECT
  }

  const out: Record<string, unknown> = {}
  if (nodeType !== null) out.type = nodeType

  const description = node.description
  if (typeof description === 'string' && description.trim()) {
    out.description = description
  }

  const enumValues = node.enum
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    out.enum = [...enumValues]
  } else if (Object.hasOwn(node, 'const')) {
    out.enum = [node.const]
  }

  if (nodeType === OBJECT) {
    out.type = OBJECT
    const newProperties: Record<string, unknown> = {}
    if (isRecord(properties)) {
      for (const [name, child] of Object.entries(properties)) {
        newProperties[name] = convert(child, defs, refStack, depth + 1)
      }
    }
    out.properties = newProperties
    out.required = Array.isArray(node.required)
      ? node.required
          .map((name) => pythonString(name))
          .filter((name) => Object.hasOwn(newProperties, name))
      : []
  } else if (nodeType === 'array') {
    const items = node.items
    if (isRecord(items)) {
      out.items = convert(items, defs, refStack, depth + 1)
    }
  }

  return out
}

function resolveRef(
  ref: string,
  defs: Map<string, unknown>,
  refStack: readonly string[],
  depth: number
): Record<string, unknown> {
  const name = refName(ref)
  if (name === null || refStack.includes(name)) {
    // Unknown or recursive reference: stop with a permissive object rather
    // than emitting a dangling `$ref`.
    return { type: OBJECT }
  }
  const target = defs.get(name)
  if (!isRecord(target)) return { type: OBJECT }
  return convert(target, defs, [...refStack, name], depth + 1)
}

function refName(ref: string): string | null {
  for (const prefix of REF_PREFIXES) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length)
  }
  return null
}

function mergeBranches(
  branches: readonly unknown[],
  defs: Map<string, unknown>,
  refStack: readonly string[],
  depth: number
): Record<string, unknown> {
  const converted = branches
    .filter((branch) => isRecord(branch))
    .map((branch) => convert(branch, defs, refStack, depth + 1))
  if (converted.length === 0) return { type: OBJECT }

  const objects = converted.filter(
    (branch) => branch.type === OBJECT || Object.hasOwn(branch, 'properties')
  )
  if (objects.length > 0) {
    const properties: Record<string, unknown> = {}
    for (const branch of objects) {
      const branchProperties = branch.properties
      if (!isRecord(branchProperties)) continue
      for (const [name, value] of Object.entries(branchProperties)) {
        if (!Object.hasOwn(properties, name)) properties[name] = value
      }
    }
    return { type: OBJECT, properties, required: [] }
  }

  const enums = converted.filter((branch) => Object.hasOwn(branch, 'enum'))
  if (enums.length > 0 && enums.length === converted.length) {
    const merged: unknown[] = []
    for (const branch of enums) {
      const values = branch.enum
      if (!Array.isArray(values)) continue
      for (const value of values) {
        if (!merged.some((existing) => valuesEqual(existing, value))) {
          merged.push(value)
        }
      }
    }
    return { enum: merged }
  }

  const types: string[] = []
  for (const branch of converted) {
    const branchType = branch.type
    if (typeof branchType === 'string' && !types.includes(branchType)) {
      types.push(branchType)
    }
  }
  if (types.length === 1) return { type: types[0] }
  return { type: OBJECT }
}

function normalizeType(raw: unknown): string | null {
  if (typeof raw === 'string') {
    return ALLOWED_TYPES.has(raw) ? raw : null
  }
  if (Array.isArray(raw)) {
    const names = raw.filter(
      (name): name is string => typeof name === 'string' && name !== 'null'
    )
    if (names.includes(OBJECT)) return OBJECT
    for (const name of names) {
      if (ALLOWED_TYPES.has(name)) return name
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Python's `str()` for JSON values. */
function pythonString(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonRepr(item)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, item]) => `'${key}': ${pythonRepr(item)}`
    )
    return `{${entries.join(', ')}}`
  }
  return String(value)
}

function pythonRepr(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  return pythonString(value)
}

/** Python `==` for JSON values, used to de-duplicate merged enum members. */
function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => valuesEqual(item, right[index]))
    )
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every(
      (key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key])
    )
  }
  return false
}
