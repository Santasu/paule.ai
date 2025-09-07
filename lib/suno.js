// lib/suno.js
const { SUNO_KEY } = require("./env");
const BASE = "https://api.suno.ai/v1";

async function sunoFetch(path, opts = {}) {
  if (!SUNO_KEY) throw new Error("SUNO_API_KEY is missing");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${SUNO_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Suno ${res.status}: ${txt}`);
  }
  return res.json();
}

module.exports = { sunoFetch };
