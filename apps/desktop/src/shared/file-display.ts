const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'archive' | 'code' | 'file'

const BADGES: Record<string, string> = {
  jpeg: 'JPG',
  jpg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WEBP',
  svg: 'SVG',
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOC',
  rtf: 'RTF',
  xls: 'XLS',
  xlsx: 'XLS',
  csv: 'CSV',
  ppt: 'PPT',
  pptx: 'PPT',
  txt: 'TXT',
  md: 'MD',
  markdown: 'MD',
  json: 'JSON',
  js: 'JS',
  ts: 'TS',
  tsx: 'TSX',
  jsx: 'JSX',
  zip: 'ZIP',
  rar: 'RAR',
  '7z': '7Z',
  exe: 'EXE',
  bat: 'BAT',
  cmd: 'CMD',
  ps1: 'PS1',
  lnk: 'LNK',
  msi: 'MSI',
  vbs: 'VBS',
  jar: 'JAR'
}

const KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  rtf: 'doc',
  txt: 'doc',
  md: 'doc',
  markdown: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  json: 'code',
  html: 'code',
  css: 'code',
  py: 'code',
  ps1: 'code'
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** Short badge text for the file-type icon (max four characters). */
export function fileKindBadge(name: string): string {
  const extension = fileExtension(name)
  if (!extension) return 'FILE'
  return BADGES[extension] ?? extension.toUpperCase().slice(0, 4)
}

export function fileKind(name: string): FileKind {
  return KINDS[fileExtension(name)] ?? 'file'
}

/** Human-sized file sizes; exact bytes below 1 KB. */
export function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return '—'
  if (sizeBytes < 1024) return `${Math.round(sizeBytes)} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = sizeBytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

/** Short local date for the result row; empty when the timestamp is unusable. */
export function formatFileModified(modified: string): string {
  const date = new Date(modified)
  if (Number.isNaN(date.getTime())) return ''
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}
