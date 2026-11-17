import { describe, expect, it, vi } from 'vitest'
import type { DeleteAccountResult } from '../../../../shared/types'
import { performAccountDeletion } from './AccountSettingsTab'

function handlers(result: DeleteAccountResult): {
  deleteAccount: ReturnType<typeof vi.fn<() => Promise<DeleteAccountResult>>>
  setBusy: ReturnType<typeof vi.fn<(busy: boolean) => void>>
  onError: ReturnType<typeof vi.fn<(message: string) => void>>
  onDeleted: ReturnType<typeof vi.fn<() => void>>
} {
  return {
    deleteAccount: vi.fn<() => Promise<DeleteAccountResult>>(async () => result),
    setBusy: vi.fn<(busy: boolean) => void>(),
    onError: vi.fn<(message: string) => void>(),
    onDeleted: vi.fn<() => void>()
  }
}

describe('performAccountDeletion', () => {
  it('calls the delete account IPC channel once and finishes on success', async () => {
    const spies = handlers({ ok: true })

    await performAccountDeletion(spies)

    expect(spies.deleteAccount).toHaveBeenCalledTimes(1)
    expect(spies.setBusy.mock.calls).toEqual([[true], [false]])
    expect(spies.onError).not.toHaveBeenCalled()
    expect(spies.onDeleted).toHaveBeenCalledTimes(1)
  })

  it('surfaces the returned error and keeps the dialog open', async () => {
    const spies = handlers({ ok: false, error: 'The server could not delete your account.' })

    await performAccountDeletion(spies)

    expect(spies.onError).toHaveBeenCalledWith('The server could not delete your account.')
    expect(spies.onDeleted).not.toHaveBeenCalled()
    expect(spies.setBusy.mock.calls).toEqual([[true], [false]])
  })
})
