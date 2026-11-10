/**
 * A deliberately small local fast path for obvious screen questions. This keeps
 * the common deictic question from paying for a planner round-trip; anything
 * ambiguous still goes through `/act`, where the planner can return
 * `look_at_screen`.
 */

const SCREEN_NOUN =
  'error|message|window|page|button|icon|text|code|image|photo|picture|screenshot|chart|graph|diagram|dialog|popup|notification|warning|alert|notice|tooltip|menu|tab|field|label|link|table|form|list'

const SCREEN_QUESTION_PATTERNS: RegExp[] = [
  // Deictic questions that can only mean the screen.
  /^what(?:'s| is) (?:this|that|it)$/,
  new RegExp(`^what(?:'s| is) (?:this|that) (?:${SCREEN_NOUN})$`),
  /^what(?:'s| is) (?:wrong|the matter) with (?:this|that)$/,
  /^what does (?:this|that) (?:say|mean|show|do)$/,
  new RegExp(`^what does (?:this|that) (?:${SCREEN_NOUN}) (?:say|mean|show|do)$`),
  /^what(?:'s| is) (?:happening|going on) here$/,
  /^what happened here$/,
  new RegExp(`^what(?:'s| is) (?:in|inside) (?:this|that|the) (?:${SCREEN_NOUN})$`),

  // Explicit requests to inspect the screen. Keeping these anchored prevents
  // commands such as "click the button on the screen" from capturing an image.
  /^what(?:'s| is) on (?:my|the) screen$/,
  /^what(?:'s| is) (?:in|inside) (?:the|this) circle$/,
  /^what(?:'s| is) circled$/,
  /^what am i looking at$/,
  /^what can you see on (?:my|the) screen$/,
  /^(?:can you see|look at) (?:this|that|my screen|the screen)$/,
  /^(?:read|check|explain|describe|summarize|summarise|look at|scan) (?:my|the) screen$/,
  /^(?:read|explain|translate|summarize|summarise|describe) (?:this|that)(?: to me| for me| aloud| into [a-z][a-z -]{0,30})?$/,
  new RegExp(
    `^(?:read|check|explain|translate|summarize|summarise|describe) (?:the )?(?:${SCREEN_NOUN}) on (?:my|the) screen$`
  ),
  /^(?:is|are) there (?:an? |any )?.+ on (?:my|the) screen$/,
  new RegExp(`^what(?:'s| is) (?:the )?(?:${SCREEN_NOUN}) on (?:my|the) screen$`)
]

function normalize(transcript: string): string {
  return transcript
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\bwhats\b/g, "what's")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?!.,;:]+$/g, '')
    .trim()
}

/**
 * True only for clear screen/deictic questions. Commands such as "open this
 * app" and general-knowledge questions such as "what time is it" stay false so
 * they keep their existing planner path.
 */
export function isScreenQuestion(transcript: string): boolean {
  const text = normalize(transcript)
  if (!text) return false
  return SCREEN_QUESTION_PATTERNS.some((pattern) => pattern.test(text))
}
