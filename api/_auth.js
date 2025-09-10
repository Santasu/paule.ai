// _auth.js
function getEnv() {
  return {
    OPENAI: process.env.OPENAI_API_KEY || '',
    TOGETHER: process.env.TOGETHER_API_KEY || '',
    ANTHROPIC: process.env.ANTHROPIC_API_KEY || '',
    GOOGLE: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '',
    XAI: process.env.XAI_API_KEY || '',
    DEEPSEEK: process.env.DEEPSEEK_API_KEY || '',
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || ''
  };
}
module.exports = { getEnv };
