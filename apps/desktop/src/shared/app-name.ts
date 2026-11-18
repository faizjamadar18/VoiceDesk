const LEGACY_PRODUCT_NAMES = new Set(['voiceos', 'voice os', 'kestrel'])

/**
 * Human-readable app name for history records.
 *
 * Older records store the product's previous names; show them under the
 * current name without rewriting the stored value.
 */
export function displayAppName(name?: string | null): string {
  const trimmed = name?.trim() ?? ''
  if (trimmed === '') return 'VoiceDesk'
  if (LEGACY_PRODUCT_NAMES.has(trimmed.toLowerCase())) return 'VoiceDesk'
  return trimmed
}
