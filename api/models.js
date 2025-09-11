// filename: api/models.js
export const config = { runtime: 'edge' };

function present(k){ return !!(process.env[k]||'').trim(); }
const ICONS = '/assets/icon';

export default async function handler() {
  const models = [];
  if (present('OPENAI_API_KEY')) {
    models.push({ key:'chatgpt', id:'gpt-5-mini', label:'ChatGPT', icon:`${ICONS}/chatgpt.svg` });
  }
  if (present('ANTHROPIC_API_KEY')) {
    models.push({ key:'claude', id:'claude-4-sonnet', label:'Claude', icon:`${ICONS}/claude-seeklogo.svg` });
  }
  if (present('GOOGLE_API_KEY') || present('GEMINI_API_KEY')) {
    models.push({ key:'gemini', id:'gemini-2.5-flash', label:'Gemini', icon:`${ICONS}/gemini.svg` });
  }
  if (present('XAI_API_KEY')) {
    models.push({ key:'grok', id:'grok-4', label:'Grok', icon:`${ICONS}/xAI.svg` });
  }
  if (present('DEEPSEEK_API_KEY')) {
    const ds = (process.env.DEEPSEEK_MODEL||'deepseek-v3.1').trim();
    models.push({ key:'deepseek', id: ds, label:'DeepSeek', icon:`${ICONS}/deepseek.svg` });
  }
  if (present('TOGETHER_API_KEY') || present('OPENROUTER_API_KEY')) {
    models.push({ key:'llama', id:'meta-llama/Llama-4-Scout-17B-16E-Instruct', label:'Llama', icon:`${ICONS}/llama.svg` });
  }
  // Paule – atskirai, tik jei yra Together (kad eitų per Together, ne per OpenRouter)
  if (present('TOGETHER_API_KEY')) {
    models.push({ key:'paule', id:'openai/gpt-oss-20b', label:'Paule', icon:`${ICONS}/ai.svg` });
  }

  return new Response(JSON.stringify({ ok:true, models }), {
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' }
  });
}
export default async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    llama: false,
    services: {
      suno: !!process.env.SUNO_API_KEY,
      bfl:  !!process.env.BFL_API_KEY,
      runway: !!process.env.RUNWAYML_API_SECRET
    }
  });
}

