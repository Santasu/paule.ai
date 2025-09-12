// filename: api/assets/index.js
module.exports = async (req, res) => {
  const { getSql } = require('../../lib/db-any');
  const sql = await getSql();

  const userKey = req.headers['x-user-id'] || null; // dev režimas
  if (req.method === 'GET') {
    if (userKey) {
      const rows = await sql`
        SELECT id, type, url, meta, is_public, created_at
        FROM assets
        WHERE user_id = (SELECT id FROM users WHERE clerk_id = ${String(userKey)})
        ORDER BY created_at DESC
        LIMIT 100
      `;
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ assets: rows });
    } else {
      const rows = await sql`
        SELECT id, type, url, meta, created_at
        FROM assets
        WHERE is_public = TRUE
        ORDER BY created_at DESC
        LIMIT 100
      `;
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ assets: rows });
    }
  }

  if (req.method === 'POST') {
    if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    const type = String(b.type || '');
    const url = String(b.url || '');
    const meta = b.meta || {};
    const isPublic = !!b.is_public;
    if (!['song','photo','video'].includes(type) || !url) {
      return res.status(400).json({ error: 'Need type(song|photo|video) and url' });
    }

    // ensure user row
    await sql`INSERT INTO users (clerk_id) VALUES (${String(userKey)}) ON CONFLICT (clerk_id) DO NOTHING`;

    const rows = await sql`
      INSERT INTO assets (user_id, type, url, meta, is_public)
      VALUES ((SELECT id FROM users WHERE clerk_id = ${String(userKey)}), ${type}, ${url}, ${sql.json(meta)}, ${isPublic})
      RETURNING *
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow','GET, POST');
  res.status(405).json({ error: 'Method Not Allowed' });
};
