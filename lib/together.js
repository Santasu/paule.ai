// lib/together.js
const { TOGETHER_KEY } = require("./env");
const BASE = "https://api.together.xyz/v1";

async function togetherFetch(path, opts = {}) {
  if (!TOGETHER_KEY) throw new Error("TOGETHER_API_KEY is missing");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${TOGETHER_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Together ${res.status}: ${txt}`);
  }
  return res.json();
}

// pavyzdys: modelių sąrašas (keisk pagal realų Together endpointą)
async function listModels() {
  return togetherFetch("/models");
}

module.exports = { togetherFetch, listModels };
