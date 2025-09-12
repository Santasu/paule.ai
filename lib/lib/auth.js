// lib/auth.js
const { q } = require('./db');

let clerk = null;
try {
  if (process.env.CLERK_SECRET_KEY) {
    const { createClerkClient } = require('@clerk/backend');
    clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
} catch (_) {}

async function ensureUser(clerkId, email) {
  const found = await q('SELECT id FROM users WHERE clerk_id=$1', [clerkId]);
  if (found.rows[0]) return found.rows[0].id;
  const ins = await q('INSERT INTO users (clerk_id, email) VALUES ($1,$2) RETURNING id', [clerkId, email || null]);
  return ins.rows[0].id;
}

async function getAuth(req) {
  // Dev / paprastas režimas: X-User-Id iš header
  const devId = req.headers['x-user-id'] || req.headers['x-clerk-user-id'];
  if (!clerk && devId) {
    const userId = await ensureUser(String(devId), null);
    return { userId, clerkId: String(devId) };
  }

  // Clerk JWT, jei yra
  if (!clerk) return { userId: null, clerkId: null };
  const authHeader = (req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { userId: null, clerkId: null };

  try {
    const ses = await clerk.verifyToken(token);
    const cid = ses.sub;
    const email = ses.email || null;
    const id = await ensureUser(cid, email);
    return { userId: id, clerkId: cid };
  } catch {
    return { userId: null, clerkId: null };
  }
}

module.exports = { getAuth };
