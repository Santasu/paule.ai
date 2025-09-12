const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};
module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try{
    // Galite čia prisidėti savo logiką (saugoti DB ir pan.)
    return res.status(200).json({ ok:true, received:true });
  }catch(e){ return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
};
