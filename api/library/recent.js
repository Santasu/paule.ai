// api/library/recent.js
module.exports = (req, res) => {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.status(200).end(JSON.stringify({
    ok:true,
    songs:[
      { title:'Vasaros vėjas', cover:'/assets/hero/music.webp', link:'/biblioteka#dainos' },
      { title:'Nakties šviesos', cover:'/assets/hero/music.webp', link:'/biblioteka#dainos' },
      { title:'Miesto pulsas',   cover:'/assets/hero/music.webp', link:'/biblioteka#dainos' }
    ],
    photos:[
      { title:'Produktas',  url:'/assets/hero/photo.webp', link:'/biblioteka#nuotraukos' },
      { title:'Kampanija',  url:'/assets/hero/photo.webp', link:'/biblioteka#nuotraukos' },
      { title:'Viršelis',   url:'/assets/hero/photo.webp', link:'/biblioteka#nuotraukos' }
    ],
    videos:[
      { title:'Reklama 15s',  thumb:'/assets/hero/video.webp', link:'/biblioteka#video' },
      { title:'Pristatymas',  thumb:'/assets/hero/video.webp', link:'/biblioteka#video' },
      { title:'Užkulisiai',   thumb:'/assets/hero/video.webp', link:'/biblioteka#video' }
    ]
  }));
};
