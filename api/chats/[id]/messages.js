// filename: api/chats/[id]/messages.js
module.exports = async (req, res) => {
  const { getSql } = require('../../../lib/db-any');
  const sql = await getSql();
  const userKey = req.headers['x-user-id'] || null;
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const chatId = req.query.id;

  // ownership check
  const own = await sql`
    SELECT 1 FROM chats
    WHERE id = ${chatId}
      AND user_id = (SELECT id FROM users WHERE clerk_id = ${String(userKey)})
    LIMIT 1
  `;
  if (!own[0]) return res.status(404).json({ error: 'Not found' });

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, role, content, created_at
      FROM messages
      WHERE chat_id = ${chatId}
      ORDER BY created_at ASC
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ messages: rows });
  }

  if (req.method === 'POST') {
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    const role = String(b.role || '');
    const content = String(b.content || '');
    if (!['user','assistant'].includes(role) || !content) {
      return res.status(400).json({ error: 'role(user|assistant) + content required' });
    }
    const rows = await sql`
      INSERT INTO messages (chat_id, role, content)
      VALUES (${chatId}, ${role}, ${content})
      RETURNING id, role, content, created_at
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow','GET, POST');
  res.status(405).json({ error: 'Method Not Allowed' });
};
