export const config = { runtime: 'edge' };
export default async function handler() {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller){
      controller.enqueue(enc.encode('event: ping\ndata: {}\n\n'));
      const id = setInterval(()=> controller.enqueue(enc.encode('event: ping\ndata: {}\n\n')), 15000);
      const close = ()=>{ clearInterval(id); try{controller.close();}catch(_){ } };
      // 60 s and close
      setTimeout(close, 60000);
    }
  });
  return new Response(stream, {
    headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'}
  });
}
