// lib/cors.js
function withCORS(handler, {
  origin  = '*',
  methods = 'GET,POST,OPTIONS',
  headers = 'Content-Type, Authorization, X-Requested-With'
} = {}) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    try {
      return await handler(req, res);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok:false, error:'INTERNAL', detail:String(e?.message || e) });
    }
  };
}
module.exports = { withCORS }; 
