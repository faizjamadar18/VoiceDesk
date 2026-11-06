function startsWithUrlOrPath(text: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ||
    /^www\./i.test(text) ||
    /^(?:mailto|file|data):/i.test(text) ||
    /^[a-z]:[\\/]/i.test(text) ||
    /^(?:\.{1,2}[\\/]|\\\\|\/)/.test(text)
  )
}

function capitalizeFirstLetter(text: string): string {
  const first = text.charAt(0)
  return first.toUpperCase() + text.slice(1)
}

export function polishTranscript(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  if (startsWithUrlOrPath(text)) return text
  return capitalizeFirstLetter(text)
}
