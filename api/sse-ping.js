// api/sse-ping.js
const { sendSSEHeaders, sendEvent, endSSE } = require('../_utils');

module.exports = async (req, res) => {
  sendSSEHeaders(res);
  let i = 0;
  const id = setInterval(() => {
    sendEvent(res, 'ping', JSON.stringify({ t: Date.now(), i: i++ }));
  }, 10000);
  req.on('close', () => { clearInterval(id); });
};
