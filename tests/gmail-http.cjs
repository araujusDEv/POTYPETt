'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), { DatabaseSync } = require('node:sqlite');
const createMail = require('../lib/mail-service.cjs'), gmail = require('../lib/gmail-http.cjs');
const secret = crypto.randomBytes(32).toString('base64'), queueKey = crypto.randomBytes(32).toString('base64');
const props = new Map([['MAIL_HTTP_SECRET', secret], ['MAIL_FROM', 'envio@gmail.com']]);
let sent = [], remaining = 100, locked = false;
const script = vm.createContext({
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (content) => ({ content, setMimeType() { return this; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => props.get(key) ?? null,
    setProperty: (k, v) => props.set(k, v), deleteProperty: (key) => props.delete(key), getProperties: () => Object.fromEntries(props) }) },
  Utilities: { Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' }, base64Decode: (v) => [...Buffer.from(v, 'base64')],
    computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', key).update(value).digest()],
    computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()] },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'envio@gmail.com' }) },
  MailApp: { getRemainingDailyQuota: () => remaining, sendEmail: (body) => { sent.push(body); remaining--; } },
  LockService: { getScriptLock: () => ({ tryLock() { if (locked) return false; locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../integracoes/google-email/Code.gs'), 'utf8'), script);
function envelope(fields, timestamp = Date.now()) {
  const payload = JSON.stringify({ ...fields, timestamp });
  return JSON.stringify({ payload, signature: crypto.createHmac('sha256', secret).update(payload).digest('hex') });
}
function post(body) { return JSON.parse(script.doPost({ postData: { contents: body } }).content); }
const fields = { action: 'send', id: crypto.randomUUID(), from: 'envio@gmail.com', to: 'pessoa@example.test', subject: 'PotyPet — confirmação', text: 'Abra o link seguro.', html: '<p>Abra o link seguro.</p>' };
const env = { NODE_ENV: 'production', EMAIL_TRANSPORT: 'gmail_http', PUBLIC_BASE_URL: 'https://potypet.onrender.com',
  MAIL_FROM: fields.from, MAIL_QUEUE_KEY: queueKey, MAIL_HTTP_SECRET: secret, MAIL_HTTP_URL: 'https://script.google.com/macros/s/deployment/exec' };
(async () => {
  assert.throws(() => createMail.settings({ ...env, MAIL_HTTP_URL: 'https://example.test/macros/s/a/exec' }));
  assert.throws(() => createMail.settings({ ...env, MAIL_HTTP_SECRET: queueKey }));
  assert.throws(() => createMail.settings({ ...env, EMAIL_TRANSPORT: 'disabled' }));
  assert.equal(post(envelope(fields, Date.now() - 600000)).error, 'EAUTH');
  const forged = JSON.parse(envelope(fields)); forged.payload = forged.payload.replace('pessoa', 'outro');
  assert.equal(post(JSON.stringify(forged)).error, 'EAUTH');
  assert.equal(post(envelope({ ...fields, from: 'outro@gmail.com' })).error, 'EAUTH');
  assert.equal(post(envelope({ ...fields, to: 'a@example.test,b@example.test' })).error, 'EMESSAGE');
  assert.equal(post(envelope({ ...fields, subject: 'assunto\r\nBcc: outro@example.test' })).error, 'EMESSAGE');
  assert.equal(sent.length, 0);
  assert.equal(post(envelope(fields)).delivered, true); assert.equal(sent.length, 1);
  assert.equal(post(envelope(fields)).delivered, true); assert.equal(sent.length, 1);
  assert.equal(post(envelope({ ...fields, text: 'Alterado' })).error, 'EMESSAGE');
  remaining = 0; assert.equal(post(envelope({ ...fields, id: crypto.randomUUID() })).error, 'EQUOTA'); remaining = 90;
  let finalBody, calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      finalBody = post(options.body);
      return new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?one-time=1' } });
    }
    assert.equal(options.body, undefined); assert.equal(options.headers, undefined);
    return new Response(JSON.stringify(finalBody));
  };
  const config = createMail.settings(env), transport = gmail(config, { fetchImpl });
  await transport.verify(); assert.equal(sent.length, 1);
  await transport.sendMail({ ...fields, deliveryId: fields.id }); assert.equal(sent.length, 1);
  assert.equal(calls.filter((c) => c.options.method === 'GET').length, 2);
  const redirect = gmail(config, { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://attacker.test/' } }) });
  await assert.rejects(redirect.verify(), (e) => e.code === 'ECONNECTION' && !e.message.includes(secret));
  const malformed = gmail(config, { fetchImpl: async () => new Response('invalid') }); await assert.rejects(malformed.verify());
  const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE auth_tokens(token_hash TEXT,expires_at INTEGER,used_at INTEGER)');
  const previousFetch = globalThis.fetch; globalThis.fetch = fetchImpl;
  try {
    const mail = createMail({ db, dataDir: '', env });
    mail.queue('pessoa@example.test', 'verify', 'a'.repeat(43));
    const queued = db.prepare('SELECT * FROM mail_outbox').get();
    assert.ok(!queued.payload.includes('pessoa@example.test') && !queued.payload.includes('a'.repeat(43)));
    await mail.pump(); assert.ok(db.prepare('SELECT delivered_at,payload FROM mail_outbox').get().delivered_at);
    assert.equal(db.prepare('SELECT payload FROM mail_outbox').get().payload, null);
    remaining = 0; mail.queue('outra@example.test', 'verify', 'b'.repeat(43));
    await mail.pump(); const failed = db.prepare('SELECT * FROM mail_outbox WHERE delivered_at IS NULL').get();
    assert.equal(failed.last_error, 'EQUOTA'); assert.equal(failed.attempts, 0); assert.ok(failed.payload);
    assert.ok(failed.next_attempt >= Date.now() + 6 * 3600000 - 2000);
    assert.equal(failed.failed_at, null);
    remaining = 100;
    await mail.pump(); assert.equal(db.prepare('SELECT delivered_at FROM mail_outbox WHERE id=?').get(failed.id).delivered_at, null);
    db.prepare('UPDATE mail_outbox SET next_attempt=0 WHERE id=?').run(failed.id);
    await mail.pump(); assert.ok(db.prepare('SELECT delivered_at FROM mail_outbox WHERE id=?').get(failed.id).delivered_at);
    mail.stop();
  } finally { globalThis.fetch = previousFetch; db.close(); }
  console.log('OK e-mail HTTPS — assinatura, expiração, remetente, quota, repetição, redirecionamento Google, fila cifrada e falha sem falsa entrega');
})().catch((e) => { console.error(e); process.exitCode = 1; });
