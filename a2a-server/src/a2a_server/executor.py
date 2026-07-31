"""CliAgentExecutor — turns A2A tasks into local CLI runs.

Lifecycle: submitted → working (streaming status messages as the CLI talks)
→ completed with the full reply as an artifact, or failed/canceled. A missing
binary fails immediately with install instructions — never a fake success.
"""

from __future__ import annotations

import asyncio
import logging

from a2a import types as a2a_types
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from google.protobuf.json_format import MessageToDict

from a2a_server import store
from a2a_server.bridge import bridge_for
from a2a_server.config import DEFAULT_SKILL, SKILL_BY_ID, max_task_seconds

log = logging.getLogger("a2a_server.executor")

# task_id → running subprocess, so cancel() can reach it.
_RUNNING: dict[str, asyncio.subprocess.Process] = {}


def _requested_skill(context: RequestContext) -> str:
    msg = context.message
    if msg is not None and msg.HasField("metadata"):
        meta = MessageToDict(msg.metadata)
        skill = meta.get("skill")
        if isinstance(skill, str) and skill in SKILL_BY_ID:
            return skill
    return DEFAULT_SKILL


def _prompt_text(context: RequestContext) -> str:
    text = context.get_user_input()
    if text:
        return text
    msg = context.message
    if msg is None:
        return ""
    return "\n".join(p.text for p in msg.parts if p.HasField("text"))


def _text_message(updater: TaskUpdater, text: str) -> a2a_types.Message:
    return updater.new_agent_message(parts=[a2a_types.Part(text=text)])


class CliAgentExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        if context.current_task is None:
            # The SDK requires a full Task on the queue before any status update.
            task = a2a_types.Task(
                id=context.task_id,
                context_id=context.context_id,
                status=a2a_types.TaskStatus(state=a2a_types.TaskState.TASK_STATE_SUBMITTED),
                history=[context.message] if context.message is not None else [],
            )
            await event_queue.enqueue_event(task)

        skill_id = _requested_skill(context)
        binding = SKILL_BY_ID[skill_id]
        prompt = _prompt_text(context).strip()

        tx = store.Transaction(
            taskId=context.task_id,
            contextId=context.context_id,
            skill=skill_id,
            state="submitted",
            startedAt=store.now_iso(),
            promptChars=len(prompt),
        )

        if not prompt:
            tx.state, tx.endedAt, tx.error = "failed", store.now_iso(), "empty prompt"
            store.record(tx)
            await updater.failed(message=_text_message(updater, "The message contained no text to act on."))
            return

        bin_path = binding.resolve()
        if bin_path is None:
            tx.state, tx.endedAt, tx.error = "failed", store.now_iso(), f"{binding.binary_name} not installed"
            store.record(tx)
            await updater.failed(
                message=_text_message(
                    updater,
                    f"`{binding.binary_name}` is not installed on this machine, so the "
                    f"{binding.name} skill cannot run. Install it with:\n{binding.install_hint}",
                )
            )
            return

        bridge = bridge_for(skill_id)
        await updater.start_work()
        tx.state = "working"

        proc = await asyncio.create_subprocess_exec(
            *bridge.argv(bin_path, prompt),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _RUNNING[context.task_id] = proc

        collected: list[str] = []
        finals: list[str] = []
        stderr_tail: list[str] = []

        async def pump_stderr() -> None:
            assert proc.stderr is not None
            async for raw in proc.stderr:
                stderr_tail.append(raw.decode(errors="replace").rstrip())
                del stderr_tail[:-20]

        async def pump_stdout() -> None:
            assert proc.stdout is not None
            async for raw in proc.stdout:
                for ev in bridge.parse_line(raw.decode(errors="replace")):
                    if ev.kind == "final":
                        finals.append(ev.text)
                    elif ev.kind in ("delta", "text"):
                        collected.append(ev.text)
                        await updater.update_status(
                            a2a_types.TaskState.TASK_STATE_WORKING,
                            message=_text_message(updater, ev.text),
                        )
                    elif ev.kind == "tool":
                        await updater.update_status(
                            a2a_types.TaskState.TASK_STATE_WORKING,
                            message=_text_message(updater, f"[tool] {ev.name} {ev.text}".rstrip()),
                        )
                    elif ev.kind == "usage":
                        tx.inputTokens = int(ev.usage.get("inputTokens") or 0)
                        tx.outputTokens = int(ev.usage.get("outputTokens") or 0)
                        tx.costUsd = float(ev.usage.get("costUsd") or 0)

        try:
            await asyncio.wait_for(
                asyncio.gather(pump_stdout(), pump_stderr(), proc.wait()),
                timeout=max_task_seconds(),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            tx.state, tx.endedAt, tx.error = "failed", store.now_iso(), f"timed out after {max_task_seconds():.0f}s"
            store.record(tx)
            await updater.failed(message=_text_message(updater, f"Run timed out after {max_task_seconds():.0f}s."))
            return
        finally:
            _RUNNING.pop(context.task_id, None)

        if proc.returncode != 0:
            # cancel() may have killed it — the canceled state is already recorded there.
            if context.task_id in _CANCELED:
                _CANCELED.discard(context.task_id)
                tx.state, tx.endedAt = "canceled", store.now_iso()
                store.record(tx)
                return
            err = "\n".join(stderr_tail[-5:]) or f"exit code {proc.returncode}"
            tx.state, tx.endedAt, tx.error = "failed", store.now_iso(), err[:500]
            store.record(tx)
            await updater.failed(message=_text_message(updater, f"{binding.name} exited with an error:\n{err[:1000]}"))
            return

        full = (
            "".join(collected).strip()
            or "".join(finals).strip()
            or "(the CLI produced no text output)"
        )
        await updater.add_artifact(parts=[a2a_types.Part(text=full)], name="reply")
        tx.state, tx.endedAt = "completed", store.now_iso()
        store.record(tx)
        await updater.complete()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        proc = _RUNNING.get(context.task_id)
        if proc is not None:
            _CANCELED.add(context.task_id)
            proc.kill()
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        await updater.cancel()


_CANCELED: set[str] = set()
