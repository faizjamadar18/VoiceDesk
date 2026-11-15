import { execFile } from 'node:child_process'
import type {
  DictationSettings,
  WritingContextType,
  WritingStructure
} from '../../shared/dictation'
import { WRITING_CONTEXT_TYPES } from '../../shared/dictation'

export type { WritingContextType, WritingStructure }

export interface WindowInfo {
  processName?: string
  appName?: string
  windowTitle?: string
  url?: string
}

export const DEFAULT_STRUCTURES: Record<WritingContextType, WritingStructure> = {
  email: {
    capitalization: 'always',
    sentenceEndings: 'proper',
    greeting: 'newline',
    exclamation: 'off'
  },
  work_chat: {
    capitalization: 'always',
    sentenceEndings: 'light',
    greeting: 'inline',
    exclamation: 'off'
  },
  personal_chat: {
    capitalization: 'auto',
    sentenceEndings: 'light',
    greeting: 'inline',
    exclamation: 'on'
  },
  other: {
    capitalization: 'auto',
    sentenceEndings: 'proper',
    greeting: 'inline',
    exclamation: 'off'
  }
}

const EMAIL_PATTERNS = [
  'mail',
  'outlook',
  'superhuman',
  'gmail',
  'thunderbird',
  'spark',
  'airmail',
  'protonmail',
  'fastmail',
  'mailspring',
  'tuta',
  'tutanota',
  'mailbird',
  'emclient'
]

const WORK_CHAT_PATTERNS = [
  'slack',
  'teams',
  'linear',
  'notion',
  'asana',
  'jira',
  'basecamp',
  'monday',
  'clickup',
  'lark',
  'feishu',
  'dingtalk',
  'mattermost',
  'rocket.chat',
  'zulip',
  'twist',
  'google chat',
  'chatwork',
  'line works',
  'lineworks',
  'workplace',
  'webex',
  'pumble',
  'flock',
  'chanty'
]

const PERSONAL_CHAT_PATTERNS = [
  'whatsapp',
  'telegram',
  'discord',
  'signal',
  'viber',
  'wechat',
  'kakaotalk',
  'skype',
  'zalo',
  'imo',
  'threema',
  'wire',
  'element',
  'groupme',
  'messages',
  'messenger'
]

const EMAIL_URL_PATTERNS = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'mail.yahoo.com',
  'mail.proton.me',
  'app.superhuman.com',
  'app.fastmail.com',
  'mail.zoho.com',
  'mail.tutanota.com',
  'app.tuta.com',
  'mail.icloud.com',
  'mail.gmx.com',
  'mail.yandex.com'
]

const WORK_CHAT_URL_PATTERNS = [
  'app.slack.com',
  'teams.microsoft.com',
  'linear.app',
  'notion.so',
  'app.asana.com',
  'atlassian.net',
  'app.clickup.com',
  'monday.com',
  'app.twist.com',
  'chat.google.com',
  'chatwork.com',
  'line.worksmobile.com',
  'workplace.com',
  'web.webex.com'
]

const PERSONAL_CHAT_URL_PATTERNS = [
  'web.whatsapp.com',
  'discord.com',
  'messenger.com',
  'web.telegram.org',
  'web.skype.com',
  'messages.google.com'
]

function normalizeName(name?: string): string {
  if (!name) return ''
  return name.toLowerCase().replace(/\.exe$/i, '').trim()
}

