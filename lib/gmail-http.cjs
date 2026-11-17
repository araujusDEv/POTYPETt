'use strict';
const crypto = require('node:crypto');
function fail(code) { return Object.assign(Error('Envio HTTPS de e-mail indisponível.'), { code }); }
function configuration(env) {
  let url;
  try { url = new URL(env.MAIL_HTTP_URL); } catch { throw Error('Configure MAIL_HTTP_URL com a implantação do Google Apps Script.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port || url.username || url.password || url.search || url.hash ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))
    throw Error('MAIL_HTTP_URL deve ser https://script.google.com/macros/s/IDENTIFICADOR/exec.');
  const secret = env.MAIL_HTTP_SECRET || '';
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(secret) || Buffer.from(secret, 'base64').length !== 32)
    throw Error('MAIL_HTTP_SECRET deve conter 32 bytes aleatórios em base64.');
  if (secret === env.MAIL_QUEUE_KEY) throw Error('Use chaves diferentes em MAIL_HTTP_SECRET e MAIL_QUEUE_KEY.');
  return { url: url.href, secret };
}
module.exports = function gmailHttp(config, { fetchImpl = globalThis.fetch } = {}) {
  async function request(fields) {
    const payload = JSON.stringify({ ...fields, timestamp: Date.now() });
    const signature = crypto.createHmac('sha256', config.http.secret).update(payload).digest('hex');
    const signal = AbortSignal.timeout(25000);
    try {
      let response = await fetchImpl(config.http.url, { method: 'POST', redirect: 'manual', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, signature }) });
      // ContentService redirects to Google's one-time content URL. Never forward the signed body.
      if ([302, 303].includes(response.status)) {
        const next = new URL(response.headers.get('location'));
        if (next.protocol !== 'https:' || next.hostname !== 'script.googleusercontent.com' || next.port || next.username || next.password)
          throw fail('ECONNECTION');
        response = await fetchImpl(next.href, { method: 'GET', redirect: 'error', signal });
      }
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 4096) throw fail('ECONNECTION');
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          length += value.length; if (length > 4096) throw fail('EMESSAGE'); chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result.ok) throw fail(['EAUTH', 'EQUOTA', 'EMESSAGE', 'EBUSY'].includes(result.error) ? result.error : 'ECONNECTION');
      if (result.from !== config.from) throw fail('EAUTH');
      return result;
    } catch (e) {
      throw fail(['EAUTH', 'EQUOTA', 'EMESSAGE', 'EBUSY', 'ECONNECTION'].includes(e.code) ? e.code :
        e.name === 'TimeoutError' || e.name === 'AbortError' ? 'ETIMEDOUT' : 'ECONNECTION');
    }
  }
  return {
    async verify() { const result = await request({ action: 'verify', from: config.from }); return { remaining: result.remaining }; },
    async sendMail(message) {
      const result = await request({ action: 'send', id: message.deliveryId, from: config.from,
        to: message.to, subject: message.subject, text: message.text, html: message.html });
      if (result.id !== message.deliveryId || result.delivered !== true) throw fail('EMESSAGE');
      return { messageId: message.deliveryId };
    },
    close() {},
  };
};
module.exports.configuration = configuration;
