// lib/http.js
function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
function json(res, code, body) {
  noStore(res);
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body));
}
function bad(res, msg = 'Bad Request') { return json(res, 400, { error: msg }); }
function unauthorized(res) { return json(res, 401, { error: 'Unauthorized' }); }
function notFound(res) { return json(res, 404, { error: 'Not Found' }); }
function method(res, allow) { res.setHeader('Allow', allow.join(', ')); return json(res, 405, { error: 'Method Not Allowed' }); }

module.exports = { noStore, json, bad, unauthorized, notFound, method };
