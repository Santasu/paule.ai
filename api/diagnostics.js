const { env, sendJSON } = require("./_utils");

module.exports = async (_req, res) => {
  // Lengva diagnostika – tik raktų buvimas (be brangių ping’ų)
  sendJSON(res, 200, {
    ok: true,
    services: {
      together: { ok: !!env.TOGETHER },
      suno:     { ok: !!env.SUNO_KEY },
      runway:   { ok: !!env.RUNWAY_KEY }
    }
  });
};
