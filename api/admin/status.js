// api/admin/status.js
const { snapshot, ALLOWED_ORIGIN } = require("../../lib/env");

module.exports = async (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.status(200).json({ ok: true, env: snapshot() });
};
