// filename: api/assets/upload.js
// Body size iki ~30 MB
module.exports.config = { api: { bodyParser: { sizeLimit: '30mb' } } };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')  return res.status(405).json({ error: 'Method Not Allowed' });

  const userKey = req.headers['x-user-id'] || null;
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { dataUrl, filename, type, is_public, meta } = req.body || {};
    if (!dataUrl || !/^data:/.test(dataUrl)) {
      return res.status(400).json({ error: 'Provide dataUrl (base64) and filename' });
    }
    if (!['song','photo','video'].includes(String(type || ''))) {
      return res.status(400).json({ error: 'type must be song|photo|video' });
    }

    const { put } = require('@vercel/blob');
    const match = dataUrl.match(/^data:(.+?);base64,(.*)$/);
    const contentType = match ? match[1] : 'application/octet-stream';
    const base64 = match ? match[2] : '';
    const buffer = Buffer.from(base64, 'base64');

    const safeName = (filename || `file-${Date.now()}`).replace(/[^a-z0-9._-]+/gi, '_');
    const blob = await put(safeName, buffer, {
      access: is_public ? 'public' : 'private',
      contentType
    });

    // DB įrašas
    const { getSql } = require('../../lib/db-any');
    const sql = await getSql();

    // ensure user
    await sql`INSERT INTO users (clerk_id) VALUES (${String(userKey)}) ON CONFLICT (clerk_id) DO NOTHING`;

    const rows = await sql`
      INSERT INTO assets (user_id, type, url, meta, is_public)
      VALUES (
        (SELECT id FROM users WHERE clerk_id = ${String(userKey)}),
        ${String(type)}, ${blob.url}, ${sql.json(meta || {})}, ${!!is_public}
      )
      RETURNING id, type, url, meta, is_public, created_at
    `;

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok: true, blob: blob, asset: rows[0] });
  } catch (e) {
    console.error('upload error', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
};
