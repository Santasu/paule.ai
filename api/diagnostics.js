export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','no-store');

  return res.status(200).json({
    ok:true,
    time: new Date().toISOString(),
    env: { node: process.version, vercel: !!process.env.VERCEL },
    endpoints: ['/api/stream','/api/models','/api/complete','/api/suggest','/api/library/recent'],
  });
}
