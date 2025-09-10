// _utils.js
const urlMod = require('url');

function sendSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
}

function sendEvent(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  if (data != null) res.write(`data: ${data}\n\n`);
  else res.write(`data: \n\n`);
}

function endSSE(res) {
  try { res.write(`event: done\ndata: {"finish_reason":"stop"}\n\n`); } catch {}
  res.end();
}

function jsonOK(res, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200; res.end(JSON.stringify(obj));
}
const jsonERR = (res, obj, code = 500) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = code; res.end(JSON.stringify(obj));
};
const okJSON = jsonOK, badJSON = jsonERR; // aliasai

function readQuery(req) {
  const u = urlMod.parse(req.url, true);
  return u.query || {};
}

function guessProvider(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return 'openai';
  if (m.includes('gpt') || m.startsWith('o')) return 'openai';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('llama') || m.includes('meta-llama') || m.includes('together')) return 'together';
  if (m.includes('claude')) return 'anthropic';
  if (m.includes('gemini') || m.includes('bison') || m.includes('palm')) return 'google';
  if (m.includes('grok')) return 'xai';
  return 'openai';
}

// "auto" prioritetas – jei nori ChatGPT pirmu, sukeisk OPENAI su TOGETHER vietomis
function pickAutoModel(env) {
  if (env.OPENAI) return 'gpt-4o-mini';
  if (env.TOGETHER) return 'meta-llama/Llama-4-Scout-17B-16E-Instruct';
  if (env.ANTHROPIC) return 'claude-4-sonnet';
  if (env.XAI) return 'grok-4';
  if (env.GOOGLE) return 'gemini-2.5-flash';
  if (env.DEEPSEEK) return 'deepseek-chat';
  return 'gpt-4o-mini';
}

module.exports = {
  sendSSEHeaders, sendEvent, endSSE,
  jsonOK, jsonERR, okJSON, badJSON,
  readQuery, guessProvider, pickAutoModel
};

