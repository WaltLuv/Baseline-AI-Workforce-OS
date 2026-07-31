"""Bridge to the Claude Code CLI (`claude -p --output-format stream-json`)."""

from __future__ import annotations

import json

from a2a_server.bridge import BridgeEvent


def argv(bin_path: str, prompt: str) -> list[str]:
    return [
        bin_path,
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "acceptEdits",
        prompt,
    ]


def parse_line(line: str) -> list[BridgeEvent]:
    line = line.strip()
    if not line:
        return []
    try:
        ev = json.loads(line)
    except json.JSONDecodeError:
        return [BridgeEvent(kind="text", text=line)]

    out: list[BridgeEvent] = []
    t = ev.get("type")
    if t == "assistant":
        for block in (ev.get("message") or {}).get("content") or []:
            if block.get("type") == "text" and block.get("text"):
                out.append(BridgeEvent(kind="delta", text=block["text"]))
            elif block.get("type") == "tool_use":
                name = block.get("name", "tool")
                detail = ""
                inp = block.get("input")
                if isinstance(inp, dict):
                    detail = str(
                        inp.get("file_path") or inp.get("command") or inp.get("pattern") or ""
                    )[:200]
                out.append(BridgeEvent(kind="tool", name=name, text=detail))
    elif t == "result":
        usage = ev.get("usage") or {}
        out.append(
            BridgeEvent(
                kind="usage",
                usage={
                    "inputTokens": usage.get("input_tokens", 0),
                    "outputTokens": usage.get("output_tokens", 0),
                    "costUsd": ev.get("total_cost_usd", 0) or 0,
                },
            )
        )
        # The result echoes the whole reply; the executor uses it only when
        # nothing streamed, so the final artifact never doubles the text.
        if ev.get("result") and ev.get("is_error") is not True:
            out.append(BridgeEvent(kind="final", text=str(ev["result"])))
    return out
