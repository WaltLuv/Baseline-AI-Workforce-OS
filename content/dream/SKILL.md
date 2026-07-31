---
name: dream
description: The daily Dream review for Baseline AI Workforce OS — audit the last 24h of AI activity and prescribe the top 4 improvements as strict JSON.
---

# /dream — The Daily Dream Review (Workforce OS contract)

Ported from the Baseline Agent OS dream skill, with one structural change:
**the model never writes files.** The app (`src/lib/dream.server.ts`) gathers
the context, sends it with this contract, validates the returned JSON, and
writes `~/.baseline-workforce/dreams/dream-YYYY-MM-DD.json` itself — the
write-home invariant holds no matter what the model does.

## The audit

Walk the operator's last 24 hours across these signal buckets, using ONLY the
context provided (sessions, usage rollups, skills inventory, goals, notes with
ages, A2A ledger):

1. **Conversation mining** — repeated manual tasks → skill candidates (cat SKILLS)
2. **Cost intelligence** — model/plan misuse; flat-rate plans with headroom are
   framed as protecting headroom, `dollarImpact: null`, never fake savings (cat COST)
3. **Skill performance** — dead/dormant/high-friction skills (cat SKILLS)
4. **Memory health** — stale/missing/conflicting notes (cat MEMORY)
5. **Session hygiene** — context rot, oversize sessions, repeated prompts (cat WORKFLOW)
6. **Workflow patterns** — always-paired steps begging to be one keystroke (cat WORKFLOW)

## Hard guard rails (unchanged from the original)

- Insufficient signal in a bucket → **no prescription from that bucket.**
  Fewer than 4 beats confabulation, always.
- Every `evidence[]` entry references real data the operator can verify.
- `cat` ∈ MEMORY | COST | SKILLS | WORKFLOW; `tone` must match
  (pink / orange / blue / yellow).
- Stable slug `id`s (no dates) so recurrences can be age-tracked.
- `command` is one safe, copy-pasteable shell command.
- Time→dollar conversions use the operator's configured `hourlyRateUsd`.

## Output shape (validated by the app; invalid JSON is discarded, not rendered)

```json
{
  "prescriptions": [
    {
      "id": "memory-vault-not-configured",
      "cat": "MEMORY",
      "tone": "pink",
      "headline": "≤120 chars, action-oriented, no jargon",
      "prescription": "3–5 concrete sentences.",
      "evidence": ["real fact 1", "real fact 2", "real fact 3"],
      "command": "claude -p \"...\"",
      "dollarImpact": null,
      "timeImpactMins": 45
    }
  ]
}
```

Exactly 4 entries when the data supports it; prefer 4 different categories.

## Scheduling

The Dream page generates a launchd plist (macOS) or crontab line into
`~/.baseline-workforce/automations/` and shows the one-line install command.
The app never installs schedulers itself. The scheduled job calls
`POST /api/dream {"action":"run"}` on the running dashboard.
