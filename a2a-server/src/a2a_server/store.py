"""Transaction ledger — the telemetry contract Workforce OS reads.

One JSON line per finished (or failed) task, appended to
~/.baseline-workforce/a2a/transactions/YYYY-MM.jsonl. Workforce OS renders
its A2A task feed and spend telemetry straight from these files, so field
names here are a contract: change them and the dashboard goes blind.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from a2a_server.config import ensure_dirs, transactions_dir


@dataclass
class Transaction:
    taskId: str
    contextId: str
    skill: str
    state: str  # submitted | working | completed | failed | canceled
    startedAt: str
    endedAt: str = ""
    promptChars: int = 0
    inputTokens: int = 0
    outputTokens: int = 0
    costUsd: float = 0.0
    error: str = ""
    extra: dict = field(default_factory=dict)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record(tx: Transaction) -> None:
    ensure_dirs()
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    path = transactions_dir() / f"{month}.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(tx), ensure_ascii=False) + "\n")
