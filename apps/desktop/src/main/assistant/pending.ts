/**
 * In-memory store for write actions awaiting the user's approval.
 *
 * Ported from apps/api/app/pending.py. No database: pending actions live for the
 * lifetime of the process. Each record keeps the tool name, its arguments, and
 * (once executed) the outcome so a confirmed plan can be reported and undone
 * without re-running it.
 */

import { randomBytes } from 'node:crypto'
import type { ToolOutcome } from './types'

export interface PendingAction {
  planId: string
  tool: string
  arguments: Record<string, unknown>
  /** 'pending' | 'done' | 'cancelled' */
  state: 'pending' | 'done' | 'cancelled'
  outcome: ToolOutcome | null
}

function uuid4Hex(): string {
  // Python's uuid4().hex: 16 random bytes rendered as 32 lowercase hex chars.
  return randomBytes(16).toString('hex')
}

/** Holds pending actions keyed by an opaque `planId`. */
export class PendingStore {
  private readonly records = new Map<string, PendingAction>()
  private readonly byKey = new Map<string, string>()

  /**
   * Store a pending action and return its `planId`.
   *
   * If `idempotencyKey` matches an existing record, the existing `planId` is
   * returned so a retry cannot queue a duplicate.
   */
  create(
    tool: string,
    args: Record<string, unknown>,
    options: { idempotencyKey?: string | null } = {}
  ): string {
    const idempotencyKey = options.idempotencyKey ?? null
    if (idempotencyKey !== null) {
      const existing = this.byKey.get(idempotencyKey)
      if (existing !== undefined) {
        return existing
      }
    }

    const planId = uuid4Hex()
    this.records.set(planId, {
      planId,
      tool,
      arguments: { ...args },
      state: 'pending',
      outcome: null
    })
    if (idempotencyKey !== null) {
      this.byKey.set(idempotencyKey, planId)
    }
    return planId
  }

  get(planId: string): PendingAction | undefined {
    return this.records.get(planId)
  }

  cancel(planId: string): void {
    const record = this.records.get(planId)
    if (record !== undefined) {
      record.state = 'cancelled'
    }
  }

  markDone(planId: string, outcome: ToolOutcome): void {
    const record = this.records.get(planId)
    if (record !== undefined) {
      record.state = 'done'
      record.outcome = outcome
    }
  }

  /** Return the recorded outcome needed to undo this action, if any. */
  undoInfo(planId: string): ToolOutcome | null {
    const record = this.records.get(planId)
    if (record === undefined || record.state !== 'done') {
      return null
    }
    return record.outcome
  }
}
