const { q } = require('../../lib/db');
const { getAuth } = require('../../lib/auth');
const { json, method, unauthorized, bad } = require('../../lib/http');

module.exports = async (req, res) => {
  const auth = await getAuth(req);
  if (!auth.userId) return unauthorized(res);

  if (req.method === 'GET') {
    const { rows } = await q(
      'SELECT id, title, created_at FROM chats WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [auth.userId]
    );
    return json(res, 200, { chats: rows });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const title = String(body.title || 'Naujas pokalbis').slice(0, 160);
    const { rows } = await q(
      'INSERT INTO chats (user_id, title) VALUES ($1,$2) RETURNING id, title, created_at',
      [auth.userId, title]
    );
    return json(res, 200, rows[0]);
  }

  return method(res, ['GET','POST']);
};
