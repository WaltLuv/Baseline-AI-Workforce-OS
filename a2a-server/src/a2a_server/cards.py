"""The server's Agent Card — served at /.well-known/agent-card.json.

The card only advertises skills whose CLI is actually present: a peer that
discovers this server sees what this machine can really do, not aspirations.
"""

from __future__ import annotations

from a2a import types as a2a_types
from a2a.utils import TransportProtocol

from a2a_server import __version__
from a2a_server.config import SKILLS


def build_agent_card(base_url: str) -> a2a_types.AgentCard:
    skills = []
    for binding in SKILLS:
        if binding.resolve() is None:
            continue  # honest card: absent binary → absent skill
        skills.append(
            a2a_types.AgentSkill(
                id=binding.skill_id,
                name=binding.name,
                description=binding.description,
                tags=list(binding.tags),
                examples=list(binding.examples),
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        )

    return a2a_types.AgentCard(
        name="Baseline Workforce A2A",
        description=(
            "Local-first A2A gateway for the Baseline AI Workforce: routes "
            "Agent2Agent tasks to coding CLIs on this machine. "
            f"Currently offering {len(skills)} of {len(SKILLS)} skills "
            "(a skill disappears from this card when its CLI is not installed)."
        ),
        version=__version__,
        supported_interfaces=[
            a2a_types.AgentInterface(
                url=base_url,
                protocol_binding=TransportProtocol.JSONRPC,
            )
        ],
        capabilities=a2a_types.AgentCapabilities(streaming=True),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=skills,
    )
