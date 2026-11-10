import { describe, expect, it } from 'vitest'
import {
  fileKind,
  fileKindBadge,
  formatFileModified,
  formatFileSize
} from './file-display'

describe('file display helpers', () => {
  it('formats byte sizes with readable units', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1_536)).toBe('1.5 KB')
    expect(formatFileSize(10 * 1024)).toBe('10 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatFileSize(Number.NaN)).toBe('—')
    expect(formatFileSize(null)).toBe('—')
  })

  it('uses a short badge and coarse kind per extension', () => {
    expect(fileKindBadge('2025 tax return.pdf')).toBe('PDF')
    expect(fileKindBadge('notes.markdown')).toBe('MD')
    expect(fileKindBadge('archive.7z')).toBe('7Z')
    expect(fileKindBadge('README')).toBe('FILE')
    expect(fileKind('return.pdf')).toBe('pdf')
    expect(fileKind('budget.xlsx')).toBe('sheet')
    expect(fileKind('photo.JPG')).toBe('image')
    expect(fileKind('script.ts')).toBe('code')
    expect(fileKind('unknown.bin')).toBe('file')
  })

  it('formats valid modified timestamps and ignores invalid ones', () => {
    const midday = new Date(2025, 2, 14, 12, 0, 0)
    expect(formatFileModified(midday.toISOString())).toBe('Mar 14, 2025')
    expect(formatFileModified('not a date')).toBe('')
  })
})
