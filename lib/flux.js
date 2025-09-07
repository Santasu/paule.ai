// lib/flux.js
const { FLUX_KEY } = require("./env");
const BASE = "https://api.flux-ai.example/v1"; // ← pakeisk pagal savo tiekėją

async function fluxFetch(path, opts = {}) {
  if (!FLUX_KEY) throw new Error("FLUX_API_KEY is missing");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${FLUX_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Flux ${res.status}: ${txt}`);
  }
  return res.json();
}

module.exports = { fluxFetch };
