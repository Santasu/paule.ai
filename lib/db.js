// lib/db.js (CommonJS)
const { Pool } = require('pg');

let pool;
function getPool() {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL not set');
  pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  return pool;
}

async function q(text, params = []) {
  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return { rows: res.rows };
  } finally {
    client.release();
  }
}

module.exports = { q };
