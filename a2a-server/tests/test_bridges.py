"""Bridge parsers — pure unit tests, no server needed."""

from __future__ import annotations

from a2a_server.bridge import claude, omp


def test_claude_parses_text_tool_and_usage():
    evs = claude.parse_line(
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},'
        '{"type":"tool_use","name":"Edit","input":{"file_path":"a.ts"}}]}}'
    )
    kinds = [e.kind for e in evs]
    assert kinds == ["delta", "tool"]
    assert evs[1].name == "Edit" and evs[1].text == "a.ts"

    (usage,) = claude.parse_line(
        '{"type":"result","usage":{"input_tokens":1,"output_tokens":2},"total_cost_usd":0.1}'
    )
    assert usage.kind == "usage"
    assert usage.usage == {"inputTokens": 1, "outputTokens": 2, "costUsd": 0.1}


def test_claude_result_text_is_final_not_delta():
    evs = claude.parse_line('{"type":"result","result":"whole reply","usage":{}}')
    kinds = {e.kind for e in evs}
    assert "final" in kinds and "delta" not in kinds


def test_claude_passes_through_non_json():
    (ev,) = claude.parse_line("plain stderr-ish line")
    assert ev.kind == "text" and ev.text == "plain stderr-ish line"


def test_omp_extracts_text_from_known_shapes():
    (ev,) = omp.parse_line('{"type":"message","text":"OMP_OK"}')
    assert ev.kind == "delta" and ev.text == "OMP_OK"
    (ev,) = omp.parse_line('{"content":[{"text":"a"},{"text":"b"}]}')
    assert ev.kind == "delta" and ev.text == "ab"


def test_omp_unknown_shape_passes_through_verbatim():
    line = '{"weird":{"nested":123}}'
    (ev,) = omp.parse_line(line)
    assert ev.kind == "text" and ev.text == line


def test_omp_usage_shapes():
    (ev,) = omp.parse_line('{"usage":{"input_tokens":3,"output_tokens":4}}')
    assert ev.kind == "usage"
    assert ev.usage["inputTokens"] == 3 and ev.usage["outputTokens"] == 4
