// Vercel Serverless (Node 18+): /api/music/status
// Klausia Suno užduoties būsenos. Grąžina: { ok, status: 'pending'|'ready'|'failed', audio_url, tracks[] }
module.exports = async (req, res) => {
  try {
    const task = String(req.query.task || req.query.task_id || req.query.taskId || "").trim();
    if (!task) { res.status(200).json({ ok:false, status:"pending", error:"TASK_ID_MISSING" }); return; }

    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    // Demo režimas – greitas "ready" su tuščiais laukais, kad UI parodytų sėkmę
    if (!SUNO_API_KEY || task.startsWith('demo-')) {
      res.status(200).json({
        ok:true, status:'ready',
        audio_url:'', // gali įdėti savo demo mp3 URL, jei nori automatinio grojimo
        tracks:[{ id: task, title:'Demo', tags:'', duration:60, audio_url:'', stream:'', image:'' }]
      });
      return;
    }

    const url = `${SUNO_API_BASE}/generate/record-info?taskId=${encodeURIComponent(task)}`;
    const r = await fetch(url, { headers:{ "Authorization":`Bearer ${SUNO_API_KEY}`, "Accept":"application/json" } });
    const j = await r.json().catch(()=> ({}));

    if (!r.ok) {
      res.status(200).json({ ok:false, status:"pending", error:`HTTP_${r.status}`, raw:j });
      return;
    }

    // Kai kuriose integracijose atsakymas ateina su { code, data:{ status, response:{data:[...] } } }
    let vendorStatus = 'PENDING';
    let rows = [];
    if (j?.data) {
      vendorStatus = String(j.data.status || vendorStatus).toUpperCase();
      rows = Array.isArray(j.data.response?.data) ? j.data.response.data : [];
    } else if (Array.isArray(j?.response)) {
      rows = j.response;
    }

    const status = (vendorStatus==="SUCCESS" || vendorStatus==="COMPLETE") ? "ready"
                 : (["FAILED","ERROR"].includes(vendorStatus) ? "failed" : "pending");

    const tracks = rows.map(row => ({
      id: row?.id || "",
      title: row?.title || "",
      tags: row?.tags || "",
      duration: row?.duration || null,
      audio_url: row?.audio_url || row?.source_audio_url || "",
      stream: row?.stream_audio_url || row?.source_stream_audio_url || "",
      image: row?.image_url || row?.source_image_url || "",
    }));

    const firstAudio = tracks?.[0]?.audio_url || '';

    res.status(200).json({ ok:true, status, audio_url:firstAudio, tracks, vendor_status:vendorStatus });
  } catch (e) {
    res.status(200).json({ ok:false, status:"pending", error: e?.message || 'status error' });
  }
};
