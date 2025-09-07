// api/diagnostics.js  (CommonJS)
const { snapshot, ALLOWED_ORIGIN } = require("../lib/env");

// Paprasta CORS kontrole, jei reikia
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      setCors(res); return res.status(200).end();
    }
    setCors(res);

    // NEGRĄŽINAME tikrų rakto reikšmių, tik true/false:
    const env = snapshot();

    // minimalus „gyvybės“ atsakymas
    res.status(200).json({
      ok: true,
      runtime: "node",
      node: process.version,
      env
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
