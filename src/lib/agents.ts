/**
 * The workforce roster.
 *
 * This file is client-safe: pure data, no node imports. It drives the sidebar,
 * the agent pages, the avatars and the status strip. Detection of whether a
 * given CLI is actually installed lives in `agents.server.ts`.
 */

export type AgentId =
  | "claude"
  | "codex"
  | "openclaw"
  | "hermes"
  | "antigravity"
  | "kimi"
  | "grok"
  | "opencode"
  | "ohmypi"
  | "freeclaude"
  | "ruflo"
  | "local"
  | "glm"
  | "glmcode"
  | "omniroute"
  | "hy3"
  | "fusion"
  | "sakana"
  | "higgsfield";

/** How the agent's stdout should be interpreted. */
export type StreamMode =
  | "claude-stream-json" // Claude Code CLI `--output-format=stream-json`
  | "codex-json" // `codex exec --json`
  | "omp-json" // Oh My Pi `omp -p --mode json`
  | "ndjson" // generic newline-delimited JSON with a text-ish field
  | "text"; // raw text, forwarded verbatim

export type Backend = "cli" | "http";

export interface AgentSpec {
  id: AgentId;
  name: string;
  /** One line shown under the name on the agent page. */
  tagline: string;
  /** Longer description for the roster card. */
  blurb: string;
  accent: string;
  gradient: string;
  group: "Core" | "Coding" | "Local" | "Routing" | "Creative";
  backend: Backend;
  /** Binary names tried in order when detecting a CLI agent. */
  bins: string[];
  /** Extra absolute paths checked when the binary is not on PATH. */
  binGuesses?: string[];
  streamMode: StreamMode;
  /** Whether the chat page keeps prior turns and replays them into the prompt. */
  carriesHistory: boolean;
  /** Env vars that unlock an HTTP-backed agent. */
  envKeys?: string[];
  /** Shown verbatim in the setup panel. */
  install: string;
  docsUrl?: string;
  /** What this agent can do inside the dashboard, in plain words. */
  capabilities: string[];
  /** True when the agent can write files into a workspace project. */
  buildsFiles: boolean;
}

