/**
 * Safe, local-only filesystem helpers for Kestrel's file tools.
 *
 * Nothing here reads file contents or uploads anything. Searches are bounded
 * (max depth, skipped heavy directories) so a single command can never walk the
 * whole disk.
 *
 * Writes follow the OS model: the user may name any folder they can reach, and
 * only system locations are refused. Destructive actions are never performed
 * here without the caller having confirmed them first, and deletion always goes
 * to the Windows Recycle Bin -- never a permanent unlink.
 */

import { execFile } from 'node:child_process'
import { mkdir, open, readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const MAX_DEPTH = 4
export const DEFAULT_LIMIT = 20

// Directories that are large, hidden, or system-owned. Never descended into.
export const SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  'appdata',
  'node_modules',
  '$recycle.bin',
  'windows',
  'program files',
  'program files (x86)',
  '__pycache__',
  'venv',
  'dist',
  'build'
])

// Spoken folder names mapped to the user's real shell folders.
export const KNOWN_FOLDER_ALIASES: Record<string, string> = {
  desktop: 'desktop',
  documents: 'documents',
  document: 'documents',
  downloads: 'downloads',
  download: 'downloads',
  pictures: 'pictures',
  photos: 'pictures',
  music: 'music',
  videos: 'videos',
  video: 'videos'
}

// Any path component matching one of these is refused for writes. The OS itself
// blocks most of these without admin, but Kestrel refuses first and honestly.
export const BLOCKED_DIR_NAMES: readonly string[] = [
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'appdata',
  'local settings',
  '$recycle.bin',
  'system volume information',
  'perflogs',
  'recovery'
]

const BLOCKED_SET: ReadonlySet<string> = new Set(BLOCKED_DIR_NAMES)

const SHELL_FOLDER_DEFAULTS: Record<string, string> = {
  desktop: 'Desktop',
  documents: 'Documents',
  downloads: 'Downloads',
  pictures: 'Pictures',
  music: 'Music',
  videos: 'Videos'
}

// Registry value names for the real user shell folders (Windows only).
const SHELL_FOLDER_REGISTRY: Record<string, string> = {
  desktop: 'Desktop',
  documents: 'Personal',
  downloads: '{374DE290-123F-4565-9164-39C4925E467B}',
  pictures: 'My Pictures',
  music: 'My Music',
  videos: 'My Video'
}

const USER_SHELL_FOLDERS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

export class UnsafeLocation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeLocation'
  }
}

export class LocationNotFound extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocationNotFound'
  }
}

export class TargetExists extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TargetExists'
  }
}

export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileNotFoundError'
  }
}

export class InvalidNameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidNameError'
  }
}

export type KnownFolders = Record<string, string>

export type FileSearchResult = {
  name: string
  path: string
  sizeBytes: number
  modified: string
}

export async function defaultKnownFolders(home?: string): Promise<KnownFolders> {
  const base = home ?? os.homedir()
  const folders: KnownFolders = {}
  for (const [name, fallback] of Object.entries(SHELL_FOLDER_DEFAULTS)) {
    folders[name] = path.join(base, fallback)
  }
  if (process.platform === 'win32') {
    Object.assign(folders, await windowsShellFolders())
  }
  return folders
}

function runRegQuery(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'reg.exe',
      ['query', key],
      {
        windowsHide: true,
        timeout: 5000,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024
      },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        resolve(stdout ?? '')
      }
    )
  })
}

function expandVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => {
    const found = process.env[name]
    return found === undefined ? match : found
  })
}

async function windowsShellFolders(): Promise<KnownFolders> {
  const output = await runRegQuery(USER_SHELL_FOLDERS_KEY)
  if (output === null) {
    return {}
  }

  const values: Record<string, string> = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(.+?)\s+(REG_[A-Z0-9_]+)\s+(.*)$/)
    if (!match) {
      continue
    }
    const valueName = match[1].trim()
    const raw = match[3].trim()
    if (raw) {
      values[valueName] = raw
    }
  }

  const folders: KnownFolders = {}
  for (const [name, valueName] of Object.entries(SHELL_FOLDER_REGISTRY)) {
    const raw = values[valueName]
    if (raw !== undefined && raw.trim()) {
      folders[name] = path.resolve(expandVars(raw))
    }
  }
  return folders
}

