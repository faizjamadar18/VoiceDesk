import { describe, expect, it } from 'vitest'
import type { Tool, ToolContext } from '../types'
import {
  createDriveTools,
  extractFiles,
  matchFiles,
  parseComposioResult,
  readableError,
  type DriveFile
} from './drive'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface RecordedCall {
  slug: string
  args: Record<string, unknown>
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executor: {
      openApp: async () => undefined,
      openUrl: async () => undefined
    },
    clock: () => new Date('2026-11-07T09:41:12Z'),
    fileRoots: [],
    dryRun: false,
    fileOps: {
      createFolder: async () => '',
      createFile: async () => '',
      deleteFile: async () => '',
      resolveDeleteTarget: async (target) => target,
      removeCreated: async () => undefined
    },
    fileSearch: { search: async () => [] },
    weather: {
      fetch: async (location) => ({
        location,
        temperature: '',
        low: '',
        high: '',
        condition: '',
        icon: '',
        spoken: ''
      })
    },
    ...overrides
  }
}

/**
 * A fake `callTool` that records every call and returns the queued results in
 * order, so a test can describe a whole tool run as a short list of replies.
 */
function makeTools(
  results: Array<{ text: string; isError?: boolean }>
): { tools: Tool[]; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  let index = 0
  const tools = createDriveTools({
    callTool: async (slug, args) => {
      calls.push({ slug, args })
      const result = results[index] ?? { text: '{}' }
      index += 1
      return { text: result.text, isError: result.isError ?? false }
    }
  })
  return { tools, calls }
}

function toolNamed(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.spec.name === name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool
}

function fileRecord(
  id: string,
  name: string,
  mimeType = 'text/plain'
): Record<string, unknown> {
  return {
    id,
    name,
    mimeType,
    webViewLink: `https://drive.google.com/file/d/${id}`,
    modifiedTime: '2026-11-01T00:00:00Z'
  }
}

function driveFile(
  id: string,
  name: string,
  mimeType = 'text/plain'
): DriveFile {
  return {
    id,
    name,
    mimeType,
    webViewLink: null,
    modifiedTime: null,
    isFolder: mimeType === FOLDER_MIME
  }
}

function filesPayload(items: unknown[]): string {
  return JSON.stringify({ successful: true, data: { files: items } })
}

function okPayload(data: unknown): string {
  return JSON.stringify({ successful: true, data })
}

const INVALID_BODY =
  '{"successful":false,"data":{"message":"Invalid request data provided\\n- bad value."},"error":"Invalid request data provided"}'

describe('drive tool specs', () => {
  it('keeps every description short', () => {
    for (const tool of makeTools([]).tools) {
      expect(tool.spec.description.length).toBeLessThanOrEqual(200)
    }
  })

  it('exposes exactly four tools and confirms only the writes', () => {
    const { tools } = makeTools([])
    const byName = new Map(tools.map((tool) => [tool.spec.name, tool.spec]))

    expect([...byName.keys()].sort()).toEqual([
      'drive_create_file',
      'drive_delete_file',
      'drive_find_files',
      'drive_share_file'
    ])

    expect(byName.get('drive_find_files')?.risk).toBe('read')
    expect(byName.get('drive_find_files')?.requiresConfirmation).toBe(false)

    for (const name of [
      'drive_create_file',
      'drive_share_file',
      'drive_delete_file'
    ]) {
      expect(byName.get(name)?.risk).toBe('write')
      expect(byName.get(name)?.requiresConfirmation).toBe(true)
    }
  })
})

