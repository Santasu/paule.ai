// /lib/ai.js (CommonJS — nenaudok "type":"module")
const PROVIDERS = {
  openai:  { url: "https://api.openai.com/v1/chat/completions",     key: process.env.OPENAI_API_KEY,  header: "Authorization" },
  together:{ url: "https://api.together.xyz/v1/chat/completions",   key: process.env.TOGETHER_API_KEY,header: "Authorization" },
  deepseek:{ url: "https://api.deepseek.com/chat/completions",      key: process.env.DEEPSEEK_API_KEY,header: "Authorization" },
  xai:     { url: "https://api.x.ai/v1/chat/completions",           key: process.env.XAI_API_KEY,     header: "Authorization" },
  anthropic:{url: "https://api.anthropic.com/v1/messages",          key: process.env.ANTHROPIC_API_KEY,header:"x-api-key" },
  google:  { url: "https://generativelanguage.googleapis.com/v1beta",key: process.env.GOOGLE_API_KEY, header: "x-goog-api-key" }
};

function guessProvider(modelId="") {
  const m = (modelId||"").toLowerCase();
  if (m.includes("gpt") || m.includes("openai")) return "openai";
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini") || m.includes("google")) return "google";
  if (m.includes("grok") || m.includes("x.ai")) return "xai";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("llama") || m.includes("meta-llama")) return "together";
  return "openai";
}

function autoModel() {
  if (process.env.TOGETHER_API_KEY) return "meta-llama/Llama-3.1-8B-Instruct-Turbo";
  if (process.env.OPENAI_API_KEY)   return "gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY)return "claude-3-5-sonnet-20240620";
  if (process.env.XAI_API_KEY)      return "grok-2-mini";
  if (process.env.GOOGLE_API_KEY)   return "gemini-1.5-flash";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek-chat";
  return "gpt-4o-mini";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = { PROVIDERS, guessProvider, autoModel, cors };
