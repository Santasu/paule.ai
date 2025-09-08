// /api/models.js
module.exports = async (req, res) => {
  const ok = (n) => Boolean(process.env[n] && String(process.env[n]).trim() !== '');

  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.status(200).json({
    ok: true,
    brand: 'Paule AI',
    default: 'paule-ai',
    models: [
      { id: 'gpt-4o-mini', label: 'ChatGPT', provider: 'openai', family: 'chat' },
      { id: 'claude-4-sonnet', label: 'Claude', provider: 'anthropic', family: 'chat' },
      { id: 'gemini-2.5-flash', label: 'Gemini', provider: 'google', family: 'chat' },
      { id: 'grok-4', label: 'Grok', provider: 'xai', family: 'chat' },
      { id: 'deepseek-chat', label: 'DeepSeek', provider: 'deepseek', family: 'chat' },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama', provider: 'together', family: 'chat' }
    ],
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
