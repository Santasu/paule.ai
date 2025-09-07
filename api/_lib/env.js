// CommonJS – be "type": "module"
const BOOL = v => (typeof v === 'string' ? v.trim() : v) ? true : false;

module.exports = function getEnv() {
  const e = process.env;

  const env = {
    // AI teikėjų raktai
    OPENAI:     BOOL(e.OPENAI_API_KEY),
    ANTHROPIC:  BOOL(e.ANTHROPIC_API_KEY),
    TOGETHER:   BOOL(e.TOGETHER_API_KEY),
    XAI:        BOOL(e.XAI_API_KEY),          // Grok
    GOOGLE:     BOOL(e.GOOGLE_API_KEY),       // Gemini
    DEEPSEEK:   BOOL(e.DEEPSEEK_API_KEY),

    // Media servisai
    RUNWAY:     BOOL(e.RUNWAY_API_KEY),
    SUNO:       BOOL(e.SUNO_API_KEY),
    FLUX:       BOOL(e.FLUX_API_KEY),

    // Admin opcionaliai
    ADMIN_TOKEN_SET: BOOL(e.ADMIN_TOKEN),
    VERCEL_API_TOKEN: BOOL(e.VERCEL_API_TOKEN),
    VERCEL_PROJECT_ID: BOOL(e.VERCEL_PROJECT_ID)
  };

  // padedam ir tikras vertes (saugumo sumetimais – tik ar yra, ne pačios reikšmės)
  env._mask = Object.fromEntries(Object.entries(env).map(([k,v]) => [k, !!v]));
  return env;
};
