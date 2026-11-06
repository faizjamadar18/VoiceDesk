import { describe, expect, it } from 'vitest'
import { FakePasteService } from './paste'

describe('FakePasteService', () => {
  it('records each pasted string in order', async () => {
    const paste = new FakePasteService()

    await paste.paste('Hello world')
    await paste.paste('Second dictation')

    expect(paste.pasted).toEqual(['Hello world', 'Second dictation'])
  })
})
