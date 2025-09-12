module.exports = async (req, res) => {
  try {
    const task = String(req.query.task || req.query.task_id || req.query.taskId || '').trim();
    if (!task) return res.status(200).json({ ok:false, status:'pending', error:'TASK_ID_MISSING' });

    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    const DEMO_AUDIO_URL = process.env.DEMO_AUDIO_URL || ''; // jei nori test grojimo be rakto

    // DEMO režimas – kad aiškiai matytum rezultatą
    if (!SUNO_API_KEY || task.startsWith('demo-')) {
      return res.status(200).json({
        ok:true, status:'ready',
        audio_url: DEMO_AUDIO_URL,
        tracks:[{ id:task, title:'Demo', duration:60, audio_url:DEMO_AUDIO_URL, stream:DEMO_AUDIO_URL, image:'' }]
      });
    }

    const url = `${SUNO_API_BASE}/generate/record-info?taskId=${encodeURIComponent(task)}`;
    const r = await fetch(url, { headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Accept':'application/json' } });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) return res.status(200).json({ ok:false, status:'pending', error:`HTTP_${r.status}`, raw:j });

    let vendorStatus = (j?.data?.status || 'PENDING').toUpperCase();
    const rows = Array.isArray(j?.data?.response?.data) ? j.data.response.data : [];
    const status = (vendorStatus==='SUCCESS' || vendorStatus==='COMPLETE') ? 'ready'
                 : (['FAILED','ERROR'].includes(vendorStatus) ? 'failed' : 'pending');

    const tracks = rows.map(row => ({
      id: row?.id || '',
      title: row?.title || '',
      duration: row?.duration || null,
      audio_url: row?.audio_url || row?.source_audio_url || '',
      stream: row?.stream_audio_url || row?.source_stream_audio_url || '',
      image: row?.image_url || row?.source_image_url || '',
    }));
    const firstAudio = tracks?.[0]?.audio_url || '';

    return res.status(200).json({ ok:true, status, audio_url:firstAudio, tracks, vendor_status:vendorStatus });
  } catch (e) {
    return res.status(200).json({ ok:false, status:'pending', error: e?.message || 'status error' });
  }
};

