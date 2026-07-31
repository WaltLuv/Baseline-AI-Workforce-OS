# Swarm Orchestration over A2A — Design Blueprint

Status: **design document** (deliberately not implemented yet). This is the
blueprint for how the Oh My Pi lead integrator dispatches and verifies work
across the local workforce once the basic A2A bridge (this server) is proven.

## The two-dimensional coordinate system

- **Vertical (MCP):** each local agent reaches its own machine — filesystem,
  terminal, dev tools — through Model Context Protocol servers. That axis
  already exists in Workforce OS (`src/lib/mcp.ts`) and in each CLI's own
  tooling.
- **Horizontal (A2A):** agents reach *each other* through this server's
  JSON-RPC surface. The lead integrator (`oh-my-pi` skill) negotiates and
  delegates to specialists (`claude-code`, and future skills) without any
  agent exposing its internal state, memory, or tools — only A2A messages,
  tasks, and artifacts cross the boundary.

## Roles

| Role | Fulfilled by | Responsibility |
|---|---|---|
| Lead integrator | Oh My Pi (`omp`) | decompose a goal, dispatch subtasks, integrate results |
| Specialist workers | Claude Code (and future skills) | execute one well-scoped subtask each |
| Verifiers | N independent A2A tasks | peer-review a candidate patch before it lands |

## Dispatch transport

Phase A (now): plain A2A `message/send` fan-out — the lead sends one task per
subtask, all through this server, states tracked via `tasks/get`.

Phase B (blueprint): an IRC channel as a broadcast bus for presence and
claim/ack coordination when multiple machines join. Each machine runs this
A2A server; its agent card is the capability advertisement; IRC carries only
pointers ("task X offered", "claimed by host Y") — payloads always travel
over A2A, never IRC.

## Cross-session memory

Ruflo acts as the router/memory layer between rounds: the lead records
decomposition decisions and verifier verdicts, so a re-run of a failed
subtask carries the history of why it failed. (Workforce OS already registers
Ruflo as an agent; the integration point is a future `ruflo` skill binding.)

## Stochastic Multi-Agent Consensus (the verification loop)

For a candidate patch P:

1. The lead spawns K verification tasks (default K=3), each with the same
   brief: *"Try to refute patch P: does it break the contract, miss an edge
   case, or fail its tests?"* — each runs in an independent session with no
   shared state (that independence is what A2A's opacity buys).
2. Each verifier returns `refuted` or `stands`, with reasons, as its artifact.
3. Consensus rule: P lands only if ≥ ceil(K/2)+... strictly: **majority
   "stands" AND zero reproducible refutations**. A reproducible refutation
   (verifier includes a failing command) always wins regardless of the vote.
4. On refutation, the lead loops: patch → verify → patch, with Ruflo carrying
   the refutation history so the same mistake is not re-made.
5. Every round is ordinary A2A traffic, so the transaction ledger prices the
   whole consensus loop — the Workforce OS telemetry page shows what a
   verified patch actually cost.

## Safety posture

- Verification tasks run read-only briefs; only the lead applies patches.
- The A2A server stays loopback-only until multi-machine phase B; then it
  binds a LAN interface behind explicit allow-listing and card-level
  security schemes (the SDK's `security_schemes` field is the hook).
- Approval-gated actions stay approval-gated: A2A adds no bypass — a task
  that needs a credential the runtime doesn't have fails honestly, like
  everything else in Baseline OS.

## What "implemented" will mean

The blueprint graduates from design to code when: (1) a `dispatch` module in
this server exposes a lead-side helper (fan-out + consensus rule as above),
(2) the ledger gains a `roundId` field so consensus loops group in telemetry,
and (3) Workforce OS's A2A page renders rounds. None of that should start
until real multi-agent load exists — the single-bridge path must stay boring
and reliable first.