function systemRoots(): string[] {
  const roots: string[] = []
  for (const variable of [
    'WINDIR',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMDATA',
    'LOCALAPPDATA',
    'APPDATA'
  ]) {
    const value = process.env[variable]
    if (!value) {
      continue
    }
    roots.push(path.resolve(value))
  }
  return roots
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isInside(inner: string, outer: string): boolean {
  const innerKey = pathKey(inner)
  const outerKey = pathKey(outer)
  return (
    innerKey === outerKey || innerKey.startsWith(`${outerKey}${path.sep}`)
  )
}

function relativeParts(from: string, to: string): string[] | null {
  const relative = path.relative(from, to)
  if (relative === '') {
    return []
  }
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null
  }
  return relative.split(path.sep).filter(Boolean)
}

function isBlocked(home: string, target: string): boolean {
  const resolved = path.resolve(target)
  const relative = relativeParts(home, resolved)
  if (relative !== null) {
    return relative.some((part) => BLOCKED_SET.has(part.toLowerCase()))
  }

  for (const root of systemRoots()) {
    if (isInside(resolved, root)) {
      return true
    }
  }
  return resolved
    .split(path.sep)
    .filter(Boolean)
    .some((part) => BLOCKED_SET.has(part.toLowerCase()))
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile()
  } catch {
    return false
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

function expandUser(raw: string, home: string): string {
  if (raw === '~') {
    return home
  }
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(home, raw.slice(2))
  }
  return raw
}

function hasFileSuffix(name: string): boolean {
  const base = path.basename(name)
  const index = base.lastIndexOf('.')
  return index > 0 && index < base.length - 1
}

function isoUtc(date: Date): string {
  return date.toISOString().replace(/Z$/, '+00:00')
}

type Trash = (target: string) => void | Promise<void>

async function defaultTrash(target: string): Promise<void> {
  const { shell } = await import('electron')
  await shell.trashItem(target)
}

export interface FileOpsOptions {
  knownFolders?: KnownFolders
  trash?: Trash
}

export class FileOps {
  private readonly home: string
  private readonly providedKnown: KnownFolders | null
  private readonly trashImpl: Trash
  private knownPromise: Promise<KnownFolders> | null = null

  constructor(home?: string, options: FileOpsOptions = {}) {
    this.home = path.resolve(home ?? os.homedir())
    this.providedKnown = options.knownFolders ?? null
    this.trashImpl = options.trash ?? defaultTrash
  }

  private known(): Promise<KnownFolders> {
    if (this.providedKnown !== null) {
      return Promise.resolve(this.providedKnown)
    }
    if (this.knownPromise === null) {
      this.knownPromise = defaultKnownFolders(this.home)
    }
    return this.knownPromise
  }

  private async knownDir(name: string): Promise<string> {
    const known = await this.known()
    const folder = known[name] ?? path.join(this.home, SHELL_FOLDER_DEFAULTS[name])
    return path.isAbsolute(folder)
      ? path.resolve(folder)
      : path.join(this.home, folder)
  }

  private async requireDir(target: string): Promise<string> {
    if (isBlocked(this.home, target)) {
      throw new UnsafeLocation(`Kestrel won't write inside ${target}.`)
    }
    if (!(await isDirectory(target))) {
      throw new LocationNotFound(`I couldn't find the folder "${target}".`)
    }
    return target
  }

