/**
 * The feature catalogue — every non-agent surface in the workforce.
 *
 * Client-safe data. `requires` is evaluated on the server by
 * `features.server.ts`, which is what lets a page say "setup-needed" honestly
 * instead of pretending to work.
 */

export type Requirement =
  | { kind: "cli"; bin: string; label: string; install: string }
  | { kind: "env"; key: string; label: string; install: string }
  | { kind: "agent"; id: string; label: string; install: string }
  | { kind: "vault"; label: string; install: string };

export interface Feature {
  id: string;
  route: string;
  title: string;
  /** lucide-react icon name, resolved client-side. */
  icon: string;
  group: "Command" | "Orchestration" | "Studio" | "Growth" | "Self";
  accent: string;
  blurb: string;
  /** What the page does with nothing configured at all. */
  worksOffline: boolean;
  requires: Requirement[];
  /** Tabs shown on the page, mirroring the surfaces in the pack. */
  tabs?: string[];
}

const CLAUDE_REQ: Requirement = {
  kind: "agent",
  id: "claude",
  label: "Claude Code CLI",
  install: "npm install -g @anthropic-ai/claude-code",
};

export const FEATURES: Feature[] = [
  {
    id: "mission-control",
    route: "/",
    title: "Mission Control",
    icon: "LayoutGrid",
    group: "Command",
    accent: "#d4a574",
    blurb: "The whole workforce at a glance — who is connected, what ran today, what it cost.",
    worksOffline: true,
    requires: [],
  },
  {
    id: "activity",
    route: "/activity",
    title: "Activity",
    icon: "Activity",
    group: "Command",
    accent: "#38bdf8",
    blurb: "Every Claude Code session on this machine, newest first, with tokens and tool counts.",
    worksOffline: true,
    requires: [CLAUDE_REQ],
    tabs: ["Sessions", "Projects", "Usage"],
  },
  {
    id: "memory",
    route: "/memory",
    title: "Memory",
    icon: "Brain",
    group: "Command",
    accent: "#22d3ee",
    blurb: "A live graph of your notes and agent memory, plus full-text search across the vault.",
    worksOffline: true,
    requires: [{ kind: "vault", label: "Obsidian vault", install: "Set your vault path in Settings." }],
    tabs: ["Graph", "Search", "Recent"],
  },
  {
    id: "skills",
    route: "/skills",
    title: "Skills",
    icon: "Zap",
    group: "Command",
    accent: "#a3e635",
    blurb: "The skills your agents can call, read straight from disk — user, project and plugin scopes.",
    worksOffline: true,
    requires: [CLAUDE_REQ],
    tabs: ["Fleet", "MCP servers"],
  },
  {
    id: "goals",
    route: "/goals",
    title: "Goals",
    icon: "Target",
    group: "Self",
    accent: "#34d399",
    blurb: "Checkbox tasks with voice capture, mirrored to your vault as one markdown file per month.",
    worksOffline: true,
    requires: [],
  },
  {
    id: "journal",
    route: "/journal",
    title: "Journal",
    icon: "NotebookPen",
    group: "Self",
    accent: "#fbbf24",
    blurb: "One file per day. Talk or type; every entry lands in the vault as markdown.",
    worksOffline: true,
    requires: [],
  },
  {
    id: "workforce",
    route: "/workforce",
    title: "Workforce",
    icon: "Users",
    group: "Orchestration",
    accent: "#e0b184",
    blurb:
      "Agents you define rather than CLIs you connect — a spec, a contract and its tests, as plain files you can export and hand over.",
    worksOffline: true,
    requires: [CLAUDE_REQ],
    tabs: ["Run", "Spec", "Contract", "Tests", "History"],
  },
  {
    id: "room",
    route: "/room",
    title: "Agent Mastermind",
    icon: "MessagesSquare",
    group: "Orchestration",
    accent: "#a855f7",
    blurb: "Put one question to every connected agent at once, then have your anchor agent synthesise.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "pipeline",
    route: "/pipeline",
    title: "Pipeline",
    icon: "Workflow",
    group: "Orchestration",
    accent: "#34d399",
    blurb: "Capture an idea, shape it, decide on it, ship it. A four-stage board that agents can act on.",
    worksOffline: true,
    requires: [],
    tabs: ["Capture", "Shape", "Decide", "Build"],
  },
  {
    id: "kanban",
    route: "/kanban",
    title: "Kanban",
    icon: "Columns3",
    group: "Orchestration",
    accent: "#14b8a6",
    blurb: "Your own board. Drag between columns; nothing leaves this machine.",
    worksOffline: true,
    requires: [],
  },
  {
    id: "agent-kanban",
    route: "/agent-kanban",
    title: "Agent Kanban",
    icon: "LayoutDashboard",
    group: "Orchestration",
    accent: "#7dd3fc",
    blurb: "Hand a card to an agent and watch it work the task end to end, with the output attached.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "paperclip",
    route: "/paperclip",
    title: "Paperclip",
    icon: "Building2",
    group: "Orchestration",
    accent: "#d4a574",
    blurb: "The company view: departments, standing orders, and what the workforce shipped this week.",
    worksOffline: true,
    requires: [],
    tabs: ["Company", "Departments", "Standing orders"],
  },
  {
    id: "loop",
    route: "/loop",
    title: "Loop",
    icon: "Repeat",
    group: "Orchestration",
    accent: "#2dd4bf",
    blurb: "Run a prompt over and over until the finish condition is met, with every round on record.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "apps",
    route: "/apps",
    title: "App Lab",
    icon: "FlaskConical",
    group: "Studio",
    accent: "#a3e635",
    blurb: "Describe an app, get a working single-file build in the workspace, preview it in place.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "games",
    route: "/games",
    title: "Game Studio",
    icon: "Gamepad2",
    group: "Studio",
    accent: "#39ff8e",
    blurb: "Commission a playable browser game. Same build engine as App Lab, tuned for games.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "opendesign",
    route: "/opendesign",
    title: "Open Design",
    icon: "Palette",
    group: "Studio",
    accent: "#e879f9",
    blurb: "Design systems, landing pages and components, generated as real files you can open.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "thumbnails",
    route: "/thumbnails",
    title: "Thumbnails",
    icon: "Image",
    group: "Studio",
    accent: "#fb7185",
    blurb: "Research a title, then render a 1280×720 thumbnail as SVG you can tweak and export.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "video",
    route: "/video",
    title: "Video Studio",
    icon: "Film",
    group: "Studio",
    accent: "#ef4444",
    blurb: "Script, shot list and storyboard locally. Add a render key when you want finished footage.",
    worksOffline: false,
    requires: [
      CLAUDE_REQ,
      { kind: "env", key: "HEYGEN_API_KEY", label: "HeyGen (avatar render)", install: "HEYGEN_API_KEY=… in .env.local" },
    ],
    tabs: ["Script", "Storyboard", "Render"],
  },
  {
    id: "video-use",
    route: "/video-use",
    title: "Video Editor",
    icon: "Scissors",
    group: "Studio",
    accent: "#f59e0b",
    blurb: "Cut list and edit plan from a transcript. Applies the cuts when ffmpeg is on the box.",
    worksOffline: false,
    requires: [
      CLAUDE_REQ,
      { kind: "cli", bin: "ffmpeg", label: "ffmpeg", install: "brew install ffmpeg   ·   apt install ffmpeg" },
    ],
  },
  {
    id: "openmontage",
    route: "/openmontage",
    title: "OpenMontage",
    icon: "Clapperboard",
    group: "Studio",
    accent: "#f0a868",
    blurb: "Cinematic sequences: beats, prompts and continuity notes ready for your video model.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "music",
    route: "/music",
    title: "Music Studio",
    icon: "Music2",
    group: "Studio",
    accent: "#c084fc",
    blurb: "Write briefs, lyrics and style prompts. Generates audio once a music key is connected.",
    worksOffline: false,
    requires: [
      CLAUDE_REQ,
      { kind: "env", key: "SUNO_API_KEY", label: "Suno", install: "SUNO_API_KEY=… in .env.local" },
    ],
  },
  {
    id: "notebook",
    route: "/notebook",
    title: "Notebook",
    icon: "NotebookText",
    group: "Studio",
    accent: "#fde047",
    blurb: "NotebookLM from the dashboard — sources, questions and research briefs against your own notebooks.",
    worksOffline: false,
    requires: [
      {
        kind: "cli",
        bin: "notebooklm-mcp",
        label: "NotebookLM MCP CLI",
        install: "uv tool install notebooklm-mcp   # then: notebooklm-mcp auth",
      },
    ],
    tabs: ["Notebooks", "Ask", "Research"],
  },
  {
    id: "seo",
    route: "/seo",
    title: "SEO Office",
    icon: "TrendingUp",
    group: "Growth",
    accent: "#a3e635",
    blurb: "Keyword research, briefs and full drafts written into the workspace as markdown.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
    tabs: ["Research", "Brief", "Draft"],
  },
  {
    id: "leads",
    route: "/leads",
    title: "Leads",
    icon: "Users",
    group: "Growth",
    accent: "#60a5fa",
    blurb: "Define an ICP, score a list, and draft the outreach. Enrichment needs a data provider key.",
    worksOffline: false,
    requires: [
      CLAUDE_REQ,
      { kind: "env", key: "APOLLO_API_KEY", label: "Apollo (enrichment)", install: "APOLLO_API_KEY=… in .env.local" },
    ],
    tabs: ["ICP", "List", "Outreach"],
  },
  {
    id: "radar",
    route: "/radar",
    title: "Radar",
    icon: "Radar",
    group: "Growth",
    accent: "#f472b6",
    blurb: "A standing scan of what moved in your space, written up as a briefing you can publish.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "astros",
    route: "/astros",
    title: "Astros",
    icon: "Sparkles",
    group: "Growth",
    accent: "#818cf8",
    blurb: "The long-range scan: patterns across your own notes, sessions and goals over time.",
    worksOffline: false,
    requires: [CLAUDE_REQ],
  },
  {
    id: "settings",
    route: "/settings",
    title: "Settings",
    icon: "Settings",
    group: "Self",
    accent: "#a59783",
    blurb: "Vault path, workspace, model, binaries and command overrides — all written to one JSON file.",
    worksOffline: true,
    requires: [],
  },
  {
    id: "setup",
    route: "/setup",
    title: "Setup",
    icon: "Rocket",
    group: "Self",
    accent: "#f97316",
    blurb: "What is connected, what is not, and the exact command to fix each gap.",
    worksOffline: true,
    requires: [],
  },
];

export const FEATURE_BY_ROUTE: Record<string, Feature> = Object.fromEntries(FEATURES.map((f) => [f.route, f]));
export const FEATURE_BY_ID: Record<string, Feature> = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

export interface RequirementStatus extends Record<string, unknown> {
  label: string;
  met: boolean;
  detail: string;
  install: string;
}

export interface FeatureStatus {
  id: string;
  ready: boolean;
  requirements: RequirementStatus[];
}
