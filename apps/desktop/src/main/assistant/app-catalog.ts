/**
 * Resolve spoken application names to launchable Windows targets.
 *
 * Windows has no single registry of "installed apps", so Kestrel composes the
 * same sources the Start menu and the Run dialog use:
 *
 * - the App Paths registry (desktop apps such as Chrome, Word, and VS Code)
 * - Start menu and desktop shortcuts (classic desktop apps and games)
 * - the Start apps list (Microsoft Store apps such as WhatsApp)
 * - the executable search path (console tools such as `cmd`)
 *
 * Nothing here accepts a shell command from the user. Every launch is an argv
 * list built from a local target that was found on this machine.
 */

import { execFile, spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_CACHE_SECONDS = 300
export const START_APPS_TIMEOUT_SECONDS = 8

// Spoken name -> canonical app id. Aliases cover names whose executable is
// spelled differently, plus the phrases people actually use.
export const APP_ALIASES: Record<string, string> = {
  notepad: 'notepad',
  'note pad': 'notepad',
  calculator: 'calculator',
  calc: 'calculator',
  chrome: 'chrome',
  'google chrome': 'chrome',
  browser: 'chrome',
  explorer: 'explorer',
  'file explorer': 'explorer',
  files: 'explorer',
  word: 'word',
  'microsoft word': 'word',
  excel: 'excel',
  'microsoft excel': 'excel',
  powerpoint: 'powerpnt',
  'microsoft powerpoint': 'powerpnt',
  outlook: 'outlook',
  'microsoft outlook': 'outlook',
  settings: 'settings',
  'windows settings': 'settings',
  edge: 'edge',
  'microsoft edge': 'edge',
  terminal: 'terminal',
  'windows terminal': 'terminal',
  cmd: 'cmd',
  'command prompt': 'cmd',
  'command line': 'cmd',
  powershell: 'powershell',
  'power shell': 'powershell',
  paint: 'paint',
  'microsoft paint': 'paint',
  'task manager': 'taskmgr',
  'control panel': 'control',
  'vs code': 'code',
  vscode: 'code',
  'visual studio code': 'code',
  'notepad++': 'notepad++',
  'notepad plus plus': 'notepad++',
  'notepad plus': 'notepad++',
  '7zip': '7-zip',
  '7 zip': '7-zip'
}

export const APP_LABELS: Record<string, string> = {
  notepad: 'Notepad',
  'notepad++': 'Notepad++',
  calculator: 'Calculator',
  chrome: 'Chrome',
  explorer: 'File Explorer',
  word: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  outlook: 'Outlook',
  settings: 'Settings',
  edge: 'Microsoft Edge',
  terminal: 'Terminal',
  cmd: 'Command Prompt',
  powershell: 'PowerShell',
  paint: 'Paint',
  taskmgr: 'Task Manager',
  control: 'Control Panel',
  code: 'Visual Studio Code',
  '7-zip': '7-Zip'
}

// Executable names that differ from the canonical id. The order matters: the
// first executable Windows can find is the one that gets launched.
export const APP_EXECUTABLES: Record<string, readonly string[]> = {
  notepad: ['notepad'],
  'notepad++': ['notepad++'],
  calculator: ['calc'],
  chrome: ['chrome'],
  explorer: ['explorer'],
  word: ['winword'],
  excel: ['excel'],
  powerpnt: ['powerpnt'],
  outlook: ['outlook'],
  edge: ['msedge'],
  terminal: ['wt', 'powershell'],
  cmd: ['cmd'],
  powershell: ['powershell'],
  paint: ['mspaint'],
  taskmgr: ['taskmgr'],
  control: ['control'],
  code: ['code'],
  '7-zip': ['7zfm']
}

const SOURCE_PRIORITY: Record<string, number> = {
  shell: 0,
  path: 0,
  app_paths: 1,
  start_app: 2,
  shortcut: 3
}

// Packaged (Store/MSIX) apps live here and refuse direct CreateProcess
// launches; the Start apps list is the supported way to start them.
const RESTRICTED_PACKAGE_FRAGMENT = '\\program files\\windowsapps\\'

const NON_WORD = /[^\p{L}\p{N}_]+/gu
const WORD = /[\p{L}\p{N}_]+/gu

export interface AppEntry {
  name: string
  launch: readonly string[]
  shell?: boolean
  source?: string
}

export class AppNotInstalledError extends Error {
  readonly app: string
  readonly label: string

  constructor(app: string) {
    const label = appLabel(app)
    super(`${label} is not installed on this PC.`)
    this.name = 'AppNotInstalledError'
    this.app = app
    this.label = label
  }
}

export class AppLaunchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppLaunchError'
  }
}

