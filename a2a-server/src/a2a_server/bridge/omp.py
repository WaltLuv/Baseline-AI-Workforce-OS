"""Bridge to Oh My Pi (`omp -p --mode json`).

omp's JSON event shape is not formally documented, so this parser is
deliberately tolerant: recognisable text-ish fields become deltas, tool-ish
events become tool lines, and anything unrecognised passes through verbatim
as text — a chat backed by this bridge can degrade but never go blank.
"""

from __future__ import annotations

import json

from a2a_server.bridge import BridgeEvent

_TEXT_KEYS = ("text", "content", "message", "delta", "output")


def argv(bin_path: str, prompt: str) -> list[str]:
    return [
        bin_path,
        "-p",
        "--mode",
        "json",
        "--no-session",
        "--max-time",
        "45",
        "--auto-approve",
        prompt,
    ]


def _extract_text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for k in _TEXT_KEYS:
            if k in value:
                got = _extract_text(value[k])
                if got:
                    return got
    if isinstance(value, list):
        return "".join(_extract_text(v) for v in value)
    return ""


def parse_line(line: str) -> list[BridgeEvent]:
    line = line.strip()
    if not line:
        return []
    try:
        ev = json.loads(line)
    except json.JSONDecodeError:
        return [BridgeEvent(kind="text", text=line)]
    if not isinstance(ev, dict):
        return [BridgeEvent(kind="text", text=line)]

    t = str(ev.get("type") or ev.get("event") or "").lower()
    if "tool" in t:
        name = str(ev.get("name") or ev.get("tool") or "tool")
        return [BridgeEvent(kind="tool", name=name, text=_extract_text(ev)[:200])]
    if "usage" in t or "tokens" in ev or "usage" in ev:
        u = ev.get("usage") if isinstance(ev.get("usage"), dict) else ev
        return [
            BridgeEvent(
                kind="usage",
                usage={
                    "inputTokens": u.get("input_tokens") or u.get("inputTokens") or 0,
                    "outputTokens": u.get("output_tokens") or u.get("outputTokens") or 0,
                    "costUsd": u.get("cost_usd") or u.get("costUsd") or 0,
                },
            )
        ]
    text = _extract_text(ev)
    if text:
        return [BridgeEvent(kind="delta", text=text)]
    return [BridgeEvent(kind="text", text=line)]
