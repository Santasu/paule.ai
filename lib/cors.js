export function withCORS(handler, {
  origin = '*',
  methods = 'GET,POST,OPTIONS',
  headers = '*'
} = {}) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', methods);
      res.setHeader('Access-Control-Allow-Headers', headers);
      return res.status(204).end();
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Cache-Control', 'no-store');
    return handler(req, res);
  };
}