// Windows shell targets that are not ordinary executables.
const SPECIAL_TARGETS: Record<string, AppEntry> = {
  settings: {
    name: 'Settings',
    launch: ['ms-settings:'],
    shell: true,
    source: 'shell'
  }
}

export function appLabel(app: string): string {
  const spoken = collapseSpaces(String(app)).replace(/^["']+/, '').replace(/["']+$/, '')
  if (!spoken) {
    return 'That app'
  }
  const lowered = spoken.toLowerCase()
  const canonical = APP_ALIASES[lowered] ?? lowered
  const known = APP_LABELS[canonical]
  if (known) {
    return known
  }
  return spoken.charAt(0).toUpperCase() + spoken.slice(1)
}

function collapseSpaces(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ').trim()
}

function sourcePriority(source: string | undefined): number {
  return SOURCE_PRIORITY[source ?? 'app_paths'] ?? 9
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(NON_WORD, '')
}

function tokensOf(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? []
}

function isRestrictedPackagePath(entry: AppEntry): boolean {
  if ((entry.source ?? 'app_paths') !== 'app_paths' || !entry.launch.length) {
    return false
  }
  return entry.launch[0].toLowerCase().includes(RESTRICTED_PACKAGE_FRAGMENT)
}

function bestEntry(matches: readonly AppEntry[], spoken: string): AppEntry {
  const spokenRaw = collapseSpaces(spoken).toLowerCase()
  let best = matches[0]
  for (const entry of matches) {
    if (compareEntries(entry, best, spokenRaw) < 0) {
      best = entry
    }
  }
  return best
}

function compareEntries(left: AppEntry, right: AppEntry, spokenRaw: string): number {
  const leftKey = [
    collapseSpaces(left.name).toLowerCase() === spokenRaw ? 0 : 1,
    sourcePriority(left.source),
    left.shell ? 1 : 0,
    left.name.length,
    left.name.toLowerCase()
  ] as const
  const rightKey = [
    collapseSpaces(right.name).toLowerCase() === spokenRaw ? 0 : 1,
    sourcePriority(right.source),
    right.shell ? 1 : 0,
    right.name.length,
    right.name.toLowerCase()
  ] as const
  return compareTuple(leftKey, rightKey)
}

function compareTuple(
  left: readonly (number | string)[],
  right: readonly (number | string)[]
): number {
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (typeof a === 'number' && typeof b === 'number') {
      if (a < b) {
        return -1
      }
      if (a > b) {
        return 1
      }
      continue
    }
    const textA = String(a)
    const textB = String(b)
    if (textA < textB) {
      return -1
    }
    if (textA > textB) {
      return 1
    }
  }
  return 0
}

function candidateNames(app: string): string[] {
  const spoken = collapseSpaces(String(app))
  if (!spoken) {
    return []
  }
  const lowered = spoken.toLowerCase()
  const canonical = APP_ALIASES[lowered] ?? lowered
  const names = [spoken]
  if (canonical !== lowered) {
    names.push(canonical)
  }
  const label = APP_LABELS[canonical]
  if (label) {
    names.push(label)
  }
  names.push(...(APP_EXECUTABLES[canonical] ?? []))
  if (lowered !== canonical) {
    names.push(...(APP_EXECUTABLES[lowered] ?? []))
  }

  const unique: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const cleaned = name.trim()
    if (!cleaned) {
      continue
    }
    const marker = cleaned.toLowerCase()
    if (seen.has(marker)) {
      continue
    }
    seen.add(marker)
    unique.push(cleaned)
  }
  return unique
}

function commandFor(file: string): string[] {
  const lowered = file.toLowerCase()
  if (lowered.endsWith('.cmd') || lowered.endsWith('.bat')) {
    return [process.env.COMSPEC ?? 'cmd.exe', '/d', '/c', file]
  }
  if (lowered.endsWith('.ps1')) {
    return [
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      file
    ]
  }
  return [file]
}

