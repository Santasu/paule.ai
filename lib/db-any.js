// filename: lib/db-any.js
async function getSql() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { neon } = await import('@neondatabase/serverless');
  return neon(url);
}
module.exports = { getSql };
