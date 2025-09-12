const { q } = require('../../../lib/db');
const { getAuth } = require('../../../lib/auth');
const { json, bad, method, notFound, unauthorized } = require('../../../lib/http');

module.exports = async (req, res) => {
  const auth = await getAuth(req);
  if (!auth.userId) return unauthorized(res);

  const chatId = req.query.id;

  const own = await q('SELECT id FROM chats WHERE id=$1 AND user_id=$2', [chatId, auth.userId]);
  if (!own.rows[0]) return notFound(res);

  if (req.method === 'GET') {
    const { rows } = await q(
      'SELECT id, role, content, created_at FROM messages WHERE chat_id=$1 ORDER BY created_at ASC',
      [chatId]
    );
    return json(res, 200, { messages: rows });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const role = String(body.role || '');
    const content = String(body.content || '');
    if (!content || !['user','assistant'].includes(role)) return bad(res, 'role(user|assistant) + content');
    const { rows } = await q(
      'INSERT INTO messages (chat_id, role, content) VALUES ($1,$2,$3) RETURNING id, role, content, created_at',
      [chatId, role, content]
    );
    return json(res, 200, rows[0]);
  }

  return method(res, ['GET','POST']);
};