export async function launchEntry(entry: AppEntry): Promise<void> {
  if (entry.shell) {
    const target = entry.launch[0]
    if (!target) {
      throw new Error('The app has no launch target.')
    }
    const { shell } = await import('electron')
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
      await shell.openExternal(target)
      return
    }
    const failure = await shell.openPath(target)
    if (failure) {
      throw new Error(failure)
    }
    return
  }

  if (!entry.launch.length) {
    return
  }
  await spawnDetached(entry.launch)
}

function spawnDetached(command: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: 'ignore'
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
    child.once('error', (error) => {
      reject(error)
    })
  })
}

export interface WindowsAppCatalogOptions {
  appPathReader?: () => Iterable<AppEntry> | Promise<Iterable<AppEntry>>
  shortcutRoots?: readonly string[]
  startAppReader?: () => Iterable<AppEntry> | Promise<Iterable<AppEntry>>
  pathFinder?: (name: string) => string | null | undefined | Promise<string | null | undefined>
  launcher?: (entry: AppEntry) => void | Promise<void>
  cacheSeconds?: number
}

export class WindowsAppCatalog {
  private readonly appPathReader: () => Iterable<AppEntry> | Promise<Iterable<AppEntry>>
  private readonly shortcutRoots: readonly string[]
  private readonly startAppReader: () => Iterable<AppEntry> | Promise<Iterable<AppEntry>>
  private readonly pathFinder: (
    name: string
  ) => string | null | undefined | Promise<string | null | undefined>
  private readonly launcher: (entry: AppEntry) => void | Promise<void>
  private readonly cacheSeconds: number
  private entries: readonly AppEntry[] | null = null
  private entriesAt = 0

  constructor(options: WindowsAppCatalogOptions = {}) {
    this.appPathReader = options.appPathReader ?? readAppPathEntries
    this.shortcutRoots =
      options.shortcutRoots !== undefined
        ? [...options.shortcutRoots]
        : defaultShortcutRoots()
    this.startAppReader = options.startAppReader ?? readStartAppEntries
    this.pathFinder = options.pathFinder ?? which
    this.launcher = options.launcher ?? launchEntry
    this.cacheSeconds = options.cacheSeconds ?? DEFAULT_CACHE_SECONDS
  }

  async resolve(app: string): Promise<AppEntry> {
    const spoken = collapseSpaces(String(app))
    if (!spoken) {
      throw new AppNotInstalledError(app)
    }

    const names = candidateNames(spoken)
    const entries = await this.allEntries()

    for (const name of names) {
      const special = SPECIAL_TARGETS[keyOf(name)]
      if (special !== undefined) {
        return special
      }
    }

    for (const name of names) {
      const raw = collapseSpaces(name).toLowerCase()
      let matches = entries.filter(
        (entry) => collapseSpaces(entry.name).toLowerCase() === raw
      )
      if (matches.length) {
        return bestEntry(matches, spoken)
      }

      const key = keyOf(name)
      if (key) {
        matches = entries.filter((entry) => keyOf(entry.name) === key)
        if (matches.length) {
          return bestEntry(matches, spoken)
        }
      }

      const executable = await this.findExecutable(name)
      if (executable !== null) {
        return {
          name,
          launch: commandFor(executable),
          source: 'path'
        }
      }
    }

    const fuzzy = this.bestFuzzy(entries, spoken)
    if (fuzzy !== null) {
      return fuzzy
    }

    throw new AppNotInstalledError(spoken)
  }

  async launch(app: string): Promise<void> {
    const entry = await this.resolve(app)
    try {
      await this.launcher(entry)
    } catch {
      throw new AppLaunchError(
        `I found ${entry.name}, but Windows couldn't open it.`
      )
    }
  }

  private async findExecutable(name: string): Promise<string | null> {
    if (!name || name.includes('\\') || name.includes('/')) {
      return null
    }
    const found = await this.pathFinder(name)
    if (found) {
      return found
    }
    const lowered = name.toLowerCase()
    if (
      !(
        lowered.endsWith('.exe') ||
        lowered.endsWith('.cmd') ||
        lowered.endsWith('.bat') ||
        lowered.endsWith('.com') ||
        lowered.endsWith('.ps1')
      )
    ) {
      const withExe = await this.pathFinder(`${name}.exe`)
      if (withExe) {
        return withExe
      }
    }
    return null
  }

