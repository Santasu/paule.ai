// api/library/recent.js
module.exports = async (req, res) => {
  const q = req.query || {};
  const limit = Math.max(1, Math.min(12, parseInt(q.limit || '3', 10) || 3));
  const take = (arr) => arr.slice(0, limit);

  const songs = take([
    { title: 'Vasaros vėjas',  cover: '/assets/hero/music.webp', link: '/biblioteka#dainos' },
    { title: 'Nakties šviesos', cover: '/assets/hero/music.webp', link: '/biblioteka#dainos' },
    { title: 'Miesto pulsas',   cover: '/assets/hero/music.webp', link: '/biblioteka#dainos' }
  ]);

  const photos = take([
    { title: 'Produktas',  url: '/assets/hero/photo.webp', link: '/biblioteka#nuotraukos' },
    { title: 'Kampanija',  url: '/assets/hero/photo.webp', link: '/biblioteka#nuotraukos' },
    { title: 'Viršelis',   url: '/assets/hero/photo.webp', link: '/biblioteka#nuotraukos' }
  ]);

  const videos = take([
    { title: 'Reklama 15s',   thumb: '/assets/hero/video.webp', link: '/biblioteka#video' },
    { title: 'Pristatymas',   thumb: '/assets/hero/video.webp', link: '/biblioteka#video' },
    { title: 'Užkulisiai',    thumb: '/assets/hero/video.webp', link: '/biblioteka#video' }
  ]);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok:true, songs, photos, videos });
};
