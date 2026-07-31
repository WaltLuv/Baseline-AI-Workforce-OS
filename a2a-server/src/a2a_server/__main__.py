"""Run the server: `uv run python -m a2a_server`.

Binds 127.0.0.1 only — this is a local-first bridge, not a public service.
"""

from __future__ import annotations

import logging

import uvicorn

from a2a_server.app import create_app
from a2a_server.config import port


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    uvicorn.run(create_app(), host="127.0.0.1", port=port(), log_level="info")


if __name__ == "__main__":
    main()