  private async allEntries(): Promise<readonly AppEntry[]> {
    const now = Date.now() / 1000
    if (
      this.entries !== null &&
      this.cacheSeconds > 0 &&
      now - this.entriesAt < this.cacheSeconds
    ) {
      return this.entries
    }

    const collected: AppEntry[] = []
    collected.push(...(await this.appPathReader()))
    collected.push(...(await shortcutEntries(this.shortcutRoots)))
    collected.push(...(await this.startAppReader()))

    const unique: AppEntry[] = []
    const seen = new Set<string>()
    for (const entry of collected) {
      if (!entry.name.trim() || !entry.launch || !entry.launch.length) {
        continue
      }
      if (isRestrictedPackagePath(entry)) {
        continue
      }
      const marker = `${keyOf(entry.name)}\u0000${entry.launch.join('\u0000')}\u0000${
        entry.shell ? '1' : '0'
      }`
      if (seen.has(marker)) {
        continue
      }
      seen.add(marker)
      unique.push(entry)
    }

    this.entries = unique
    this.entriesAt = now
    return this.entries
  }

  private bestFuzzy(entries: readonly AppEntry[], spoken: string): AppEntry | null {
    const key = keyOf(spoken)
    const tokens = tokensOf(spoken)
    if (!key) {
      return null
    }

    let best: { score: readonly (number | string)[]; entry: AppEntry } | null = null
    for (const entry of entries) {
      const score = fuzzyScore(entry, key, tokens)
      if (score === null) {
        continue
      }
      if (best === null || compareTuple(score, best.score) < 0) {
        best = { score, entry }
      }
    }
    return best === null ? null : best.entry
  }
}

function fuzzyScore(
  entry: AppEntry,
  spokenKey: string,
  spokenTokens: readonly string[]
): readonly (number | string)[] | null {
  const entryKey = keyOf(entry.name)
  if (!entryKey) {
    return null
  }

  const entryTokens = tokensOf(entry.name)
  const tokenMatch =
    spokenTokens.length > 0 &&
    spokenTokens.every((token) => entryTokens.includes(token))
  const keyMatch =
    spokenKey.length >= 6 &&
    (entryKey.startsWith(spokenKey) ||
      (spokenKey.startsWith(entryKey) && entryKey.length >= 6))
  if (!(tokenMatch || keyMatch)) {
    return null
  }

  return [
    entryKey.startsWith(spokenKey) ? 0 : 1,
    Math.abs(entryKey.length - spokenKey.length),
    entry.name.length,
    sourcePriority(entry.source),
    entry.name.toLowerCase()
  ]
}

interface CaptureResult {
  code: number
  stdout: string
}

function runCapture(
  command: string,
  args: readonly string[],
  timeoutMs: number
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        windowsHide: true,
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024
      },
      (error, stdout) => {
        if (error) {
          const code = typeof error.code === 'number' ? error.code : 1
          resolve({ code, stdout: '' })
          return
        }
        resolve({ code: 0, stdout: stdout ?? '' })
      }
    )
  })
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory()
  } catch {
    return false
  }
}

async function which(name: string): Promise<string | null> {
  const tool = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = await runCapture(tool, [name], 5000)
  if (result.code !== 0) {
    return null
  }
  const first = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return first ?? null
}

function expandVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => {
    const found = process.env[name]
    return found === undefined ? match : found
  })
}

function fileStem(file: string): string {
  const base = path.win32.basename(file)
  const extension = path.win32.extname(base)
  return extension ? base.slice(0, -extension.length) : base
}

function parseSubkeys(output: string, fullKey: string): string[] {
  const prefix = `${fullKey}\\`
  const prefixLower = prefix.toLowerCase()
  const subkeys: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.toLowerCase().startsWith(prefixLower)) {
      continue
    }
    const rest = trimmed.slice(prefix.length)
    if (!rest || rest.includes('\\')) {
      continue
    }
    subkeys.push(`${fullKey}\\${rest}`)
  }
  return subkeys
}

function parseDefaultValue(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\s(REG_[A-Z0-9_]+)\s{2,}(.*)$/)
    if (!match) {
      continue
    }
    const type = match[1]
    if (type !== 'REG_SZ' && type !== 'REG_EXPAND_SZ') {
      continue
    }
    const value = match[2].trim()
    if (value) {
      return value
    }
  }
  return null
}