  private async child(base: string, name: string): Promise<string> {
    const cleaned = name
      .trim()
      .replace(/^["']+/, '')
      .replace(/["']+$/, '')
    if (!cleaned) {
      throw new InvalidNameError('A name is required.')
    }
    if (
      cleaned === '.' ||
      cleaned === '..' ||
      cleaned.includes('/') ||
      cleaned.includes('\\') ||
      path.basename(cleaned) !== cleaned
    ) {
      throw new UnsafeLocation(
        `"${name}" is not a plain name. Tell me the folder separately.`
      )
    }
    const target = path.resolve(base, cleaned)
    if (path.dirname(target) !== base) {
      throw new UnsafeLocation("Kestrel won't write outside the chosen folder.")
    }
    if (isBlocked(this.home, target)) {
      throw new UnsafeLocation(`Kestrel won't write inside ${target}.`)
    }
    return target
  }

  async search(
    query: string,
    roots: Iterable<string>,
    limit: number = DEFAULT_LIMIT
  ): Promise<FileSearchResult[]> {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    if (tokens.length === 0) {
      return []
    }

    const matches: FileSearchResult[] = []
    for (const root of roots) {
      if (!(await isDirectory(root))) {
        continue
      }
      await this.walk(root, tokens, matches, 0)
    }

    matches.sort((left, right) => {
      if (left.modified < right.modified) {
        return 1
      }
      if (left.modified > right.modified) {
        return -1
      }
      return 0
    })
    return matches.slice(0, limit)
  }

  private async walk(
    root: string,
    tokens: readonly string[],
    matches: FileSearchResult[],
    depth: number
  ): Promise<void> {
    let entries
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const target = path.join(root, entry.name)
      let file = entry.isFile()
      if (!file && entry.isSymbolicLink()) {
        file = await isFile(target)
      }
      if (!file) {
        continue
      }
      if (!tokens.every((token) => entry.name.toLowerCase().includes(token))) {
        continue
      }
      let details
      try {
        details = await stat(target)
      } catch {
        continue
      }
      matches.push({
        name: entry.name,
        path: target,
        sizeBytes: details.size,
        modified: isoUtc(details.mtime)
      })
    }

    if (depth >= MAX_DEPTH) {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !usableDirectory(entry.name)) {
        continue
      }
      await this.walk(path.join(root, entry.name), tokens, matches, depth + 1)
    }
  }

  async resolveLocation(location?: string | null): Promise<string> {
    if (location === null || location === undefined || !location.trim()) {
      return this.requireDir(await this.knownDir('desktop'))
    }

    const raw = location
      .trim()
      .replace(/^["']+/, '')
      .replace(/["']+$/, '')
    let collapsed = raw.toLowerCase()
    for (const article of ['the ', 'my ', 'our ']) {
      if (collapsed.startsWith(article)) {
        collapsed = collapsed.slice(article.length)
        break
      }
    }

    const known = KNOWN_FOLDER_ALIASES[collapsed.trim()]
    if (known !== undefined) {
      return this.requireDir(await this.knownDir(known))
    }

    const candidate = expandVars(expandUser(raw, this.home))
    const resolved = path.resolve(this.home, candidate)
    return this.requireDir(resolved)
  }

  async createFolder(name: string, location?: string | null): Promise<string> {
    const base = await this.resolveLocation(location)
    const target = await this.child(base, name)
    if (await exists(target)) {
      throw new TargetExists(
        `"${path.basename(target)}" already exists in ${base}.`
      )
    }
    await mkdir(target)
    return target
  }

  async createFile(name: string, location?: string | null): Promise<string> {
    const base = await this.resolveLocation(location)
    let cleaned = name
      .trim()
      .replace(/^["']+/, '')
      .replace(/["']+$/, '')
    if (cleaned && !hasFileSuffix(cleaned)) {
      cleaned = `${cleaned}.txt`
    }
    const target = await this.child(base, cleaned)
    if (await exists(target)) {
      throw new TargetExists(
        `"${path.basename(target)}" already exists in ${base}.`
      )
    }
    const handle = await open(target, 'wx')
    await handle.close()
    return target
  }

  async resolveDeleteTarget(target: string): Promise<string> {
    if (!path.isAbsolute(target)) {
      throw new UnsafeLocation('Refusing to touch a relative path.')
    }
    const resolved = path.resolve(target)
    if (isBlocked(this.home, resolved)) {
      throw new UnsafeLocation("Kestrel won't touch files inside system folders.")
    }
    if (!(await isFile(resolved))) {
      throw new FileNotFoundError(`"${path.basename(resolved)}" is no longer there.`)
    }
    return resolved
  }

  async deleteFile(target: string): Promise<string> {
    const resolved = await this.resolveDeleteTarget(target)
    await this.trashImpl(resolved)
    return resolved
  }

  async removeCreated(target: string): Promise<void> {
    const resolved = path.resolve(target)
    if (isBlocked(this.home, resolved)) {
      throw new UnsafeLocation(`Kestrel won't write inside ${resolved}.`)
    }
    if (await exists(resolved)) {
      await this.trashImpl(resolved)
    }
  }
}

function usableDirectory(name: string): boolean {
  return !name.startsWith('.') && !SKIP_DIR_NAMES.has(name.toLowerCase())
}

export class DirectFileSearch {
  private readonly fileOps: FileOps
  private readonly roots: readonly string[]

  constructor(fileOps: FileOps, roots: Iterable<string>) {
    this.fileOps = fileOps
    this.roots = [...roots]
  }

  search(query: string, limit: number = DEFAULT_LIMIT): Promise<FileSearchResult[]> {
    return this.fileOps.search(query, this.roots, limit)
  }
}
