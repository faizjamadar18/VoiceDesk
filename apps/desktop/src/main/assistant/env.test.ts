/**
 * Tests for the minimal `.env` loader used by the assistant main process.
 * They mirror the `python-dotenv` behavior the old backend relied on:
 * `KEY=VALUE`, comments, quoted values, and no override of live variables.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnvFile, loadEnvFiles } from './env'

const touched = new Set<string>()
const dirs: string[] = []

function writeEnv(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-env-'))
  dirs.push(dir)
  const path = join(dir, '.env')
  writeFileSync(path, contents, 'utf8')
  return path
}

function remember(key: string): void {
  touched.add(key)
}

beforeEach(() => {
  touched.clear()
})

afterEach(() => {
  for (const key of touched) delete process.env[key]
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('loadEnvFile', () => {
  it('reads simple, quoted, and commented values', () => {
    remember('KESTREL_TEST_ALPHA')
    remember('KESTREL_TEST_BETA')
    remember('KESTREL_TEST_GAMMA')

    const path = writeEnv(
      [
        '# a comment',
        '',
        'export KESTREL_TEST_ALPHA=alpha',
        'KESTREL_TEST_BETA="beta value"',
        "KESTREL_TEST_GAMMA='gamma # not a comment'"
      ].join('\n')
    )

    loadEnvFile(path)

    expect(process.env.KESTREL_TEST_ALPHA).toBe('alpha')
    expect(process.env.KESTREL_TEST_BETA).toBe('beta value')
    expect(process.env.KESTREL_TEST_GAMMA).toBe('gamma # not a comment')
  })

  it('strips a trailing inline comment from an unquoted value', () => {
    remember('KESTREL_TEST_INLINE')
    const path = writeEnv('KESTREL_TEST_INLINE=value # comment\n')

    loadEnvFile(path)

    expect(process.env.KESTREL_TEST_INLINE).toBe('value')
  })

  it('does not override an existing variable', () => {
    remember('KESTREL_TEST_EXISTING')
    process.env.KESTREL_TEST_EXISTING = 'original'
    const path = writeEnv('KESTREL_TEST_EXISTING=replacement\n')

    loadEnvFile(path)

    expect(process.env.KESTREL_TEST_EXISTING).toBe('original')
  })

  it('ignores a missing file', () => {
    expect(() => loadEnvFile(join(tmpdir(), 'kestrel-does-not-exist.env'))).not.toThrow()
  })
})

describe('loadEnvFiles', () => {
  it('lets the first file win', () => {
    remember('KESTREL_TEST_ORDER')
    const first = writeEnv('KESTREL_TEST_ORDER=first\n')
    const second = writeEnv('KESTREL_TEST_ORDER=second\n')

    loadEnvFiles([first, second])

    expect(process.env.KESTREL_TEST_ORDER).toBe('first')
  })
})