export async function readAppPathEntries(): Promise<AppEntry[]> {
  if (process.platform !== 'win32') {
    return []
  }

  const base = 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths'
  const locations: Array<{ hive: 'HKCU' | 'HKLM'; full: string; view?: string }> = [
    {
      hive: 'HKCU',
      full: `HKEY_CURRENT_USER\\${base}`
    },
    {
      hive: 'HKLM',
      full: `HKEY_LOCAL_MACHINE\\${base}`,
      view: '/reg:64'
    },
    {
      hive: 'HKLM',
      full: `HKEY_LOCAL_MACHINE\\${base}`,
      view: '/reg:32'
    }
  ]

  const entries: AppEntry[] = []
  for (const location of locations) {
    const viewArgs = location.view ? [location.view] : []
    const index = await runCapture(
      'reg.exe',
      ['query', `${location.hive}\\${base}`, ...viewArgs],
      5000
    )
    if (index.code !== 0) {
      continue
    }

    for (const subkey of parseSubkeys(index.stdout, location.full)) {
      const queried = await runCapture(
        'reg.exe',
        ['query', subkey, '/ve', ...viewArgs],
        5000
      )
      if (queried.code !== 0) {
        continue
      }
      const raw = parseDefaultValue(queried.stdout)
      if (raw === null) {
        continue
      }
      const pathText = expandVars(raw.replace(/^"+/, '').replace(/"+$/, ''))
      if (!pathText || !(await isFile(pathText))) {
        continue
      }
      const name = fileStem(subkey) || fileStem(pathText)
      if (name) {
        entries.push({
          name,
          launch: [pathText],
          source: 'app_paths'
        })
      }
    }
  }
  return entries
}

async function collectShortcuts(directory: string, found: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectShortcuts(full, found)
      continue
    }
    if (entry.isFile() || (entry.isSymbolicLink() && (await isFile(full)))) {
      found.push(full)
    }
  }
}

export async function shortcutEntries(roots: readonly string[]): Promise<AppEntry[]> {
  const entries: AppEntry[] = []
  const suffixes = new Set(['.lnk', '.appref-ms'])
  for (const root of roots) {
    if (!(await isDirectory(root))) {
      continue
    }
    const files: string[] = []
    await collectShortcuts(root, files)
    for (const file of files) {
      if (!suffixes.has(path.extname(file).toLowerCase())) {
        continue
      }
      entries.push({
        name: path.parse(file).name,
        launch: [file],
        shell: true,
        source: 'shortcut'
      })
    }
  }
  return entries
}

export function defaultShortcutRoots(): string[] {
  const roots: string[] = []
  const appData = process.env.APPDATA
  if (appData) {
    roots.push(
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    )
  }
  const programData = process.env.PROGRAMDATA
  if (programData) {
    roots.push(
      path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    )
  }
  const userProfile = process.env.USERPROFILE
  if (userProfile) {
    roots.push(path.join(userProfile, 'Desktop'))
  }
  const publicRoot = process.env.PUBLIC
  if (publicRoot) {
    roots.push(path.join(publicRoot, 'Desktop'))
  }
  return roots
}

const START_APPS_SCRIPT =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' +
  'Get-StartApps | Select-Object Name, AppID | ' +
  'ConvertTo-Json -Compress'

async function resolvePowerShell(): Promise<string> {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot) {
    const candidate = path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
    if (await isFile(candidate)) {
      return candidate
    }
  }
  const located = await runCapture('where.exe', ['powershell.exe'], 5000)
  if (located.code === 0) {
    const first = located.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (first) {
      return first
    }
  }
  return 'powershell.exe'
}

export async function readStartAppEntries(): Promise<AppEntry[]> {
  if (process.platform !== 'win32') {
    return []
  }

  const powershell = await resolvePowerShell()
  const completed = await runCapture(
    powershell,
    ['-NoProfile', '-NonInteractive', '-Command', START_APPS_SCRIPT],
    START_APPS_TIMEOUT_SECONDS * 1000
  )
  if (completed.code !== 0) {
    return []
  }

  const payload = completed.stdout.trim()
  if (!payload) {
    return []
  }
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return []
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    data = [data]
  }
  if (!Array.isArray(data)) {
    return []
  }

  const entries: AppEntry[] = []
  for (const item of data) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const record = item as Record<string, unknown>
    const rawName = record['Name']
    const rawId = record['AppID']
    const name = rawName ? String(rawName).trim() : ''
    const appId = rawId ? String(rawId).trim() : ''
    if (!name || !appId) {
      continue
    }
    entries.push({
      name,
      launch: ['explorer.exe', `shell:AppsFolder\\${appId}`],
      source: 'start_app'
    })
  }
  return entries
}