export const AGENTS: AgentSpec[] = [
  {
    id: "claude",
    name: "Claude Code",
    tagline: "The anchor of the workforce — full tool access, real file edits.",
    blurb:
      "Bridged straight to your local Claude Code CLI. Streams thinking, tool calls and results live, keeps conversation history, and writes into its own workspace project.",
    accent: "#d97757",
    gradient: "linear-gradient(135deg,#f4a07a,#c0563a)",
    group: "Core",
    backend: "cli",
    bins: ["claude"],
    streamMode: "claude-stream-json",
    carriesHistory: true,
    install: "npm install -g @anthropic-ai/claude-code   # then run: claude",
    docsUrl: "https://code.claude.com/docs",
    capabilities: ["Streaming chat", "Tool + file access", "Workspace builds", "Token accounting"],
    buildsFiles: true,
  },
  {
    id: "codex",
    name: "Codex",
    tagline: "OpenAI's coding agent, run headless from the dashboard.",
    blurb:
      "Uses `codex exec --json` so each run streams structured events. Good second opinion on a build Claude already touched.",
    accent: "#22c55e",
    gradient: "linear-gradient(135deg,#86efac,#15803d)",
    group: "Coding",
    backend: "cli",
    bins: ["codex"],
    streamMode: "codex-json",
    carriesHistory: true,
    install: "npm install -g @openai/codex   # then: codex login",
    capabilities: ["Streaming chat", "Headless exec", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    tagline: "Swarm runner — many small agents, one goal.",
    blurb:
      "Reads your OpenClaw config, shows the swarm, and dispatches prompts to the default agent. Output is forwarded as it arrives.",
    accent: "#f472b6",
    gradient: "linear-gradient(135deg,#fda4d3,#c9268f)",
    group: "Core",
    backend: "cli",
    bins: ["openclaw"],
    streamMode: "text",
    carriesHistory: true,
    install: "npm install -g openclaw   # then: openclaw onboard",
    capabilities: ["Swarm chat", "Config inspection", "Session log"],
    buildsFiles: false,
  },
  {
    id: "hermes",
    name: "Hermes",
    tagline: "Persona-driven assistant with its own memory and pantheon.",
    blurb:
      "Talks to the Hermes CLI, lists the personas in your pantheon, and surfaces the memories and sessions it has written to disk.",
    accent: "#60a5fa",
    gradient: "linear-gradient(135deg,#93c5fd,#2563eb)",
    group: "Core",
    backend: "cli",
    bins: ["hermes"],
    streamMode: "text",
    carriesHistory: true,
    install: "See the Hermes install guide, then confirm with: hermes --version",
    capabilities: ["Persona chat", "Pantheon browser", "Memory + sessions"],
    buildsFiles: false,
  },
  {
    id: "antigravity",
    name: "Antigravity",
    tagline: "Google's agent CLI — the successor to the retired Gemini CLI.",
    blurb: "Runs the `agy` binary headlessly and streams its answer back into the chat.",
    accent: "#7c3aed",
    gradient: "linear-gradient(135deg,#c4b5fd,#5b21b6)",
    group: "Coding",
    backend: "cli",
    bins: ["agy", "antigravity"],
    streamMode: "text",
    carriesHistory: true,
    install: "Install Antigravity, then confirm the `agy` binary is on your PATH.",
    capabilities: ["Chat", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "kimi",
    name: "Kimi Code",
    tagline: "Moonshot's coding CLI — long context, cheap tokens.",
    blurb: "Bridges the `kimi` binary. Handy for bulk refactors where context length matters more than finesse.",
    accent: "#00ccff",
    gradient: "linear-gradient(135deg,#7dd3fc,#0369a1)",
    group: "Coding",
    backend: "cli",
    bins: ["kimi"],
    binGuesses: [".kimi-code/bin/kimi", ".local/bin/kimi"],
    streamMode: "text",
    carriesHistory: true,
    install: "Install Kimi Code (lands in ~/.kimi-code/bin), then: kimi --version",
    capabilities: ["Chat", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "grok",
    name: "Grok Build",
    tagline: "xAI's build CLI for fast one-shot artefacts.",
    blurb: "Runs the `grok` binary in non-interactive mode and streams the result.",
    accent: "#cdd3f7",
    gradient: "linear-gradient(135deg,#e2e8f0,#64748b)",
    group: "Coding",
    backend: "cli",
    bins: ["grok"],
    binGuesses: [".grok/bin/grok", ".local/bin/grok"],
    streamMode: "text",
    carriesHistory: true,
    install: "Install the Grok Build CLI (lands in ~/.grok/bin), then: grok --version",
    capabilities: ["Chat", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "opencode",
    name: "opencode",
    tagline: "Open-source terminal coding agent, model-agnostic.",
    blurb: "Runs `opencode run` headlessly so you can point any provider at a build task.",
    accent: "#38bdf8",
    gradient: "linear-gradient(135deg,#bae6fd,#0284c7)",
    group: "Coding",
    backend: "cli",
    bins: ["opencode"],
    streamMode: "text",
    carriesHistory: true,
    install: "npm install -g opencode-ai   # then: opencode auth login",
    capabilities: ["Chat", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "ohmypi",
    name: "Oh My Pi",
    tagline: "The omp coding harness — lead integrator of the workforce.",
    blurb:
      "Bridges the `omp` CLI in print-JSON mode: 40+ providers behind one harness, with its skills, agent files and state read live from ~/.omp. Oh My Pi is the omp coding CLI — not the PI Agent memory persona; they are separate things.",
    accent: "#a78bfa",
    gradient: "linear-gradient(135deg,#c4b5fd,#6d28d9)",
    group: "Coding",
    backend: "cli",
    bins: ["omp"],
    binGuesses: [".local/bin/omp", ".bun/bin/omp", ".npm-global/bin/omp"],
    streamMode: "omp-json",
    carriesHistory: true,
    envKeys: [
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "GROQ_API_KEY",
      "MISTRAL_API_KEY",
      "XAI_API_KEY",
      "CEREBRAS_API_KEY",
    ],
    install: "curl -fsSL https://omp.sh/install | sh   # or: bun install -g @oh-my-pi/pi-coding-agent",
    docsUrl: "https://omp.sh",
    capabilities: ["Streaming chat", "Workspace builds", "Harness state from ~/.omp", "A2A lead-integrator skill"],
    buildsFiles: true,
  },
  {
    id: "freeclaude",
    name: "Free Claude Code",
    tagline: "The Claude Code CLI, pointed at your own model proxy.",
    blurb:
      "Same binary as Claude Code, spawned with the fcc-server proxy env vars so requests route to OpenRouter or a local model instead of Anthropic. Start `fcc-server` first.",
    accent: "#10b981",
    gradient: "linear-gradient(135deg,#6ee7b7,#047857)",
    group: "Routing",
    backend: "cli",
    bins: ["claude"],
    streamMode: "claude-stream-json",
    carriesHistory: true,
    install:
      "uv tool install --force git+https://github.com/Alishahryar1/free-claude-code.git\nfcc-server   # then open http://127.0.0.1:8082/admin and paste your key",
    capabilities: ["Streaming chat", "Bring-your-own model", "Workspace builds"],
    buildsFiles: true,
  },
  {
    id: "ruflo",
    name: "Ruflo",
    tagline: "Multi-agent swarm orchestration over MCP.",
    blurb: "Dispatches a goal to a Ruflo swarm and reports what each worker did.",
    accent: "#6366f1",
    gradient: "linear-gradient(135deg,#a5b4fc,#4338ca)",
    group: "Routing",
    backend: "cli",
    bins: ["ruflo"],
    streamMode: "text",
    carriesHistory: false,
    install: "npx ruflo@latest init   # then: claude mcp add ruflo -- npx ruflo@latest mcp start",
    capabilities: ["Swarm dispatch", "MCP registration"],
    buildsFiles: false,
  },
  {
    id: "local",
    name: "Local Model",
    tagline: "Ollama on this machine — no network, no cost.",
    blurb: "Talks to a local Ollama daemon. Pick any pulled model; the whole exchange stays on the box.",
    accent: "#5eead4",
    gradient: "linear-gradient(135deg,#99f6e4,#0f766e)",
    group: "Local",
    backend: "cli",
    bins: ["ollama"],
    streamMode: "text",
    carriesHistory: true,
    install: "Install Ollama, then: ollama pull llama3.2",
    capabilities: ["Offline chat", "Model picker"],
    buildsFiles: false,
  },
  {
    id: "glm",
    name: "GLM",
    tagline: "Zhipu's GLM family over an OpenAI-compatible endpoint.",
    blurb: "HTTP-backed. Set GLM_API_KEY and the dashboard streams completions straight from the provider.",
    accent: "#34e5b0",
    gradient: "linear-gradient(135deg,#6ee7b7,#0d9488)",
    group: "Routing",
    backend: "http",
    bins: [],
    envKeys: ["GLM_API_KEY", "ZHIPU_API_KEY"],
    streamMode: "text",
    carriesHistory: true,
    install: "Add GLM_API_KEY=… to apps/workforce/.env.local (base URL defaults to https://api.z.ai/api/paas/v4).",
    capabilities: ["Streaming chat"],
    buildsFiles: false,
  },
  {
    id: "glmcode",
    name: "GLM Code",
    tagline: "GLM in build mode — writes files into a workspace project.",
    blurb:
      "Same endpoint as GLM, but the reply is parsed for fenced files and written into a workspace project you can preview.",
    accent: "#10b981",
    gradient: "linear-gradient(135deg,#a7f3d0,#065f46)",
    group: "Coding",
    backend: "http",
    bins: [],
    envKeys: ["GLM_API_KEY", "ZHIPU_API_KEY"],
    streamMode: "text",
    carriesHistory: true,
    install: "Add GLM_API_KEY=… to apps/workforce/.env.local.",
    capabilities: ["Build chat", "File extraction", "Live preview"],
    buildsFiles: true,
  },
  {
    id: "omniroute",
    name: "OmniRoute",
    tagline: "One box, any model — routed through OpenRouter.",
    blurb: "Set OPENROUTER_API_KEY and pick a model per message. Useful for pricing out a task before committing.",
    accent: "#2dd4bf",
    gradient: "linear-gradient(135deg,#5eead4,#0f766e)",
    group: "Routing",
    backend: "http",
    bins: [],
    envKeys: ["OPENROUTER_API_KEY"],
    streamMode: "text",
    carriesHistory: true,
    install: "Add OPENROUTER_API_KEY=… to apps/workforce/.env.local.",
    capabilities: ["Streaming chat", "Model picker", "Cost visibility"],
    buildsFiles: false,
  },
  {
    id: "hy3",
    name: "Hy3 Coder",
    tagline: "Dedicated coding endpoint for long build runs.",
    blurb: "OpenAI-compatible. Point HY3_BASE_URL and HY3_API_KEY at whichever coder endpoint you run.",
    accent: "#3b82f6",
    gradient: "linear-gradient(135deg,#93c5fd,#1d4ed8)",
    group: "Coding",
    backend: "http",
    bins: [],
    envKeys: ["HY3_API_KEY"],
    streamMode: "text",
    carriesHistory: true,
    install: "Add HY3_API_KEY=… and HY3_BASE_URL=… to apps/workforce/.env.local.",
    capabilities: ["Build chat", "File extraction"],
    buildsFiles: true,
  },
  {
    id: "fusion",
    name: "Fusion",
    tagline: "Ask several agents the same thing, then merge the answers.",
    blurb:
      "Fans one prompt out to every installed agent, shows the answers side by side, and asks your anchor agent to synthesise them.",
    accent: "#d4a574",
    gradient: "linear-gradient(135deg,#e6c69a,#a87f54)",
    group: "Routing",
    backend: "cli",
    bins: [],
    streamMode: "text",
    carriesHistory: false,
    install: "Nothing to install — Fusion works with whichever agents are already connected.",
    capabilities: ["Fan-out", "Side-by-side compare", "Synthesis"],
    buildsFiles: false,
  },
  {
    id: "sakana",
    name: "Sakana",
    tagline: "Evolutionary model-merging research agent.",
    blurb: "HTTP-backed research assistant. Needs SAKANA_API_KEY.",
    accent: "#ff5f9e",
    gradient: "linear-gradient(135deg,#fbcfe8,#be185d)",
    group: "Routing",
    backend: "http",
    bins: [],
    envKeys: ["SAKANA_API_KEY"],
    streamMode: "text",
    carriesHistory: true,
    install: "Add SAKANA_API_KEY=… to apps/workforce/.env.local.",
    capabilities: ["Research chat"],
    buildsFiles: false,
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    tagline: "Video & image generation provider — driven through Claude Code + the Higgsfield MCP.",
    blurb:
      "The creative provider: images, video, audio via the Higgsfield platform. The Studio tab dispatches generation briefs through Claude Code using the registered Higgsfield MCP server — the same Provider Control Center pattern as Baseline Agent OS.",
    accent: "#f97316",
    gradient: "linear-gradient(135deg,#fdba74,#c2410c)",
    group: "Creative",
    backend: "http",
    bins: [],
    envKeys: ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"],
    streamMode: "text",
    carriesHistory: false,
    install:
      "claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp\n# then authenticate: run /mcp inside claude and complete the OAuth device flow\n# optional API keys: HIGGSFIELD_API_KEY_ID=… HIGGSFIELD_API_KEY_SECRET=… (or the Credentials page)",
    docsUrl: "https://higgsfield.ai",
    capabilities: ["Video generation", "Image generation", "MCP-driven studio", "Account status"],
    buildsFiles: false,
  },
];

export const AGENT_BY_ID: Record<string, AgentSpec> = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

export function isAgentId(id: string): id is AgentId {
  return id in AGENT_BY_ID;
}

/** Live status of one agent, as reported by /api/agents. */
export interface AgentStatus {
  id: AgentId;
  connected: boolean;
  /** "ready" | "setup-needed" — never a fake "online". */
  state: "ready" | "setup-needed";
  bin: string | null;
  version: string | null;
  detail: string;
}
