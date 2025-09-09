// Reikia: npm i @clerk/backend
import { verifyToken } from '@clerk/backend';

export async function requireAuth(req, res) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw new Error('NO_TOKEN');
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return payload; // payload.sub == userId
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
}
