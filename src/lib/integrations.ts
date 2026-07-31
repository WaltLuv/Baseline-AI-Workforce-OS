/**
 * External services the studios can call.
 *
 * Client-safe catalogue. Each entry names the environment variables that switch
 * it on, exactly what it adds, and what still works without it — so a page can
 * be honest instead of vague.
 */

export type IntegrationId =
  | "heygen"
  | "suno"
  | "images"
  | "apollo"
  | "notebooklm"
  | "realtime"
  | "pinecone"
  | "notion"
  | "higgsfield"
  | "openrouter";

export interface Integration {
  id: IntegrationId;
  label: string;
  /** All of these unlock it; the first is the canonical one. */
  envKeys: string[];
  /** A CLI that must exist instead of (or as well as) a key. */
  cli?: string;
  /** Credentials-page provider whose stored/1Password key also unlocks it. */
  providerId?: string;
  adds: string;
  withoutIt: string;
  install: string;
  docsUrl: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "heygen",
    label: "HeyGen — avatar video render",
    envKeys: ["HEYGEN_API_KEY"],
    adds: "Renders your script as a finished avatar video, with real avatar and voice pickers pulled from your account.",
    withoutIt: "Script, shot list and storyboard are written locally and are yours either way.",
    install: "HEYGEN_API_KEY=…   # HeyGen → Settings → API",
    docsUrl: "https://docs.heygen.com",
  },
  {
    id: "suno",
    label: "Suno — music render",
    envKeys: ["SUNO_API_KEY"],
    adds: "Turns a brief into finished audio and downloads the track into your workspace.",
    withoutIt: "Briefs, arrangement maps, lyrics and the generation prompt are written locally.",
    install: "SUNO_API_KEY=…\n# optional: SUNO_BASE_URL=https://api.sunoapi.org",
    docsUrl: "https://docs.sunoapi.org",
  },
  {
    id: "images",
    label: "Image model — thumbnail render",
    envKeys: ["IMAGE_API_KEY", "OPENAI_API_KEY"],
    adds: "Renders the thumbnail concept as a real image (any OpenAI-compatible image endpoint).",
    withoutIt: "The editable SVG thumbnail and the hook research are produced locally.",
    install: "OPENAI_API_KEY=…\n# or any compatible endpoint:\n# IMAGE_API_KEY=…  IMAGE_BASE_URL=…  IMAGE_MODEL=gpt-image-1",
    docsUrl: "https://developers.openai.com/api/docs/guides/image-generation",
  },
  {
    id: "apollo",
    label: "Apollo — lead enrichment",
    envKeys: ["APOLLO_API_KEY"],
    adds: "Looks up real people and companies: title, seniority, company size, verified email and phone on request.",
    withoutIt: "ICP definition, scoring against a list you already have, and outreach drafting all work.",
    install: "APOLLO_API_KEY=…   # Apollo → Settings → Integrations → API",
    docsUrl: "https://docs.apollo.io/reference/people-enrichment",
  },
  {
    id: "notebooklm",
    label: "NotebookLM — MCP link",
    envKeys: [],
    cli: "notebooklm-mcp",
    adds: "Talks to your real NotebookLM notebooks through the MCP server: lists them, asks questions, pulls sources.",
    withoutIt: "Briefs are written from the notes and journal already on this machine.",
    install: "uv tool install notebooklm-mcp\nnotebooklm-mcp auth        # sign in once",
    docsUrl: "https://github.com/jacob-bd/notebooklm-mcp-cli",
  },
  {
    id: "realtime",
    label: "Realtime voice",
    envKeys: ["OPENAI_API_KEY"],
    adds: "Full speech-to-speech: interruptible, low latency, over WebRTC straight from the browser.",
    withoutIt: "Push-to-talk voice using the browser's own recognition and speech synthesis, routed through any connected agent.",
    install: "OPENAI_API_KEY=…\n# optional: REALTIME_MODEL=gpt-realtime",
    docsUrl: "https://developers.openai.com/api/docs/guides/realtime-webrtc",
  },
  {
    id: "pinecone",
    label: "Pinecone — vector memory",
    envKeys: ["PINECONE_API_KEY"],
    providerId: "pinecone",
    adds: "Lists your vector indexes with live vector counts and merges them into the memory brain as first-class nodes.",
    withoutIt: "The note graph and full-text search over your vault work entirely locally.",
    install: "PINECONE_API_KEY=…   # app.pinecone.io → API Keys (or add it on the Credentials page)",
    docsUrl: "https://docs.pinecone.io",
  },
  {
    id: "notion",
    label: "Notion — workspace pages",
    envKeys: ["NOTION_TOKEN", "NOTION_API_KEY"],
    providerId: "notion",
    adds: "Searches your Notion workspace and pulls pages into the memory brain alongside vault notes.",
    withoutIt: "Everything on this machine — vault, sessions, skills — is still indexed.",
    install: "NOTION_TOKEN=…   # notion.so/profile/integrations → new internal integration",
    docsUrl: "https://developers.notion.com",
  },
  {
    id: "higgsfield",
    label: "Higgsfield — creative provider",
    envKeys: ["HIGGSFIELD_API_KEY"],
    providerId: "higgsfield",
    adds: "Account, model list and transaction history from the Higgsfield creative platform, in a provider control panel.",
    withoutIt: "The rest of the studios render through their own providers or produce local artefacts.",
    install: "HIGGSFIELD_API_KEY=…   # or add it on the Credentials page",
    docsUrl: "https://higgsfield.ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter — pay-as-you-go models",
    envKeys: ["OPENROUTER_API_KEY"],
    providerId: "openrouter",
    adds: "Live credit balance and usage from the key endpoint, plus the OmniRoute agent for per-message model picking.",
    withoutIt: "Subscription-backed agents (Claude Code, Codex) work as before.",
    install: "OPENROUTER_API_KEY=…   # openrouter.ai/keys",
    docsUrl: "https://openrouter.ai/docs",
  },
];

export const INTEGRATION_BY_ID: Record<string, Integration> = Object.fromEntries(
  INTEGRATIONS.map((i) => [i.id, i]),
);

export interface IntegrationStatus {
  id: IntegrationId;
  connected: boolean;
  detail: string;
}
