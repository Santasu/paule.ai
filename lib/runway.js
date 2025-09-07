// lib/runway.js
const { RUNWAY_KEY } = require("./env");
const BASE = "https://api.runwayml.com/v1";

async function runwayFetch(path, opts = {}) {
  if (!RUNWAY_KEY) throw new Error("RUNWAY_API_KEY is missing");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${RUNWAY_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Runway ${res.status}: ${txt}`);
  }
  return res.json();
}

module.exports = { runwayFetch };
