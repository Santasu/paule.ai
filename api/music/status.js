const { env, sendJSON } = require("../_utils");

module.exports = async (req, res) => {
  if (!env.SUNO_KEY) return sendJSON(res, 200, { ok:false, error:"SUNO_KEY_MISSING" });
  const task = String(req.query.task || req.query.task_id || req.query.taskId || "").trim();
  if (!task) return sendJSON(res, 200, { ok:false, error:"TASK_ID_MISSING" });

  const url = `${env.SUNO_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(task)}`;
  const r = await fetch(url, {
    headers:{ "Authorization":`Bearer ${env.SUNO_KEY}`, "Accept":"application/json" }
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok) return sendJSON(res, 200, { ok:false, status:"pending", error:`HTTP_${r.status}`, raw:j });

  if (Number(j?.code || 0) !== 200){
    return sendJSON(res, 200, { ok:false, status:"failed", error: j?.msg || "Suno error", data:j });
  }

  const inner = j?.data || {};
  const vendorStatus = String(inner?.status || "PENDING").toUpperCase();
  const status = (vendorStatus==="SUCCESS" || vendorStatus==="COMPLETE") ? "ready" :
                 (["FAILED","ERROR"].includes(vendorStatus) ? "failed" : "pending");

  let tracks = [];
  const dataArr = inner?.response?.data || [];
  if (Array.isArray(dataArr)){
    tracks = dataArr.map(row => ({
      id: row?.id || "",
      title: row?.title || "",
      tags: row?.tags || "",
      duration: row?.duration || null,
      audio_url: row?.audio_url || row?.source_audio_url || "",
      stream: row?.stream_audio_url || row?.source_stream_audio_url || "",
      image: row?.image_url || row?.source_image_url || "",
    }));
  }

  const firstAudio = tracks?.[0]?.audio_url || null;
  sendJSON(res, 200, { ok:true, status, audio_url:firstAudio, tracks, vendor_status:vendorStatus, source:"record-info" });
};
