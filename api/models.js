// api/models.js
const { ENV, availableModels } = require('./_utils/env');

module.exports = async (req, res) => {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.status(200).json({
    ok: true,
    brand: 'Paule AI',
    default: 'paule-ai',
    models: availableModels(),
    env_present: {
      OPENAI: ENV.OPENAI, ANTHROPIC: ENV.ANTHROPIC, GOOGLE: ENV.GOOGLE, XAI: ENV.XAI,
      DEEPSEEK: ENV.DEEPSEEK, TOGETHER: ENV.TOGETHER, RUNWAY: ENV.RUNWAY, SUNO: ENV.SUNO,
      FLUX: ENV.FLUX, ADMIN_TOKEN_SET: ENV.ADMIN_TOKEN_SET, VERCEL_API_TOKEN: ENV.VERCEL_API_TOKEN,
      VERCEL_PROJECT_ID: ENV.VERCEL_PROJECT_ID
    }
  });
};