describe('drive_find_files', () => {
  it('searches by name and names the results', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('1', 'budget.xlsx')]) }
    ])

    const outcome = await toolNamed(tools, 'drive_find_files').run(
      { query: 'budget' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLESUPER_FIND_FILE')
    expect(String(calls[0].args['q'])).toContain('trashed = false')
    expect(String(calls[0].args['q'])).toContain("name contains 'budget'")
    expect(calls[0].args).toMatchObject({
      pageSize: 10,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.spokenResponse).toContain('I found 1 file')
    expect(outcome.spokenResponse).toContain('budget.xlsx')
  })

  it('adds a type clause and resolves a folder into a parents clause', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('f1', 'Finance', FOLDER_MIME)]) },
      { text: filesPayload([fileRecord('d1', 'budget.pdf', 'application/pdf')]) }
    ])

    const outcome = await toolNamed(tools, 'drive_find_files').run(
      { type: 'pdf', folder: 'Finance' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(String(calls[0].args['q'])).toContain("mimeType = 'application/vnd.google-apps.folder'")
    expect(String(calls[0].args['q'])).toContain("name contains 'Finance'")
    expect(String(calls[1].args['q'])).toContain("mimeType = 'application/pdf'")
    expect(String(calls[1].args['q'])).toContain("'f1' in parents")
    expect(outcome.status).toBe('ok')
  })

  it('reports zero results without erroring', async () => {
    const { tools } = makeTools([{ text: filesPayload([]) }])

    const outcome = await toolNamed(tools, 'drive_find_files').run(
      { query: 'unicorn' },
      makeContext()
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('I couldn\'t find anything matching "unicorn"')
  })
})

describe('drive_create_file', () => {
  it('defaults to plain text', async () => {
    const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

    const outcome = await toolNamed(tools, 'drive_create_file').run(
      { name: 'notes.txt', content: 'hello world' },
      makeContext()
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].slug).toBe('GOOGLESUPER_CREATE_FILE_FROM_TEXT')
    expect(calls[0].args).toMatchObject({
      file_name: 'notes.txt',
      text_content: 'hello world',
      mime_type: 'text/plain'
    })
    expect(outcome.status).toBe('ok')
  })

  it('uses the Google Doc mime type and resolves a folder to parent_id', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('f1', 'Docs', FOLDER_MIME)]) },
      { text: okPayload({ id: 'n' }) }
    ])

    const outcome = await toolNamed(tools, 'drive_create_file').run(
      { name: 'spec', content: 'body', format: 'document', folder: 'Docs' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(calls[1].args).toMatchObject({
      file_name: 'spec',
      mime_type: 'application/vnd.google-apps.document',
      parent_id: 'f1'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('inside "Docs"')
  })

  it('creates a blank document when no content was dictated', async () => {
    const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

    const outcome = await toolNamed(tools, 'drive_create_file').run(
      { name: 'shortlisted student' },
      makeContext({ transcript: 'create a Google Docs file named shortlisted student' })
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({
      file_name: 'shortlisted student',
      text_content: '',
      mime_type: 'application/vnd.google-apps.document'
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('blank')
  })

  it('infers Google Docs from the request when no format is passed', async () => {
    const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

    await toolNamed(tools, 'drive_create_file').run(
      { name: 'spec', content: 'body' },
      makeContext({ transcript: 'make a new doc called spec with body' })
    )

    expect(calls[0].args).toMatchObject({
      mime_type: 'application/vnd.google-apps.document'
    })
  })

  it("lets the user's words pick the file type over the planner's format", async () => {
    const cases: Array<{ transcript: string; format?: string; mime: string }> = [
      {
        transcript: 'create a Google Docs file named spec',
        format: 'text',
        mime: 'application/vnd.google-apps.document'
      },
      {
        transcript: 'create a spreadsheet named budget',
        mime: 'application/vnd.google-apps.spreadsheet'
      },
      {
        transcript: 'create a Google Sheets file named budget',
        format: 'document',
        mime: 'application/vnd.google-apps.spreadsheet'
      },
      {
        transcript: 'create a markdown file named notes',
        mime: 'text/markdown'
      },
      {
        transcript: 'create a txt file named notes',
        mime: 'text/plain'
      },
      {
        transcript: 'create a slide deck named kickoff',
        mime: 'application/vnd.google-apps.presentation'
      }
    ]

    for (const item of cases) {
      const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

      const outcome = await toolNamed(tools, 'drive_create_file').run(
        { name: 'spec', content: 'body', format: item.format },
        makeContext({ transcript: item.transcript })
      )

      expect(calls[0].args['mime_type']).toBe(item.mime)
      expect(outcome.status).toBe('ok')
    }
  })

  it('uses a file extension in the name as the strongest signal', async () => {
    const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

    await toolNamed(tools, 'drive_create_file').run(
      { name: 'notes.md', content: 'body', format: 'document' },
      makeContext({ transcript: 'create a Google Doc called notes' })
    )

    expect(calls[0].args['mime_type']).toBe('text/markdown')
  })

  it('treats My Drive and Google Drive as the root, not a folder', async () => {
    for (const folder of ['My Drive', 'my google drive', 'Google Drive']) {
      const { tools, calls } = makeTools([{ text: okPayload({ id: 'n' }) }])

      const outcome = await toolNamed(tools, 'drive_create_file').run(
        { name: 'notes.txt', content: 'body', folder },
        makeContext()
      )

      expect(calls.map((call) => call.slug)).toEqual([
        'GOOGLESUPER_CREATE_FILE_FROM_TEXT'
      ])
      expect(calls[0].args).not.toHaveProperty('parent_id')
      expect(outcome.status).toBe('ok')
    }
  })

  it('resolves a real subfolder after a My Drive prefix', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('f1', 'Docs', FOLDER_MIME)]) },
      { text: okPayload({ id: 'n' }) }
    ])

    const outcome = await toolNamed(tools, 'drive_create_file').run(
      { name: 'spec', content: 'body', folder: 'My Drive/Docs' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(String(calls[0].args['q'])).toContain("name contains 'Docs'")
    expect(calls[1].args).toMatchObject({ parent_id: 'f1' })
    expect(outcome.status).toBe('ok')
  })

  it('resolves the folder and offers the file name before approval', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('f1', 'Docs', FOLDER_MIME)]) }
    ])
    const tool = toolNamed(tools, 'drive_create_file')

    expect(tool.prepare).toBeTypeOf('function')
    const prepared = await tool.prepare?.(
      { name: 'shortlisted student', folder: 'My Drive/Docs' },
      makeContext({ transcript: 'create a docs file named shortlisted student' })
    )

    expect(prepared?.outcome).toBeUndefined()
    expect(prepared?.display).toBe('shortlisted student')
    expect(prepared?.message).toContain('shortlisted student')
    expect(prepared?.arguments).toMatchObject({
      name: 'shortlisted student',
      content: '',
      format: 'document',
      parent_id: 'f1'
    })
    expect(calls).toHaveLength(1)
  })

  it('refuses an empty name without calling Composio', async () => {
    const { tools, calls } = makeTools([])

    const emptyName = await toolNamed(tools, 'drive_create_file').run(
      { name: '', content: 'body' },
      makeContext()
    )

    expect(emptyName.status).toBe('error')
    expect(calls).toHaveLength(0)
  })
})

