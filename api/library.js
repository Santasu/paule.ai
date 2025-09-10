// api/library.js
const { jsonOK } = require('../_utils');

module.exports = async (req, res) => {
  const limit = Number((req.query?.limit || req.query?.get('limit')) || 3) || 3;
  return jsonOK(res, {
    songs: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      title: `Daina #${i + 1}`,
      cover: '/assets/hero/music.webp',
      link: '#'
    })),
    photos: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      title: `Nuotrauka #${i + 1}`,
      thumb: '/assets/hero/photo.webp',
      link: '#'
    })),
    videos: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      title: `Video #${i + 1}`,
      thumb: '/assets/hero/video.webp',
      link: '#'
    }))
  });
};
