const { env, sendJSON, pickAutoModel, normalizeModelId, aliasOf } = require("./_utils");
const { withCORS } = require("../lib/cors"); // <- kelias iš api/ į lib/

async function handler(_req, res) {
  const avail = [];
  if (env.TOGETHER)  avail.push(normalizeModelId("meta-llama/Llama-4-Scout-17B-16E-Instruct"));
  if (env.OPENAI)    avail.push(normalizeModelId("gpt-4o-mini"));
  if (env.ANTHROPIC) avail.push(normalizeModelId("claude-4-sonnet"));
  if (env.XAI)       avail.push(normalizeModelId("grok-4"));
  if (env.GOOGLE)    avail.push(normalizeModelId("gemini-2.5-flash"));
  if (env.DEEPSEEK)  avail.push(normalizeModelId("deepseek-chat"));

  const uniq = [...new Set(avail)];
  return sendJSON(res, 200, {
    ok: true,
    default_models: [{ id: "auto", alias: "Auto" }],
    available: uniq.map(m => ({ id: m, alias: aliasOf(m) })),
    sse_enabled: true
  });
}

module.exports = withCORS(handler); 
