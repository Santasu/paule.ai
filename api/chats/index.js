// filename: api/chats/index.js
module.exports = async (req, res) => {
  const { getSql } = require('../../lib/db-any');
  const sql = await getSql();
  const userKey = req.headers['x-user-id'] || null;
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  // ensure user row
  await sql`INSERT INTO users (clerk_id) VALUES (${String(userKey)}) ON CONFLICT (clerk_id) DO NOTHING`;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, title, created_at
      FROM chats
      WHERE user_id = (SELECT id FROM users WHERE clerk_id = ${String(userKey)})
      ORDER BY created_at DESC LIMIT 50
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ chats: rows });
  }

  if (req.method === 'POST') {
    const title = (req.body && req.body.title ? String(req.body.title) : 'Naujas pokalbis').slice(0,160);
    const rows = await sql`
      INSERT INTO chats (user_id, title)
      VALUES ((SELECT id FROM users WHERE clerk_id = ${String(userKey)}), ${title})
      RETURNING id, title, created_at
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow','GET, POST');
  res.status(405).json({ error: 'Method Not Allowed' });
};
