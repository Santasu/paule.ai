// /api/models.js
// Vercel serverless handler. Gražina UI'ui modelių sąrašą ir env būsenas.
// Jokių kitų failų nereikia – veikia savarankiškai.

module.exports = async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    // Aplinkos raktų buvimas (kad UI galėtų rodyti kas sukonfigūruota)
    const env_present = {
      OPENAI:            !!process.env.OPENAI_API_KEY,
      ANTHROPIC:         !!process.env.ANTHROPIC_API_KEY,
      GOOGLE:            !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY,
      XAI:               !!process.env.XAI_API_KEY,
      DEEPSEEK:          !!process.env.DEEPSEEK_API_KEY,
      TOGETHER:          !!process.env.TOGETHER_API_KEY,
      RUNWAY:            !!process.env.RUNWAY_API_KEY,
      SUNO:              !!process.env.SUNO_API_KEY,
      FLUX:              !!process.env.FLUX_API_KEY,
      ADMIN_TOKEN_SET:   !!process.env.ADMIN_TOKEN,
      VERCEL_API_TOKEN:  !!process.env.VERCEL_API_TOKEN,
      VERCEL_PROJECT_ID: !!process.env.VERCEL_PROJECT_ID,
    };

    // Pagrindinis modelių sąrašas (rodymas UI ir ID, kuriais kviestas /api/stream)
    const models = [
      { id: 'paule-ai', label: 'Paule AI', provider: 'together', family: 'chat', default: true },

      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama',   provider: 'together', family: 'chat' },
      { id: 'gpt-4o-mini',                               label: 'ChatGPT', provider: 'openai',   family: 'chat' },
      { id: 'claude-4-sonnet',                           label: 'Claude',  provider: 'anthropic',family: 'chat' },
      { id: 'gemini-2.5-flash',                          label: 'Gemini',  provider: 'google',   family: 'chat' },
      { id: 'grok-4',                                    label: 'Grok',    provider: 'xai',      family: 'chat' },
      { id: 'deepseek-chat',                             label: 'DeepSeek',provider: 'deepseek', family: 'chat' },
    ];

    // Patogūs alias'ai (jei UI ar /api/stream gauna "claude", "gemini" ir pan.)
    const aliases = {
      // OpenAI
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4o':      'gpt-4o-mini',

      // Anthropic (Claude 4 Sonnet)
      'claude':           'claude-4-sonnet',
      'claude-4':         'claude-4-sonnet',
      'claude-4-sonnet':  'claude-4-sonnet',

      // xAI (Grok 4)
      'grok':   'grok-4',
      'grok-4': 'grok-4',

      // Google (Gemini 2.5 Flash)
      'gemini':           'gemini-2.5-flash',
      'gemini-2.5-flash': 'gemini-2.5-flash',

      // Together (Llama)
      'llama': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    };

    res.status(200).json({
      ok: true,
      brand: 'Paule AI',
      default: 'paule-ai',
      models,
      aliases,
      env_present
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