describe('drive_share_file', () => {
  it('refuses an invalid email address without calling Composio', async () => {
    const { tools, calls } = makeTools([])

    const outcome = await toolNamed(tools, 'drive_share_file').run(
      { file: 'budget.pdf', email: 'sam' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('I need an email address to share that with.')
    expect(calls).toHaveLength(0)
  })

  it('shares with the resolved role and maps edit to writer', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('d1', 'budget.pdf', 'application/pdf')]) },
      { text: okPayload({ id: 'perm-1' }) }
    ])

    const outcome = await toolNamed(tools, 'drive_share_file').run(
      { file: 'budget.pdf', email: 'sam@example.com', role: 'edit' },
      makeContext()
    )

    expect(calls).toHaveLength(2)
    expect(calls[1].slug).toBe('GOOGLESUPER_CREATE_PERMISSION')
    expect(calls[1].args).toMatchObject({
      file_id: 'd1',
      type: 'user',
      role: 'writer',
      email_address: 'sam@example.com',
      send_notification_email: true
    })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('sam@example.com')
    expect(outcome.message).toContain('editor')
  })
})

describe('drive_delete_file', () => {
  it('permanently deletes a resolved file and says so', async () => {
    const { tools, calls } = makeTools([
      { text: filesPayload([fileRecord('d1', 'old.pdf', 'application/pdf')]) },
      { text: okPayload({ id: 'd1' }) }
    ])

    const spec = toolNamed(tools, 'drive_delete_file').spec
    const outcome = await toolNamed(tools, 'drive_delete_file').run(
      { file: 'old.pdf' },
      makeContext()
    )

    expect(spec.requiresConfirmation).toBe(true)
    expect(calls.map((call) => call.slug)).toEqual([
      'GOOGLESUPER_FIND_FILE',
      'GOOGLESUPER_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION'
    ])
    expect(calls[1].args).toEqual({ fileId: 'd1', supportsAllDrives: true })
    expect(outcome.status).toBe('ok')
    expect(outcome.message).toContain('Deleted "old.pdf"')
    expect(outcome.message).toContain("This can't be undone")
    expect(outcome.spokenResponse).toContain('Deleted "old.pdf"')
  })
})

