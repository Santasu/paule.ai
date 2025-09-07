const getEnv = require('./_lib/env');

module.exports = (req, res) => {
  const env = getEnv();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = (req.headers['x-forwarded-proto'] || 'https');

  const baseA = `${proto}://${host}/api/paule/v1`;
  const baseW = `${proto}://${host}/wp-json/paule/v1`;

  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({
    ok: true,
    message: "Paule diagnostics",
    endpoints: {
      models_api: [`${baseA}/models`, `${baseW}/models`],
      stream_api: [`${baseA}/stream`, `${baseW}/stream`],
      media: {
        flux_create: [`${baseA}/flux/create`, `${baseW}/flux/create`],
        comic_create:[`${baseA}/comic/create`,`${baseW}/comic/create`],
        runway_image:[`${baseA}/runway/image`,`${baseW}/runway/image`],
        runway_status:[`${baseA}/runway/status`,`${baseW}/runway/status`],
        music_create:[`${baseA}/music/create`,`${baseW}/music/create`],
        music_status:[`${baseA}/music/status`,`${baseW}/music/status`]
      }
    },
    env_present: env._mask
  }));
};
