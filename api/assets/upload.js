const Busboy = require('busboy');
const { getAuth } = require('../../lib/auth');
const { q } = require('../../lib/db');
const { json, bad, method } = require('../../lib/http');

// reikalinga Vercel'ui tam, kad necovėltų body automatiškai
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return method(res, ['POST']);
  const auth = await getAuth(req);
  if (!auth.userId) return json(res, 401, { error: 'Unauthorized' });

  if (!process.env.BLOB_READ_WRITE_TOKEN) return bad(res, 'BLOB_READ_WRITE_TOKEN missing');

  const bb = Busboy({ headers: req.headers });
  let filePromise = null, assetType = null, isPublic = false, meta = null;

  bb.on('field', (name, val) => {
    if (name === 'type') assetType = val;
    if (name === 'is_public') isPublic = val === 'true' || val === '1';
    if (name === 'meta') { try { meta = JSON.parse(val); } catch { meta = null; } }
  });

  bb.on('file', (name, stream, info) => {
    const filename = info && info.filename ? info.filename : `upload-${Date.now()}`;
    // dinaminis importas, nes @vercel/blob yra ESM
    filePromise = (async () => {
      const { put } = await import('@vercel/blob');
      return put(filename, stream, {
        access: 'public',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
    })();
  });

  bb.on('finish', async () => {
    try {
      if (!filePromise || !assetType) return bad(res, 'file + type required');
      if (!['song','photo','video'].includes(assetType)) return bad(res, 'type must be song|photo|video');
      const uploaded = await filePromise; // { url, pathname, contentType, ... }
      const { rows } = await q(
        'INSERT INTO assets (user_id, type, url, meta, is_public) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [auth.userId, assetType, uploaded.url, meta, isPublic]
      );
      return json(res, 200, { asset: rows[0] });
    } catch (e) {
      return json(res, 500, { error: e && e.message ? e.message : 'Upload error' });
    }
  });

  req.pipe(bb);
};
