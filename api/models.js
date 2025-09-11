// api/models.js
export default async function handler(_req, res) {
  const ICONS = '/assets/icon';
  const models = [];

  if (process.env.OPENAI_API_KEY) {
    models.push({ key:'paule',   id:'gpt-5-mini', label:'Paule',   icon:`${ICONS}/ai.svg` });
    models.push({ key:'chatgpt', id:'gpt-5-mini', label:'ChatGPT', icon:`${ICONS}/chatgpt.svg` });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    models.push({ key:'claude', id:'claude-4-sonnet', label:'Claude', icon:`${ICONS}/claude-seeklogo.svg` });
  }
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    models.push({ key:'gemini', id:'gemini-2.5-flash', label:'Gemini', icon:`${ICONS}/gemini.svg` });
  }
  if (process.env.XAI_API_KEY) {
    models.push({ key:'grok', id:'grok-4', label:'Grok', icon:`${ICONS}/xAI.svg` });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    models.push({ key:'deepseek', id:'deepseek-chat', label:'DeepSeek', icon:`${ICONS}/deepseek.svg` });
  }
  if (process.env.TOGETHER_API_KEY) {
    models.push({ key:'llama', id:'meta-llama/Llama-4-Scout-17B-16E-Instruct', label:'Llama', icon:`${ICONS}/llama.svg` });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok:true, models }));
}
