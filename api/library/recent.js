export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  const limit = Math.max(1, Math.min(6, Number(req.query.limit)||3));
  const mk = (arr)=> arr.slice(0,limit);

  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,
    songs: mk([
      { title:'„Vasaros vėjas“', cover:'/assets/hero/music.webp', link:'#' },
      { title:'„Nakties šviesos“', cover:'/assets/hero/music.webp', link:'#' },
      { title:'„Miesto pulsas“', cover:'/assets/hero/music.webp', link:'#' }
    ]),
    photos: mk([
      { title:'Produktas', cover:'/assets/hero/photo.webp', link:'#' },
      { title:'Kampanija', cover:'/assets/hero/photo.webp', link:'#' },
      { title:'Viršelis', cover:'/assets/hero/photo.webp', link:'#' }
    ]),
    videos: mk([
      { title:'Reklama 15s', cover:'/assets/hero/video.webp', link:'#' },
      { title:'Pristatymas',  cover:'/assets/hero/video.webp', link:'#' },
      { title:'Užkulisiai',   cover:'/assets/hero/video.webp', link:'#' }
    ])
  });
}
