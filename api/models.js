// /api/models.js
const { autoModel, cors } = require("../lib/ai");

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const available = [];
  if (process.env.TOGETHER_API_KEY) available.push("meta-llama/Llama-3.1-8B-Instruct-Turbo");
  if (process.env.OPENAI_API_KEY)   available.push("gpt-4o-mini");
  if (process.env.ANTHROPIC_API_KEY)available.push("claude-3-5-sonnet-20240620");
  if (process.env.XAI_API_KEY)      available.push("grok-2-mini");
  if (process.env.GOOGLE_API_KEY)   available.push("gemini-1.5-flash");
  if (process.env.DEEPSEEK_API_KEY) available.push("deepseek-chat");

  res.status(200).json({
    ok: true,
    default_models: [{ id:"auto", alias:"Auto" }],
    available: available.map(id=>({ id, alias: humanAlias(id) })),
    aliases: { auto:"Auto" },
    sse_enabled: true,
    version: "paule-router-1.0.0"
  });
};

function humanAlias(id) {
  const l = id.toLowerCase();
  if (l.includes("gpt-4o")) return "ChatGPT 4o mini";
  if (l.includes("gpt")) return "ChatGPT";
  if (l.includes("claude")) return "Claude";
  if (l.includes("gemini")) return "Gemini";
  if (l.includes("grok")) return "Grok";
  if (l.includes("llama")) return "Llama";
  if (l.includes("deepseek")) return "DeepSeek";
  return id;
}