describe('extractFiles', () => {
  it('parses a stringified files payload', () => {
    const parsed = parseComposioResult(
      JSON.stringify({
        successful: true,
        data: JSON.stringify({
          files: [fileRecord('1', 'Notes', 'text/plain')]
        })
      })
    )

    expect(parsed.ok).toBe(true)
    const files = extractFiles(parsed.data)

    expect(files).toEqual([
      {
        id: '1',
        name: 'Notes',
        mimeType: 'text/plain',
        webViewLink: 'https://drive.google.com/file/d/1',
        modifiedTime: '2026-11-01T00:00:00Z',
        isFolder: false
      }
    ])
  })

  it('prefers a files key and recurses into nested payloads', () => {
    const files = extractFiles({
      data: { files: [fileRecord('2', 'Folder', FOLDER_MIME)] }
    })

    expect(files).toHaveLength(1)
    expect(files[0].isFolder).toBe(true)
    expect(files[0].id).toBe('2')
  })
})

describe('matchFiles', () => {
  const budget = driveFile('1', 'Budget')
  const report = driveFile('2', 'Budget report')
  const expense = driveFile('3', 'Expense report')

  it('prefers an exact name over a partial match', () => {
    const result = matchFiles('Budget', [budget, report])

    expect(result).toEqual({ ok: true, file: budget })
  })

  it('reports ambiguity when several names contain the query', () => {
    const result = matchFiles('report', [report, expense])

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ambiguous')
      expect(result.candidates.map((file) => file.name)).toEqual([
        'Budget report',
        'Expense report'
      ])
    }
  })

  it('matches every whitespace-separated token in any order', () => {
    const result = matchFiles('report budget', [report])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.file.name).toBe('Budget report')
  })

  it('treats an empty query as not found', () => {
    expect(matchFiles('', [budget])).toEqual({
      ok: false,
      reason: 'not_found',
      candidates: []
    })
  })
})

describe('dry-run mode', () => {
  it('reports what would run without calling Composio', async () => {
    const { tools, calls } = makeTools([])
    const ctx = makeContext({ dryRun: true })

    const outcomes = await Promise.all([
      toolNamed(tools, 'drive_find_files').run({ query: 'x' }, ctx),
      toolNamed(tools, 'drive_create_file').run(
        { name: 'X', content: 'Y' },
        ctx
      ),
      toolNamed(tools, 'drive_share_file').run(
        { file: 'A', email: 'a@b.com' },
        ctx
      ),
      toolNamed(tools, 'drive_delete_file').run({ file: 'A' }, ctx)
    ])

    for (const outcome of outcomes) {
      expect(outcome.status).toBe('ok')
      expect(outcome.message).toMatch(/^Would run /)
    }
    expect(calls).toHaveLength(0)
  })
})

describe('Composio errors', () => {
  it('turns an isError response into one short line', async () => {
    const { tools } = makeTools([{ text: INVALID_BODY, isError: true }])

    const outcome = await toolNamed(tools, 'drive_find_files').run(
      { query: 'x' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('Invalid request data provided')
    expect(outcome.message).not.toContain('{"successful"')
  })

  it('turns a successful:false body into a readable error', async () => {
    const { tools } = makeTools([
      { text: JSON.stringify({ successful: false, error: 'boom' }) }
    ])

    const outcome = await toolNamed(tools, 'drive_find_files').run(
      { query: 'x' },
      makeContext()
    )

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('boom')
  })

  it('unwraps a nested Google error instead of stopping at the first brace', () => {
    const nested = JSON.stringify({
      error: {
        code: 403,
        message: "The user's Drive storage quota has been exceeded."
      }
    })
    const body = JSON.stringify({
      successful: false,
      data: { message: nested, status_code: 403 },
      error: nested
    })

    expect(readableError(body)).toBe(
      "The user's Drive storage quota has been exceeded."
    )
  })

  it('re-exports the shared error helpers', () => {
    expect(readableError('')).toBe('The app returned an error.')
  })
})
