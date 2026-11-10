/**
 * Split a spoken response into short utterance-sized chunks.
 *
 * Windows Chromium can stop synthesizing a single long utterance partway
 * through. Speaking sentence-sized chunks keeps every word audible and lets the
 * renderer chain them without gaps. The splitter is pure so it can be tested
 * without a browser.
 */
export function splitSpeechText(text: string, maxLength = 160): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  // Split after real sentence endings only: punctuation followed by
  // whitespace and a new sentence. This keeps decimals ("3.5") and most
  // abbreviations intact instead of turning them into choppy utterances.
  const sentences = normalized.split(/(?<=[.!?])(?=\s+[A-Z"'([\u2018\u201c])/)
  const chunks: string[] = []

  for (const raw of sentences) {
    let rest = raw.trim()
    if (!rest) continue

    while (rest.length > maxLength) {
      let cut = rest.lastIndexOf(' ', maxLength)
      if (cut < Math.floor(maxLength / 2)) cut = maxLength
      chunks.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }

    if (rest) chunks.push(rest)
  }

  return chunks.filter((chunk) => chunk.length > 0)
}
