// Cole no Google Apps Script. Segredos ficam SOMENTE nas Propriedades do script.
// A implantação deve executar como o proprietário e aceitar acesso "Qualquer pessoa".
function resposta_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function hex_(bytes) { return bytes.map(function (n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join(''); }
function igual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0; for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function autorizarEmail() {
  // Execute uma vez no editor para conceder somente envio de e-mail e identificação do remetente.
  MailApp.getRemainingDailyQuota(); Session.getEffectiveUser().getEmail();
}
function doGet() { return resposta_({ ok: true, service: 'PotyPet' }); }
function doPost(e) {
  var lock;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 200000) return resposta_({ ok: false, error: 'EMESSAGE' });
    var envelope = JSON.parse(raw), props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('MAIL_HTTP_SECRET');
    if (!secret || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret) || Utilities.base64Decode(secret).length !== 32 ||
        typeof envelope.payload !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature || ''))
      return resposta_({ ok: false, error: 'EAUTH' });
    var signed = hex_(Utilities.computeHmacSha256Signature(envelope.payload, secret, Utilities.Charset.UTF_8));
    if (!igual_(signed, envelope.signature)) return resposta_({ ok: false, error: 'EAUTH' });
    var body = JSON.parse(envelope.payload), now = Date.now();
    if (!Number.isSafeInteger(body.timestamp) || Math.abs(now - body.timestamp) > 300000)
      return resposta_({ ok: false, error: 'EAUTH' });
    var from = props.getProperty('MAIL_FROM');
    if (!from || from !== body.from || from.toLowerCase() !== Session.getEffectiveUser().getEmail().toLowerCase())
      return resposta_({ ok: false, error: 'EAUTH' });
    if (body.action === 'verify') return resposta_({ ok: true, from: from, remaining: MailApp.getRemainingDailyQuota() });
    if (body.action !== 'send' || !/^[A-Za-z0-9-]{16,100}$/.test(body.id || '') ||
        typeof body.to !== 'string' || body.to.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(body.to) ||
        typeof body.subject !== 'string' || body.subject.length > 200 || /[\r\n]/.test(body.subject) ||
        typeof body.text !== 'string' || body.text.length > 20000 || typeof body.html !== 'string' || body.html.length > 40000)
      return resposta_({ ok: false, error: 'EMESSAGE' });
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return resposta_({ ok: false, error: 'EBUSY' });
    var fingerprint = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify([body.from, body.to, body.subject, body.text, body.html]), Utilities.Charset.UTF_8));
    var key = 'sent-' + body.id, existing = props.getProperty(key);
    if (existing) {
      var previous = JSON.parse(existing);
      return resposta_(previous.fingerprint === fingerprint
        ? { ok: true, from: from, id: body.id, delivered: true }
        : { ok: false, error: 'EMESSAGE' });
    }
    if (MailApp.getRemainingDailyQuota() < 1) return resposta_({ ok: false, error: 'EQUOTA' });
    var lastCleanup = Number(props.getProperty('lastCleanup') || 0);
    if (now - lastCleanup > 86400000) {
      var all = props.getProperties();
      Object.keys(all).forEach(function (name) {
        if (name.indexOf('sent-') === 0 && JSON.parse(all[name]).at < now - 172800000) props.deleteProperty(name);
      });
      props.setProperty('lastCleanup', String(now));
    }
    MailApp.sendEmail({ to: body.to, subject: body.subject, body: body.text, htmlBody: body.html, name: 'PotyPet' });
    props.setProperty(key, JSON.stringify({ at: now, fingerprint: fingerprint }));
    return resposta_({ ok: true, from: from, id: body.id, delivered: true });
  } catch (_) { return resposta_({ ok: false, error: 'ECONNECTION' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
