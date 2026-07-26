# Baseline AI Workforce OS

**One cockpit for every AI agent on your machine.**

A local-first mission control for Claude Code, Codex, Hermes, OpenClaw and a
dozen more — with a real chat app per agent, voice on every input, goals, a
journal, orchestration boards, and studios that write actual files.

Next.js · Tailwind · Framer Motion. Runs on your laptop, talks to the CLIs you
already have, and sends nothing anywhere.

---

## Start here

You need [Node.js](https://nodejs.org) 20 or newer. That is the only hard
requirement.

```bash
git clone https://github.com/WaltLuv/Baseline-AI-Workforce-OS.git
cd Baseline-AI-Workforce-OS
npm install
npm run dev
```

Open **http://127.0.0.1:4400**. On a Mac you can run `./start.sh` instead — it
installs on first run and opens the browser for you.

> **First time?** Read [`DISCLAIMER.md`](DISCLAIMER.md) before connecting any
> agent. This runs real programs on your machine and can spend real money through
> keys you add.

**It works immediately with nothing configured.** Goals, Journal, Kanban,
Pipeline, Memory and the whole interface run on an empty machine. Every agent
and integration you have not connected says exactly what is missing and the one
command that fixes it — the **Setup** page is the full list.

The natural next step is Claude Code, because it is the anchor of the whole
thing:

```bash
npm install -g @anthropic-ai/claude-code
claude          # sign in once
```

Reload the dashboard and Claude Code goes green.

---

## What you get

### An agent roster, one page each

Every agent has its own page with a real chat app: streaming replies, tool-call
chips as they happen, thinking, a token and cost readout, a stop button, a saved
transcript, its own workspace folder, and a mic on the composer.

| Agent | How it connects |
|---|---|
| **Claude Code** | your local `claude` CLI, streamed as `stream-json` with tools and usage parsed live |
| **Codex** | `codex exec --json` |
| **OpenClaw** | swarm dispatch through the `openclaw` CLI |
| **Hermes** | persona chat, plus its pantheon and phone bridge (below) |
| **Antigravity** | Google's `agy` CLI |
| **Kimi Code** | `kimi` — long context, cheap tokens |
| **Grok Build** | `grok` — fast one-shot artefacts |
| **opencode** | `opencode run`, model-agnostic |
| **Free Claude Code** | the same `claude` binary pointed at your own model proxy |
| **Ruflo** | multi-agent swarm over MCP |
| **Local Model** | Ollama — fully offline, no cost |
| **GLM · GLM Code** | any OpenAI-compatible endpoint |
| **OmniRoute** | OpenRouter, pick a model per message |
| **Hy3 Coder · Sakana** | bring-your-own coding and research endpoints |
| **Fusion** | asks *every* connected agent at once, then merges the answers |

An agent you have not installed reads **setup-needed** with its install command.
Never a fake "online".

### The pages

**Command** — Mission Control · Activity · Memory · Skills
**Orchestration** — Agent Mastermind · Pipeline · Kanban · Agent Kanban · Paperclip · Loop
**Studio** — App Lab · Game Studio · Open Design · Thumbnails · Video · Video Editor · OpenMontage · Music · Notebook
**Growth** — SEO Office · Leads · Radar · Astros
**Self** — Goals · Journal · Settings · Setup

Some worth knowing about:

- **Goals** — checkbox tasks with voice capture, mirrored to your Obsidian vault as one markdown file per month.
- **Journal** — one file per day. Talk or type; it lands in the vault as `YYYY-MM-DD.md`.
- **Activity** — every Claude Code session on this machine, read from `~/.claude/projects`, with tokens and tool counts.
- **Memory** — a force-directed graph of your notes, drawn on a canvas with no charting library, plus full-text search.
- **Agent Mastermind** — one question to every connected agent in parallel, side by side, then Claude referees where they disagree.
- **Loop** — runs the same goal round after round until the agent writes `STATUS: DONE` or the cap stops it.
- **App Lab · Game Studio · Open Design** — describe it, the agent writes real files into a workspace project, and you preview it in a sandboxed iframe without leaving the page.

### Voice everywhere

Every chat box, brief and capture field has a mic button using the browser's own
speech recognition. **No API keys, no audio uploads.** Chrome and Safari support
it; anywhere else the button says so rather than pretending.

Each agent page also has a **Voice** tab:

- **Push-to-talk** — browser recognition in, your agent in the middle, browser speech out. Works with no keys at all.
- **Realtime** — speech to speech over WebRTC, interruptible, sub-second. Needs `OPENAI_API_KEY`; your server mints a short-lived token so the browser never sees the key.

### Render integrations

Five optional services finish work the studios start. Every studio is useful
without them — the writing, planning and scoring are local.

| Integration | Where | What it adds | Without it |
|---|---|---|---|
| **HeyGen** | Video → Render | Finished avatar footage, avatars and voices from your own account. Watermarked test renders are the default, so trying it costs no credits. | Script, shot list, storyboard |
| **Suno** | Music → Render | Generated audio, downloaded before the provider expires it | Brief, arrangement map, lyrics, prompt |
| **Image model** | Thumbnails → Render | A photographic thumbnail via any OpenAI-compatible endpoint | An editable 1280×720 SVG with real text |
| **Apollo** | Leads → Enrich | Real people and companies: title, seniority, size, verified email | ICP, scoring your own list, outreach drafting |
| **NotebookLM** | Notebook → NotebookLM | Your real notebooks over MCP, tools discovered at runtime | A brief written from the notes on this machine |

Copy `.env.local.example` to `.env.local` and uncomment what you want. Nothing
costs credits by accident: Apollo's email and phone reveals are opt-in per
request, and the moment any render finishes the file is pulled into your
workspace so an expiring provider URL never loses your work.

### Hermes extras

- **Pantheon** — create, edit and retire the personas Hermes loads from disk. Saves keep a `.bak`, deletes rename rather than destroy, and YAML keys this editor does not model survive a round trip untouched.
- **Phone** — get the dashboard onto your phone. LAN address first (nothing leaves your network), then an optional cloudflared or ngrok tunnel with a locally generated QR code — and a plain warning that a public URL has no login in front of it.

---

## How it talks to your agents

Everything is normalised into one small NDJSON protocol, so the browser
understands one shape no matter which CLI is behind it:

```
{"t":"meta","streamId":"…","command":"claude -p …"}   the exact command being run
{"t":"delta","text":"…"}                              streamed assistant text
{"t":"think","text":"…"}                              reasoning, where exposed
{"t":"tool","name":"Edit","detail":"src/app.ts"}      tool calls as they happen
{"t":"usage","input":1,"output":2,"costUsd":0.01}     from the CLI's own report
{"t":"end","code":0,"ok":true}
```

The command being run is shown in the UI while a turn streams, so a wrong flag
is obvious — and fixable from **Settings** without touching source (`argv` in
the config file, with `{prompt}` and `{model}` substituted).

Claude Code is spawned with `--permission-mode acceptEdits` inside its own
workspace project, because a headless run has nobody to answer a permission
prompt and would otherwise stop at the first file write. Change it in Settings →
Models (`plan` never writes; `default` asks).

---

## Where your data lives

```
~/.baseline-workforce/
├── config.json            # written by the Settings page
├── goals.json
├── journal/YYYY-MM-DD.json
├── chats/<agent>.json     # transcripts
├── boards/<board>.json    # kanban, pipeline, studio history
└── workspace/<project>/   # everything your agents build
```

Source data — `~/.claude`, `~/.openclaw`, your Obsidian vault — is **read only**.
There are exactly two exceptions, both things you asked for: goals and journal
markdown inside the vault folder you choose, and Hermes personas when you save
one from the Pantheon tab.

No account. No telemetry. No phone-home. The only outbound calls are to
providers whose keys *you* added.

---

## Configuration

Everything optional, all in one file (`~/.baseline-workforce/config.json`),
editable from the Settings page:

| Key | What it does |
|---|---|
| `vaultRoot`, `vaultFolder` | where goals and journal markdown are mirrored |
| `workspaceRoot` | where agent builds land |
| `claudeModel` | passed to the Claude CLI as `--model` |
| `permissionMode` | `acceptEdits` (default) · `plan` · `default` |
| `bins` | explicit binary paths when a CLI is not on `PATH` |
| `argv` | per-agent argument templates when a CLI changes its flags |
| `goalCategories`, `userName`, `locationLabel` | cosmetics |

API keys are read from the environment only (`.env.local`) and are never written
into the config file.

---

## Scripts

```bash
npm run dev        # dev server on 127.0.0.1:4400
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

---

## Troubleshooting

**An agent says setup-needed but I know it is installed.** The dev server can
inherit a stripped `PATH`. Put the full path in Settings → Binary overrides, or
start the server from a shell where `which <cli>` works.

**A build ran but wrote no files.** Check Settings → Models → File permissions.
On "ask every time" a headless run has nobody to answer the prompt.

**The voice button is greyed out.** Speech recognition needs Chrome or Safari.

**A CLI changed its flags and chat broke.** Add an `argv` entry for that agent in
`~/.baseline-workforce/config.json` — the exact command is printed in the UI
while a turn runs, so you can see what to fix.

---

## License and safety

This is **commercial, source-available software licensed to you personally** as a
member — not open source.

**You may:** use it on as many of your own machines as you like, modify it, use it
commercially in your own business, and install and run it for your clients as
part of a service you charge for. Anything your agents produce is yours.

**You may not:** redistribute or share the source or the zip, resell the software
itself, publish it, or teach from the source as your own starter kit. If you got
this from someone other than Walter Thornton, you do not have a license to it.

Full terms in [`LICENSE`](LICENSE). Want to do something the license prohibits?
Ask — permission is often granted.

**Before you run it, read [`DISCLAIMER.md`](DISCLAIMER.md).** This software runs
AI agents on your machine: they execute commands, write files, and can spend real
money through keys you connect. You use it at your own risk, and you are
responsible for what your agents do.

---

© 2026 Walter Thornton · Baseline Automations. All rights reserved.
