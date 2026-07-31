"""FastAPI app assembly — importable by tests and by __main__."""

from __future__ import annotations

from fastapi import FastAPI

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import (
    add_a2a_routes_to_fastapi,
    create_agent_card_routes,
    create_jsonrpc_routes,
)
from a2a.server.tasks import InMemoryTaskStore

from a2a_server.cards import build_agent_card
from a2a_server.config import ensure_dirs, port
from a2a_server.executor import CliAgentExecutor


def create_app(base_url: str | None = None) -> FastAPI:
    ensure_dirs()
    base_url = base_url or f"http://127.0.0.1:{port()}/"
    card = build_agent_card(base_url)
    handler = DefaultRequestHandler(
        agent_executor=CliAgentExecutor(),
        task_store=InMemoryTaskStore(),
        agent_card=card,
    )
    app = FastAPI(title="Baseline Workforce A2A", version=card.version)
    add_a2a_routes_to_fastapi(
        app,
        agent_card_routes=create_agent_card_routes(card),
        # v0.3 compat keeps the classic spec method names (message/send,
        # message/stream, tasks/get, tasks/cancel) working alongside the v1 names.
        jsonrpc_routes=create_jsonrpc_routes(handler, rpc_url="/", enable_v0_3_compat=True),
    )
    return app
