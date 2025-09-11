// api/sse-ping.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const enc = new TextEncoder();

  const intervalMs = Math.max(1000, Math.min(60000, Number(new URL(req.url).searchParams.get('interval') || 15000)));
  const ttlMs      = Math.max(intervalMs * 2, Math.min(5 * 60_000, Number(new URL(req.url).searchParams.get('ttl') || 60_000)));

  const stream = new ReadableStream({
    start(controller) {
      const send = (evt, data) =>
        controller.enqueue(enc.encode(`event: ${evt}\ndata: ${JSON.stringify(data || {})}\n\n`));

      // pirmas ping iškart
      send('ping', { t: Date.now() });

      const id = setInterval(() => send('ping', { t: Date.now() }), intervalMs);

      const close = () => {
        clearInterval(id);
        try { controller.close(); } catch(_) {}
      };

      // automatinis uždarymas po TTL (apsauga nuo "zombie" jungčių)
      const ttl = setTimeout(close, ttlMs);

      // jei klientas nutraukia ryšį – sustabdom
      this.cancel = () => { clearInterval(id); clearTimeout(ttl); };

      // kai kurie proxy mėgsta komentarus – prireikus:
      // controller.enqueue(enc.encode(': keep-alive\n\n'));
    },
    cancel() { /* perrašoma start() viduje */ }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
