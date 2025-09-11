// filename: api/suggest.js
export const config = { runtime: 'edge' };

export default async function handler(req){
  const body = req.method === 'POST' ? await req.json().catch(()=>({})) : {};
  const msg = (body.message || '').toString().slice(0,200);
  const suggestions = [];
  return new Response(JSON.stringify({ ok:true, suggestions }), {
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }
  });
}
