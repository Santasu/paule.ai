// /api/models.js
module.exports = async (req, res) => {
  const ok = (name) => Boolean(process.env[name] && String(process.env[name]).trim() !== '');

  const models = [
    // OpenAI
    { id: 'gpt-4o-mini', label: 'ChatGPT', provider: 'openai', family: 'chat' },

    // Anthropic (Claude 4 Sonnet)
    { id: 'claude-4-sonnet', label: 'Claude', provider: 'anthropic', family: 'chat' },

    // Google (Gemini 2.5 Flash)
    { id: 'gemini-2.5-flash', label: 'Gemini', provider: 'google', family: 'chat' },

    // xAI (Grok 4)
    { id: 'grok-4', label: 'Grok', provider: 'xai', family: 'chat' },

    // DeepSeek
    { id: 'deepseek-chat', label: 'DeepSeek', provider: 'deepseek', family: 'chat' },

    // Together (Llama)
    {
      id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
      label: 'Llama',
      provider: 'together',
      family: 'chat'
    }
  ];

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    ok: true,
    brand: 'Paule AI',
    default: 'paule-ai',
    models,
    env_present: {
      OPENAI: ok('OPENAI_API_KEY'),
      ANTHROPIC: ok('ANTHROPIC_API_KEY'),
      GOOGLE: ok('GOOGLE_API_KEY'),
      XAI: ok('XAI_API_KEY'),
      DEEPSEEK: ok('DEEPSEEK_API_KEY'),
      TOGETHER: ok('TOGETHER_API_KEY')
    }
  });
};
