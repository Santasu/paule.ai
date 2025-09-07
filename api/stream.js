// api/stream.js
const { ALLOWED_ORIGIN } = require("../lib/env");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const isPost = req.method === "POST";
    const q = isPost ? req.body || {} : Object.fromEntries(new URL(req.url, "http://x").searchParams);
    const message = String(q.message || "").trim();
    const modelsCSV = String(q.models || q.model || "").trim();
    const models = modelsCSV ? modelsCSV.split(",").map(s => s.trim()).filter(Boolean) : ["gpt-4o-mini"];

    // TEST/DEMO atsakymas
    const answers = models.map(m => ({
      model: m,
      text: `🧪 PAULE stub: gavau žinutę „${message || "—"}“, modelis: ${m}.`,
      ok: true
    }));

    res.status(200).json({ ok: true, chat_id: "paule_" + Date.now(), answers });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
