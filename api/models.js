const getEnv = require('./_lib/env');

function normalizeModelId(id){ return String(id).trim(); }

module.exports = (req, res) => {
  const env = getEnv();

  const avail = [];
  if (env.TOGETHER)  avail.push(normalizeModelId("meta-llama/Llama-4-Scout-17B-16E-Instruct"));
  if (env.OPENAI)    avail.push(normalizeModelId("gpt-4o-mini"));
  if (env.ANTHROPIC) avail.push(normalizeModelId("claude-4-sonnet"));
  if (env.XAI)       avail.push(normalizeModelId("grok-4"));
  if (env.GOOGLE)    avail.push(normalizeModelId("gemini-2.5-flash"));
  if (env.DEEPSEEK)  avail.push(normalizeModelId("deepseek-chat"));

  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ ok:true, available: avail }));
};

