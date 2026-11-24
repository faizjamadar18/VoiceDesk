import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'

export type AppDataMigrationOutcome =
  | 'copied'
  | 'skipped-existing-data'
  | 'skipped-no-legacy'
  | 'failed'

export interface AppDataMigrationResult {
  migrated: boolean
  outcome: AppDataMigrationOutcome
  copiedFrom: string[]
  error?: string
}

const OWN_DATA_FILES = new Set(['voiceos.db', 'kestrel.db', 'config.json'])
const OWN_DATA_FILE_PATTERN = /^kestrel-.*\.json$/

/**
 * Checks whether a directory already contains app-specific database or configuration files,
 * indicating that existing user data is present and should not be overwritten.
 *
 * @param dir - Target directory path to inspect.
 * @returns True if existing user data files are discovered.
 */
function hasOwnData(dir: string): boolean {
  if (!existsSync(dir)) {
    return false
  }

  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) =>
      entry.isFile() &&
      (OWN_DATA_FILES.has(entry.name) || OWN_DATA_FILE_PATTERN.test(entry.name))
  )
}

function failure(error: unknown, copiedFrom: string[]): AppDataMigrationResult {
  return {
    migrated: false,
    outcome: 'failed',
    copiedFrom,
    error: error instanceof Error ? error.message : String(error)
  }
}

/**
 * One-time merge of the previous app's userData folders into the new one.
 *
 * Electron derives the userData directory from the app name, so renaming the
 * app points it at a fresh folder. Electron also creates its own scaffolding
 * there before startup, so the copy only fills in missing files and never
 * overwrites what already exists. The legacy folders are never modified, so a
 * failed copy can always be retried.
 */
export function migrateUserData({
  legacyDirs,
  currentDir
}: {
  legacyDirs: string[]
  currentDir: string
}): AppDataMigrationResult {
  const copiedFrom: string[] = []

  try {
    // Electron scaffolding alone does not mean the user already has data here;
    // only our own files make the migration unnecessary.
    if (hasOwnData(currentDir)) {
      return { migrated: false, outcome: 'skipped-existing-data', copiedFrom }
    }

    for (const legacyDir of legacyDirs) {
      if (!existsSync(legacyDir)) {
        continue
      }

      try {
        mkdirSync(currentDir, { recursive: true })
        // `force: false` keeps Electron's scaffolding and any files already in
        // the new folder. Later legacy folders only fill in missing files.
        cpSync(legacyDir, currentDir, {
          recursive: true,
          force: false,
          errorOnExist: false
        })
        copiedFrom.push(legacyDir)
      } catch (error) {
        return failure(error, copiedFrom)
      }
    }

    if (copiedFrom.length === 0) {
      return { migrated: false, outcome: 'skipped-no-legacy', copiedFrom }
    }

    return { migrated: true, outcome: 'copied', copiedFrom }
  } catch (error) {
    return failure(error, copiedFrom)
  }
}
