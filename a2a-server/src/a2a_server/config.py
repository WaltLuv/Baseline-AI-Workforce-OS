"""Paths, ports, and binary discovery.

State lives under ~/.baseline-workforce/a2a — a deliberate deviation from the
original blueprint's ~/.baseline/a2a so the whole Workforce OS keeps a single
writable home. Set BASELINE_A2A_HOME to override (e.g. to the blueprint path).
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PORT = 8484  # "A2A"


def a2a_home() -> Path:
    override = os.environ.get("BASELINE_A2A_HOME")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".baseline-workforce" / "a2a"


def transactions_dir() -> Path:
    return a2a_home() / "transactions"


def logs_dir() -> Path:
    return a2a_home() / "logs"


def ensure_dirs() -> None:
    for d in (transactions_dir(), logs_dir()):
        d.mkdir(parents=True, exist_ok=True)


def port() -> int:
    try:
        return int(os.environ.get("A2A_PORT", DEFAULT_PORT))
    except ValueError:
        return DEFAULT_PORT


# Where coding CLIs land when installers don't touch PATH-visible dirs.
_EXTRA_BIN_DIRS = (
    "~/.local/bin",
    "~/.bun/bin",
    "~/.npm-global/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
)


def find_binary(name: str, env_override: str) -> str | None:
    """Resolve a CLI binary: env override, then PATH, then known install dirs."""
    override = os.environ.get(env_override)
    if override:
        p = Path(override).expanduser()
        return str(p) if p.exists() else None
    found = shutil.which(name)
    if found:
        return found
    for d in _EXTRA_BIN_DIRS:
        p = Path(d).expanduser() / name
        if p.exists() and os.access(p, os.X_OK):
            return str(p)
    return None


@dataclass(frozen=True)
class SkillBinding:
    """One card skill and the local CLI that fulfils it."""

    skill_id: str
    binary_name: str
    env_override: str
    name: str
    description: str
    tags: tuple[str, ...]
    install_hint: str
    examples: tuple[str, ...] = field(default=())

    def resolve(self) -> str | None:
        return find_binary(self.binary_name, self.env_override)


SKILLS: tuple[SkillBinding, ...] = (
    SkillBinding(
        skill_id="claude-code",
        binary_name="claude",
        env_override="A2A_CLAUDE_BIN",
        name="Claude Code",
        description=(
            "Software engineering on this machine through the Claude Code CLI: "
            "reads, writes, and runs code with full tool access."
        ),
        tags=("coding", "files", "tools", "shell"),
        install_hint="npm install -g @anthropic-ai/claude-code",
        examples=("Refactor src/lib/config.ts to add a new field",),
    ),
    SkillBinding(
        skill_id="oh-my-pi",
        binary_name="omp",
        env_override="A2A_OMP_BIN",
        name="Oh My Pi",
        description=(
            "The omp coding harness as lead integrator: dispatches and "
            "integrates coding work across the local workforce. "
            "(Oh My Pi is the omp CLI — not the PI Agent memory persona.)"
        ),
        tags=("coding", "lead-integrator", "harness"),
        install_hint="curl -fsSL https://omp.sh/install | sh",
        examples=("Wire the new module into the existing build",),
    ),
)

SKILL_BY_ID = {s.skill_id: s for s in SKILLS}
DEFAULT_SKILL = "claude-code"


def max_task_seconds() -> float:
    try:
        return float(os.environ.get("A2A_MAX_SECONDS", "600"))
    except ValueError:
        return 600.0
