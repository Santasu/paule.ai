// filename: api/library/recent.js
export const config = { runtime: 'edge' };

export default async function handler(req){
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(3, parseInt(url.searchParams.get('limit')||'3',10)));
  const mk = (t, i) => Array.from({length:limit}, (_,k)=>({ title: `${t} #${k+1}`, cover:'/assets/hero/music.webp', thumb:'/assets/hero/photo.webp', link:'#' }));

  return new Response(JSON.stringify({
    ok:true,
    songs: mk('Daina'),
    photos: mk('Nuotrauka'),
    videos: mk('Video')
  }), { headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }});
}
