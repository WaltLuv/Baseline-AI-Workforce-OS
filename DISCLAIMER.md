# Read this before you run it

**Plain English first.** This software runs AI agents on your own computer. They
execute commands, create and change files, and can spend real money through
services you connect. You use it at your own risk. You are responsible for what
you run, what your agents do, the keys you add, and the bills those keys generate.
It comes with no warranty of any kind.

If you are not comfortable with that, do not run it.

---

## What it actually does on your machine

Being specific, because "AI agent" is vague and the details matter:

- **It runs command-line programs.** Chat messages are turned into real
  invocations of the CLIs you have installed — `claude`, `codex`, `hermes`,
  `ollama` and others — as your user, with your permissions.
- **It writes files.** Agents write into
  `~/.baseline-workforce/workspace/<project>/`. Claude Code is spawned with
  `--permission-mode acceptEdits` so a headless run can finish without stopping
  to ask. That is a deliberate default, and you can change it in Settings →
  Models → File permissions (`plan` never writes; `default` asks — though a
  background run has nobody to answer).
- **It reads your files.** It reads `~/.claude`, `~/.openclaw`, `~/.hermes` and,
  if you configure one, your Obsidian vault. It does not modify them, with two
  exceptions you asked for: goals and journal markdown in your vault folder, and
  Hermes personas when you save one from the Pantheon tab.
- **It can spend money.** Any API key you add — Anthropic, OpenAI, OpenRouter,
  HeyGen, Suno, Apollo and others — can be charged by the services you connect
  it to. Loops and multi-agent fan-out can make many calls quickly.
- **It can put your dashboard on the internet.** The Phone tab can start a
  cloudflared or ngrok tunnel. While that tunnel runs, anyone with the URL can
  drive your agents. There is no login in front of it. Stop it when you are done.

## Your responsibilities

- **Back up anything you cannot afford to lose.** Do not point agents at
  irreplaceable files without a backup.
- **Supervise what runs.** Read what an agent did before acting on it. The
  dashboard shows the exact command it ran for exactly this reason.
- **Guard your keys.** They live in `.env.local`, which is gitignored. Never
  commit it, never paste it into a chat, never share your zip with keys inside.
- **Cap your own spend.** Set limits in each provider's dashboard. Nothing here
  can stop a provider charging you.
- **Verify AI output.** It can be wrong, incomplete, or confidently invented.
  Nothing this software produces is legal, financial, medical or professional
  advice.
- **Stay lawful.** Use it only on systems and data you are authorised to access.

## Third-party services

This software talks to independent third-party tools and APIs. It is not
affiliated with, endorsed by, or sponsored by any of them. Your use of each is
governed by that provider's own terms, which you are responsible for reading. The
author is not responsible for their availability, pricing, changes or outages.

## No warranty, no liability

The software is provided "as is" and "as available", without warranty of any
kind. To the maximum extent permitted by law, the author is not liable for any
damages, lost data, lost profits, or costs incurred through any connected
service, arising from your use of or inability to use the software. Your sole
remedy is to stop using it.

See `LICENSE` for the full terms.

---

*This is a general, good-faith notice. It is not legal advice and may not cover
your jurisdiction or circumstances.*
