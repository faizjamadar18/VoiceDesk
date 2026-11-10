"""In-memory store for write actions awaiting the user's approval.

No database: pending actions live for the lifetime of the process. Each record
keeps the tool name, its arguments, and (once executed) the outcome so a
confirmed plan can be reported and undone without re-running it.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from app.tools import ToolOutcome


@dataclass
class PendingAction:
    """A write action waiting for confirmation, or already decided."""

    plan_id: str
    tool: str
    arguments: dict
    state: str = "pending"  # "pending" | "done" | "cancelled"
    outcome: ToolOutcome | None = None


class PendingStore:
    """Holds pending actions keyed by an opaque ``plan_id``."""

    def __init__(self) -> None:
        self._records: dict[str, PendingAction] = {}
        self._by_key: dict[str, str] = {}

    def create(
        self,
        tool: str,
        arguments: dict,
        *,
        idempotency_key: str | None = None,
    ) -> str:
        """Store a pending action and return its ``plan_id``.

        If ``idempotency_key`` matches an existing record, the existing
        ``plan_id`` is returned so a retry cannot queue a duplicate.
        """
        if idempotency_key is not None:
            existing = self._by_key.get(idempotency_key)
            if existing is not None:
                return existing

        plan_id = uuid4().hex
        self._records[plan_id] = PendingAction(
            plan_id=plan_id,
            tool=tool,
            arguments=dict(arguments),
        )
        if idempotency_key is not None:
            self._by_key[idempotency_key] = plan_id
        return plan_id

    def get(self, plan_id: str) -> PendingAction | None:
        return self._records.get(plan_id)

    def cancel(self, plan_id: str) -> None:
        record = self._records.get(plan_id)
        if record is not None:
            record.state = "cancelled"

    def mark_done(self, plan_id: str, outcome: ToolOutcome) -> None:
        record = self._records.get(plan_id)
        if record is not None:
            record.state = "done"
            record.outcome = outcome

    def undo_info(self, plan_id: str) -> ToolOutcome | None:
        """Return the recorded outcome needed to undo this action, if any."""
        record = self._records.get(plan_id)
        if record is None or record.state != "done":
            return None
        return record.outcome
