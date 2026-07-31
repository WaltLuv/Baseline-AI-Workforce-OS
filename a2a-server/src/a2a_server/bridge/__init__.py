"""CLI bridges: argv builders + stdout-line parsers for each skill."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

EventKind = Literal["delta", "tool", "usage", "text", "final"]


@dataclass
class BridgeEvent:
    kind: EventKind
    text: str = ""
    name: str = ""
    usage: dict = field(default_factory=dict)


def bridge_for(skill_id: str):
    from a2a_server.bridge import claude, omp

    return {"claude-code": claude, "oh-my-pi": omp}[skill_id]
