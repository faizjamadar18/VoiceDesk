import { execFile } from 'node:child_process'

export type WritingContextType = 'email' | 'work_chat' | 'personal_chat' | 'other'

export interface WindowInfo {
  processName?: string
  appName?: string
  windowTitle?: string
  url?: string
}

export interface WritingStructure {
  capitalization: 'always' | 'auto' | 'never'
  sentenceEndings: 'proper' | 'light' | 'none'
  greeting: 'newline' | 'inline'
  exclamation: 'on' | 'off'
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
