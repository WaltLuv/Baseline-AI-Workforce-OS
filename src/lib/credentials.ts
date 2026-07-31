/**
 * The provider catalogue for the Credentials page — every external service a
 * Baseline agent might need a key for, ported from the Baseline Agent OS
 * catalogue (61 entries there; Stripe is deliberately not ported — Baseline OS
 * is free forever and ships nothing billing-shaped, per the project
 * constitution).
 *
 * Client-safe pure data. Where keys are stored and how they resolve lives in
 * credentials.server.ts.
 */

export type ProviderCategory =
  | "llm"
  | "agent_runtime"
  | "creative_media"
  | "data_search_memory"
  | "communication"
  | "productivity"
  | "devops"
  | "vertical_api";

/**
 * How urgently the stack wants this credential. "as_needed" replaces the
 * source catalogue's third tier: nothing in Baseline OS is "optional" by
 * decree — a missing key is simply a feature not yet configured.
 */
export type ProviderImportance = "required" | "recommended" | "as_needed";

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  importance: ProviderImportance;
  /** Env vars checked, in order — the first one set wins. */
  envKeys: string[];
  setupUrl: string;
}

export const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI", category: "llm", importance: "required", envKeys: ["OPENAI_API_KEY"], setupUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", category: "llm", importance: "required", envKeys: ["ANTHROPIC_API_KEY"], setupUrl: "https://console.anthropic.com/settings/keys" },
  { id: "google_gemini", name: "Google Gemini", category: "llm", importance: "recommended", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], setupUrl: "https://aistudio.google.com/app/apikey" },
  { id: "groq", name: "Groq", category: "llm", importance: "as_needed", envKeys: ["GROQ_API_KEY"], setupUrl: "https://console.groq.com/keys" },
  { id: "openrouter", name: "OpenRouter", category: "llm", importance: "recommended", envKeys: ["OPENROUTER_API_KEY"], setupUrl: "https://openrouter.ai/keys" },
  { id: "perplexity", name: "Perplexity", category: "llm", importance: "as_needed", envKeys: ["PERPLEXITY_API_KEY"], setupUrl: "https://www.perplexity.ai/settings/api" },
  { id: "mistral", name: "Mistral", category: "llm", importance: "as_needed", envKeys: ["MISTRAL_API_KEY"], setupUrl: "https://console.mistral.ai/api-keys" },
  { id: "xai", name: "xAI (Grok)", category: "llm", importance: "as_needed", envKeys: ["XAI_API_KEY"], setupUrl: "https://console.x.ai" },
  { id: "ollama", name: "Ollama (local)", category: "llm", importance: "as_needed", envKeys: ["OLLAMA_HOST"], setupUrl: "https://ollama.com" },
  { id: "lm_studio", name: "LM Studio (local)", category: "llm", importance: "as_needed", envKeys: ["LM_STUDIO_HOST"], setupUrl: "https://lmstudio.ai" },
  { id: "claude_code", name: "Claude Code CLI", category: "agent_runtime", importance: "recommended", envKeys: ["ANTHROPIC_API_KEY"], setupUrl: "https://docs.anthropic.com/en/docs/claude-code" },
  { id: "codex_cli", name: "Codex CLI", category: "agent_runtime", importance: "as_needed", envKeys: ["OPENAI_API_KEY"], setupUrl: "https://platform.openai.com/docs/codex" },
  { id: "openclaw", name: "OpenClaw / OpenCode", category: "agent_runtime", importance: "as_needed", envKeys: ["OPENCLAW_GATEWAY_URL", "OPENCLAW_GATEWAY_TOKEN"], setupUrl: "https://github.com/openclaw/openclaw" },
  { id: "antigravity", name: "Antigravity CLI", category: "agent_runtime", importance: "as_needed", envKeys: ["ANTIGRAVITY_DIR"], setupUrl: "https://labs.google.com/antigravity" },
  { id: "ruflo", name: "Ruflo", category: "agent_runtime", importance: "as_needed", envKeys: [], setupUrl: "https://ruflo.dev" },
  { id: "hermes", name: "Hermes", category: "agent_runtime", importance: "as_needed", envKeys: ["HERMES_TOKEN"], setupUrl: "https://hermes.dev" },
  { id: "maestro", name: "Maestro", category: "agent_runtime", importance: "as_needed", envKeys: ["MAESTRO_TOKEN"], setupUrl: "https://maestro.mobile.dev" },
  { id: "browser_use", name: "Browser Use", category: "agent_runtime", importance: "as_needed", envKeys: ["BROWSER_USE_API_KEY"], setupUrl: "https://github.com/browser-use/browser-use" },
  { id: "notebooklm_agent", name: "NotebookLM Agent", category: "agent_runtime", importance: "as_needed", envKeys: ["NOTEBOOKLM_TOKEN"], setupUrl: "https://notebooklm.google.com" },
  { id: "higgsfield", name: "Higgsfield", category: "creative_media", importance: "as_needed", envKeys: ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"], setupUrl: "https://higgsfield.ai" },
  { id: "hunter", name: "Hunter.io", category: "vertical_api", importance: "as_needed", envKeys: ["HUNTER_API_KEY"], setupUrl: "https://hunter.io/api-keys" },
  { id: "hyperframes", name: "HyperFrames", category: "creative_media", importance: "as_needed", envKeys: ["HYPERFRAMES_API_KEY"], setupUrl: "https://hyperframes.ai" },
  { id: "hyperedit", name: "HyperEdit", category: "creative_media", importance: "as_needed", envKeys: ["HYPEREDIT_API_KEY"], setupUrl: "https://hyperedit.ai" },
  { id: "minimax", name: "MiniMax", category: "creative_media", importance: "as_needed", envKeys: ["MINIMAX_API_KEY"], setupUrl: "https://api.minimax.chat" },
  { id: "runway", name: "Runway", category: "creative_media", importance: "as_needed", envKeys: ["RUNWAY_API_KEY"], setupUrl: "https://runwayml.com" },
  { id: "elevenlabs", name: "ElevenLabs", category: "creative_media", importance: "as_needed", envKeys: ["ELEVENLABS_API_KEY"], setupUrl: "https://elevenlabs.io" },
  { id: "pika", name: "Pika", category: "creative_media", importance: "as_needed", envKeys: ["PIKA_API_KEY"], setupUrl: "https://pika.art" },
  { id: "heygen", name: "HeyGen", category: "creative_media", importance: "as_needed", envKeys: ["HEYGEN_API_KEY"], setupUrl: "https://heygen.com" },
  { id: "google_oauth", name: "Google OAuth", category: "productivity", importance: "recommended", envKeys: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"], setupUrl: "https://console.cloud.google.com/apis/credentials" },
  { id: "google_drive", name: "Google Drive", category: "productivity", importance: "as_needed", envKeys: [], setupUrl: "https://console.cloud.google.com/apis/library/drive.googleapis.com" },
  { id: "gmail", name: "Gmail", category: "productivity", importance: "as_needed", envKeys: [], setupUrl: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" },
  { id: "google_calendar", name: "Google Calendar", category: "productivity", importance: "as_needed", envKeys: [], setupUrl: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" },
  { id: "google_contacts", name: "Google Contacts", category: "productivity", importance: "as_needed", envKeys: [], setupUrl: "https://console.cloud.google.com/apis/library/people.googleapis.com" },
  { id: "notebooklm", name: "NotebookLM", category: "productivity", importance: "as_needed", envKeys: ["NOTEBOOKLM_REFRESH_TOKEN"], setupUrl: "https://notebooklm.google.com" },
  { id: "telegram_bot", name: "Telegram Bot", category: "communication", importance: "recommended", envKeys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], setupUrl: "https://t.me/BotFather" },
  { id: "slack", name: "Slack", category: "communication", importance: "as_needed", envKeys: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"], setupUrl: "https://api.slack.com/apps" },
  { id: "discord", name: "Discord", category: "communication", importance: "as_needed", envKeys: ["DISCORD_BOT_TOKEN"], setupUrl: "https://discord.com/developers/applications" },
  { id: "twilio", name: "Twilio", category: "communication", importance: "as_needed", envKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"], setupUrl: "https://console.twilio.com" },
  { id: "retell", name: "Retell", category: "communication", importance: "as_needed", envKeys: ["RETELL_API_KEY"], setupUrl: "https://retellai.com" },
  { id: "vapi", name: "VAPI", category: "communication", importance: "as_needed", envKeys: ["VAPI_API_KEY"], setupUrl: "https://vapi.ai" },
  { id: "resend", name: "Resend", category: "communication", importance: "recommended", envKeys: ["RESEND_API_KEY"], setupUrl: "https://resend.com/api-keys" },
  { id: "smtp", name: "SMTP", category: "communication", importance: "as_needed", envKeys: ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"], setupUrl: "" },
  { id: "notion", name: "Notion", category: "data_search_memory", importance: "as_needed", envKeys: ["NOTION_API_KEY"], setupUrl: "https://www.notion.so/my-integrations" },
  { id: "pinecone", name: "Pinecone", category: "data_search_memory", importance: "as_needed", envKeys: ["PINECONE_API_KEY"], setupUrl: "https://app.pinecone.io" },
  { id: "supabase", name: "Supabase", category: "data_search_memory", importance: "as_needed", envKeys: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], setupUrl: "https://app.supabase.com" },
  { id: "qdrant", name: "Qdrant", category: "data_search_memory", importance: "as_needed", envKeys: ["QDRANT_URL", "QDRANT_API_KEY"], setupUrl: "https://qdrant.tech" },
  { id: "firecrawl", name: "Firecrawl", category: "data_search_memory", importance: "as_needed", envKeys: ["FIRECRAWL_API_KEY"], setupUrl: "https://firecrawl.dev" },
  { id: "serpapi", name: "SerpAPI", category: "data_search_memory", importance: "as_needed", envKeys: ["SERPAPI_API_KEY"], setupUrl: "https://serpapi.com" },
  { id: "browserbase", name: "Browserbase", category: "data_search_memory", importance: "as_needed", envKeys: ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"], setupUrl: "https://browserbase.com" },
  { id: "apify", name: "Apify", category: "data_search_memory", importance: "as_needed", envKeys: ["APIFY_API_TOKEN"], setupUrl: "https://apify.com" },
  { id: "github", name: "GitHub", category: "devops", importance: "recommended", envKeys: ["GITHUB_TOKEN"], setupUrl: "https://github.com/settings/tokens" },
  { id: "vercel", name: "Vercel", category: "devops", importance: "as_needed", envKeys: ["VERCEL_TOKEN"], setupUrl: "https://vercel.com/account/tokens" },
  { id: "netlify", name: "Netlify", category: "devops", importance: "as_needed", envKeys: ["NETLIFY_TOKEN"], setupUrl: "https://app.netlify.com/user/applications" },
  { id: "digitalocean", name: "DigitalOcean", category: "devops", importance: "as_needed", envKeys: ["DIGITALOCEAN_TOKEN"], setupUrl: "https://cloud.digitalocean.com/account/api/tokens" },
  { id: "docker_registry", name: "Docker registry", category: "devops", importance: "as_needed", envKeys: ["DOCKER_REGISTRY_USERNAME", "DOCKER_REGISTRY_PASSWORD"], setupUrl: "https://hub.docker.com/settings/security" },
  { id: "rentcast", name: "Rentcast", category: "vertical_api", importance: "as_needed", envKeys: ["RENTCAST_API_KEY"], setupUrl: "https://app.rentcast.io" },
  { id: "zillow_rapidapi", name: "Zillow (RapidAPI)", category: "vertical_api", importance: "as_needed", envKeys: ["RAPIDAPI_KEY"], setupUrl: "https://rapidapi.com" },
  { id: "mls_bridge", name: "MLS / Bridge", category: "vertical_api", importance: "as_needed", envKeys: ["BRIDGE_API_KEY"], setupUrl: "https://bridgeinteractive.com" },
  { id: "propcontrol", name: "PropControl", category: "vertical_api", importance: "as_needed", envKeys: ["PROPCONTROL_TOKEN"], setupUrl: "https://propcontrol.netlify.app/" },
  { id: "visionops", name: "VisionOps", category: "vertical_api", importance: "as_needed", envKeys: ["VISIONOPS_TOKEN"], setupUrl: "https://rehab-vision.emergent.host" },
  { id: "voiceops", name: "VoiceOps", category: "vertical_api", importance: "as_needed", envKeys: ["VOICEOPS_TOKEN"], setupUrl: "" },
];

export const PROVIDER_BY_ID: Record<string, Provider> = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  llm: "Models & LLM APIs",
  agent_runtime: "Agent runtimes",
  creative_media: "Creative & media",
  data_search_memory: "Data, search & memory",
  communication: "Communication",
  productivity: "Productivity",
  devops: "DevOps",
  vertical_api: "Vertical APIs",
};

/** Status of one provider as reported by /api/credentials — never a raw secret. */
export interface ProviderStatus {
  id: string;
  present: boolean;
  source: "env" | "op" | "file" | null;
  /** e.g. "sk-o…9d7 (12 chars)" — safe to render anywhere. */
  maskedPreview: string | null;
  envKeyUsed: string | null;
  opReference: string | null;
}
