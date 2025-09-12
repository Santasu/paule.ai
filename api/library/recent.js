// filename: api/library/recent.js
export const config = { runtime: 'edge' };

// Pagalbinis: bandom paimti public media iš DB (Neon/Vercel Postgres).
async function fetchFromDB(limit) {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) return null;

  try {
    // Dynamic import – veikia Edge runtime
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);

    // Paimam daugiau ir po to "slice" pagal tipą
    const rows = await sql`
      SELECT id, type, url, meta, created_at
      FROM assets
      WHERE is_public = TRUE
      ORDER BY created_at DESC
      LIMIT ${limit * 6}
    `;

    const safeMeta = (m) => {
      try { return typeof m === 'string' ? JSON.parse(m) : (m || {}); }
      catch { return {}; }
    };
    const mapType = (t, ph) =>
      rows.filter(r => r.type === t).slice(0, limit).map(r => {
        const meta = safeMeta(r.meta);
        return {
          title: meta.title || (t === 'song' ? 'Daina' : t === 'photo' ? 'Nuotrauka' : 'Video'),
          cover: meta.cover || ph.cover,
          thumb: meta.thumb || ph.thumb,
          link: meta.link || `/biblioteka/${t}/${r.id}`,
          url: r.url
        };
      });

    return {
      ok: true,
      songs:  mapType('song',  { cover:'/assets/hero/music.webp',  thumb:'/assets/hero/music.webp'  }),
      photos: mapType('photo', { cover:'/assets/hero/photo.webp',  thumb:'/assets/hero/photo.webp'  }),
      videos: mapType('video', { cover:'/assets/hero/video.webp',  thumb:'/assets/hero/video.webp'  })
    };
  } catch (e) {
    // Jei DB neprieinama, grįžtam į mock
    return null;
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(3, parseInt(url.searchParams.get('limit') || '3', 10)));

  // 1) bandome DB
  const fromDb = await fetchFromDB(limit);
  if (fromDb) {
    return new Response(JSON.stringify(fromDb), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 2) fallback – tavo esamas „fake“ atsakymas (nieko negadinam)
  const mk = (t) => Array.from({ length: limit }, (_, k) => ({
    title: `${t} #${k + 1}`,
    cover: '/assets/hero/music.webp',
    thumb: '/assets/hero/photo.webp',
    link: '#'
  }));

  return new Response(JSON.stringify({
    ok: true,
    songs: mk('Daina'),
    photos: mk('Nuotrauka'),
    videos: mk('Video')
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
