// api/_utils/env.js
const get = (k) => (process.env[k] || '').trim();
const present = (k) => !!get(k);

const ENV = {
  OPENAI:   present('OPENAI_API_KEY'),
  ANTHROPIC:present('ANTHROPIC_API_KEY'),
  GOOGLE:   present('GOOGLE_API_KEY'),
  XAI:      present('XAI_API_KEY'),
  DEEPSEEK: present('DEEPSEEK_API_KEY'),
  TOGETHER: present('TOGETHER_API_KEY'),

  RUNWAY:   present('RUNWAY_API_KEY'),
  SUNO:     present('SUNO_API_KEY'),
  FLUX:     present('FLUX_API_KEY'),

  ADMIN_TOKEN_SET:  present('ADMIN_SECRET'),
  VERCEL_API_TOKEN: present('VERCEL_TOKEN'),
  VERCEL_PROJECT_ID:present('VERCEL_PROJECT_ID'),

  ORIGIN: get('PAULE_ALLOWED_ORIGIN') // gali būti tuščias
};

function availableModels(){
  const out = [];
  // visada turim „Paule AI“ (numatytasis)
  out.push({ id:'paule-ai', label:'Paule AI', provider: ENV.TOGETHER ? 'together' : 'local', family:'chat', default:true });
  if (ENV.TOGETHER) out.push({ id:'meta-llama/Llama-4-Scout-17B-16E-Instruct', label:'Llama', provider:'together', family:'chat' });
  if (ENV.OPENAI)   out.push({ id:'gpt-4o-mini',      label:'ChatGPT', provider:'openai', family:'chat' });
  if (ENV.ANTHROPIC)out.push({ id:'claude-4-sonnet',  label:'Claude',  provider:'anthropic', family:'chat' });
  if (ENV.GOOGLE)   out.push({ id:'gemini-2.5-flash', label:'Gemini',  provider:'google', family:'chat' });
  if (ENV.XAI)      out.push({ id:'grok-4',           label:'Grok',    provider:'xai', family:'chat' });
  if (ENV.DEEPSEEK) out.push({ id:'deepseek-chat',    label:'DeepSeek',provider:'deepseek', family:'chat' });
  return out;
}

module.exports = { ENV, availableModels };
