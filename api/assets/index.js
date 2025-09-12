const { q } = require('../../lib/db');
const { getAuth } = require('../../lib/auth');
const { json, bad, method, unauthorized } = require('../../lib/http');

module.exports = async (req, res) => {
  const auth = await getAuth(req);

  if (req.method === 'GET') {
    if (auth.userId) {
      const { rows } = await q(
        'SELECT id, type, url, meta, is_public, created_at FROM assets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [auth.userId]
      );
      return json(res, 200, { assets: rows });
    } else {
      const { rows } = await q(
        'SELECT id, type, url, meta, created_at FROM assets WHERE is_public=TRUE ORDER BY created_at DESC LIMIT 100'
      );
      return json(res, 200, { assets: rows });
    }
  }

  if (req.method === 'POST') {
    if (!auth.userId) return unauthorized(res);
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    const type = String(b.type || '');
    const url = String(b.url || '');
    const isPublic = !!b.is_public;
    const meta = b.meta || null;
    if (!url || !['song','photo','video'].includes(type)) return bad(res, 'type(song|photo|video) + url');
    const { rows } = await q(
      'INSERT INTO assets (user_id, type, url, meta, is_public) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [auth.userId, type, url, meta, isPublic]
    );
    return json(res, 200, rows[0]);
  }

  return method(res, ['GET','POST']);
};
