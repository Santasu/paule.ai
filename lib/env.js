// lib/env.js (CommonJS)
const get = (k, d = "") => process.env[k] || d;

const flags = {
  OPENAI:    !!process.env.OPENAI_API_KEY,
  ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
  GOOGLE:    !!process.env.GOOGLE_API_KEY,
  XAI:       !!process.env.XAI_API_KEY,
  DEEPSEEK:  !!process.env.DEEPSEEK_API_KEY,
  TOGETHER:  !!process.env.TOGETHER_API_KEY,

  RUNWAY:    !!process.env.RUNWAY_API_KEY,
  SUNO:      !!process.env.SUNO_API_KEY,
  FLUX:      !!process.env.FLUX_API_KEY
};

module.exports = {
  // žali raktai (naudok tik server-side)
  KEYS: {
    OPENAI:    get("OPENAI_API_KEY"),
    ANTHROPIC: get("ANTHROPIC_API_KEY"),
    GOOGLE:    get("GOOGLE_API_KEY"),
    XAI:       get("XAI_API_KEY"),
    DEEPSEEK:  get("DEEPSEEK_API_KEY"),
    TOGETHER:  get("TOGETHER_API_KEY"),
    RUNWAY:    get("RUNWAY_API_KEY"),
    SUNO:      get("SUNO_API_KEY"),
    FLUX:      get("FLUX_API_KEY")
  },
  FLAGS: flags,
  ALLOWED_ORIGIN: get("PAULE_ALLOWED_ORIGIN", "*"),

  // Admin (nebūtina, tik jei nori iš UI įrašinėti į Vercel env)
  ADMIN: {
    TOKEN: get("VERCEL_TOKEN"),
    PROJECT_ID: get("VERCEL_PROJECT_ID"),
    SECRET: get("ADMIN_SECRET")
  },

  snapshot() {
    // niekada negražinam pačių raktų – tik booleanus
    return { ...flags };
  }
};