function matchesAnyPattern(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

export function classifyWindowContext(
  info: WindowInfo,
  customMappings?: Record<string, WritingContextType>
): WritingContextType {
  const normalizedProcess = normalizeName(info.processName)
  const normalizedApp = normalizeName(info.appName)

  if (customMappings) {
    if (normalizedProcess && customMappings[normalizedProcess]) {
      return customMappings[normalizedProcess]
    }
    if (normalizedApp && customMappings[normalizedApp]) {
      return customMappings[normalizedApp]
    }
  }

  if (info.url) {
    const urlLower = info.url.toLowerCase()
    if (EMAIL_URL_PATTERNS.some((pat) => urlLower.includes(pat))) return 'email'
    if (WORK_CHAT_URL_PATTERNS.some((pat) => urlLower.includes(pat))) return 'work_chat'
    if (PERSONAL_CHAT_URL_PATTERNS.some((pat) => urlLower.includes(pat))) return 'personal_chat'
  }

  const appOrProcess = [normalizedProcess, normalizedApp].filter(Boolean).join(' ')
  if (appOrProcess) {
    if (matchesAnyPattern(appOrProcess, EMAIL_PATTERNS)) return 'email'
    if (matchesAnyPattern(appOrProcess, WORK_CHAT_PATTERNS)) return 'work_chat'
    if (matchesAnyPattern(appOrProcess, PERSONAL_CHAT_PATTERNS)) return 'personal_chat'
  }

  if (info.windowTitle) {
    const titleLower = info.windowTitle.toLowerCase()
    if (matchesAnyPattern(titleLower, EMAIL_PATTERNS)) return 'email'
    if (matchesAnyPattern(titleLower, WORK_CHAT_PATTERNS)) return 'work_chat'
    if (matchesAnyPattern(titleLower, PERSONAL_CHAT_PATTERNS)) return 'personal_chat'
  }

  return 'other'
}

export interface ResolvedWritingContext {
  type: WritingContextType
  structure: WritingStructure
}

export function resolveWritingContext(
  info: WindowInfo,
  customMappings?: Record<string, WritingContextType>
): ResolvedWritingContext {
  const type = classifyWindowContext(info, customMappings)
  return {
    type,
    structure: { ...DEFAULT_STRUCTURES[type] }
  }
}

/** Apps only recognisable by host: the pin names a product, the window names a URL. */
const EXPLICIT_ASSIGNMENT_HOST_ALIASES: Record<string, string[]> = {
  slack: ['app.slack.com'],
  'microsoft teams': ['teams.microsoft.com'],
  'microsoft outlook': ['outlook.live.com', 'outlook.office.com'],
  'google chat': ['chat.google.com'],
  'google messages': ['messages.google.com'],
  'line works': ['line.worksmobile.com'],
  lineworks: ['line.worksmobile.com'],
  'apple mail': ['mail.icloud.com'],
  'visual studio code': ['code', 'com.microsoft.vscode']
}

/** Vendor and product words that appear in half the pins, so they never decide a match. */
const GENERIC_APP_TOKENS = new Set([
  'app',
  'apple',
  'desktop',
  'facebook',
  'google',
  'chat',
  'line',
  'mail',
  'messages',
  'meta',
  'microsoft',
  'office',
  'web',
  'works'
])

function normalizeTarget(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  return value.toLowerCase().trim().replace(/\.exe$/, '').trim()
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function hostnameOf(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Every name a window can be recognised by: process, app, URL, title and the
 * URL host. Normalized once so pins and targets are compared the same way.
 */
export function normalizeWindowTargets(info: WindowInfo | null): string[] {
  const candidates = [
    info?.processName,
    info?.appName,
    info?.url,
    info?.windowTitle,
    hostnameOf(info?.url)
  ]

  const targets: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeTarget(candidate)
    if (normalized) targets.push(normalized)
  }
  return targets
}

/**
 * A pin matches when it equals a target or when each of its distinctive tokens
 * appears among a target's tokens, so "Teams" finds "microsoft teams" and
 * "Slack" finds "slack.exe".
 */
function pinMatches(pin: string, targets: string[]): boolean {
  const normalizedPin = normalizeTarget(pin)
  if (!normalizedPin) return false
  if (targets.includes(normalizedPin)) return true

  const aliases = EXPLICIT_ASSIGNMENT_HOST_ALIASES[normalizedPin]
  if (aliases?.some((alias) => targets.includes(alias))) return true

  const distinctiveTokens = tokenize(normalizedPin).filter(
    (token) => token.length >= 4 && !GENERIC_APP_TOKENS.has(token)
  )
  if (distinctiveTokens.length === 0) return false

  return targets.some((target) => {
    const targetTokens = tokenize(target)
    return distinctiveTokens.every((token) => targetTokens.includes(token))
  })
}

function findPinnedContext(
  targets: string[],
  contexts: DictationSettings['writingContexts']
): WritingContextType | undefined {
  if (targets.length === 0) return undefined

  for (const type of WRITING_CONTEXT_TYPES) {
    const context = contexts.find((candidate) => candidate.type === type)
    if (!context) continue
    for (const pin of context.assignedApps) {
      if (pinMatches(pin, targets)) return type
    }
  }
  return undefined
}

/**
 * The live-settings resolver used per transcript: a pinned app wins over the
 * heuristic, and the structure is the one stored for the resolved context.
 * Null windows still get the `other` structure from settings.
 */
export function resolveWritingContextForSettings(
  info: WindowInfo | null,
  settings: DictationSettings,
  customMappings?: Record<string, WritingContextType>
): ResolvedWritingContext {
  const targets = normalizeWindowTargets(info)
  const pinned = findPinnedContext(targets, settings.writingContexts)
  const type = pinned ?? classifyWindowContext(info ?? {}, customMappings)
  const context = settings.writingContexts.find((candidate) => candidate.type === type)

  return {
    type,
    structure: { ...(context?.structure ?? DEFAULT_STRUCTURES[type]) }
  }
}

/**
 * On Windows, attempts to fetch the foreground window process and title via PowerShell.
 * Returns null if unavailable or non-Windows.
 */
export async function getActiveWindowInfo(timeoutMs = 1500): Promise<WindowInfo | null> {
  if (process.platform !== 'win32') {
    return null
  }

  return new Promise((resolve) => {
    const script = `
$w = Add-Type -MemberDefinition '
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
' -Name "Win32GetWindow" -Namespace Win32Functions -PassThru

$hwnd = $w::GetForegroundWindow()
if ($hwnd -ne [IntPtr]::Zero) {
  $sb = New-Object System.Text.StringBuilder 256
  $null = $w::GetWindowText($hwnd, $sb, $sb.Capacity)
  $pidVal = 0
  $null = $w::GetWindowThreadProcessId($hwnd, [ref]$pidVal)
  $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
  @{
    processName = if ($p) { $p.ProcessName } else { "" }
    windowTitle = $sb.ToString()
  } | ConvertTo-Json -Compress
}
`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as { processName?: string; windowTitle?: string }
          resolve({
            processName: parsed.processName,
            windowTitle: parsed.windowTitle
          })
        } catch {
          resolve(null)
        }
      }
    )
  })
}
