// api/models.js
const { FLAGS, ALLOWED_ORIGIN } = require("../lib/env");

const normalizeModelId = (id) => String(id); // paliekam kaip yra

function availableModels() {
  const env = FLAGS;
  const avail = [];

  if (env.TOGETHER)  avail.push(normalizeModelId("meta-llama/Llama-4-Scout-17B-16E-Instruct"));
  if (env.OPENAI)    avail.push(normalizeModelId("gpt-4o-mini"));
  if (env.ANTHROPIC) avail.push(normalizeModelId("claude-4-sonnet"));
  if (env.XAI)       avail.push(normalizeModelId("grok-4"));
  if (env.GOOGLE)    avail.push(normalizeModelId("gemini-2.5-flash"));
  if (env.DEEPSEEK)  avail.push(normalizeModelId("deepseek-chat"));

  return avail;
}

module.exports = async (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  res.status(200).json({
    ok: true,
    available: availableModels()
  });
};
