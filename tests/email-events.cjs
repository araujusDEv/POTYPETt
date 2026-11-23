'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'),
  os = require('node:os'), crypto = require('node:crypto'), { spawn } = require('node:child_process'),
  { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:3206',
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-email-events-'));
let server;
const sql = (fn) => { const db = new DatabaseSync(path.join(dataDir, 'adotapet.db')); try { return fn(db); } finally { db.close(); } };
const count = () => sql((db) => db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get().n);
function testReminders() {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE auth_tokens(token_hash TEXT,expires_at INTEGER,used_at INTEGER)');
    const loadState = (key) => JSON.parse(db.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);
    const saveState = (key, rows) => db.prepare('INSERT OR REPLACE INTO app_state VALUES(?,?)').run(key, JSON.stringify(rows));
    saveState('requests', [{ id: 1, requesterId: 4, status: 'concluida', completedAt: new Date(Date.now() - 100 * 86400000).toISOString() },
      { id: 2, requesterId: 5, status: 'concluida', completedAt: new Date().toISOString() }]);
    saveState('followups', []);
    const mail = require('../lib/mail-service.cjs')({ db, dataDir: '', env: { EMAIL_TRANSPORT: 'file', MAIL_FROM: 'qa@example.test', MAIL_QUEUE_KEY: crypto.randomBytes(32).toString('base64'), PUBLIC_BASE_URL: base } });
    let verified = false, fail = false;
    const eventMail = (id, kind, key, destination, details) => {
      if (!verified) return false;
      mail.queueEvent('verified@example.test', kind, key, destination, details);
      if (fail) throw Error('Falha simulada depois de enfileirar.');
      return true;
    };
    const create = () => require('../lib/followup-reminders.cjs')({ db, loadState, saveState, eventMail });
    create().scan(); assert.equal(loadState('requests')[0].followupReminderDays, undefined);
    verified = true;
    create().scan(); create().scan();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get().n, 1);
    assert.deepEqual(loadState('requests')[0].followupReminderDays, [7]);
    saveState('followups', [{ requestId: 1, day: 7 }]);
    fail = true; assert.throws(() => create().scan());
    assert.deepEqual(loadState('requests')[0].followupReminderDays, [7]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get().n, 1);
    fail = false; create().scan(); create().scan();
    assert.deepEqual(loadState('requests')[0].followupReminderDays, [7, 30]);
    saveState('followups', [{ requestId: 1, day: 7 }, { requestId: 1, day: 30 }]);
    create().scan(); create().scan();
    assert.deepEqual(loadState('requests')[0].followupReminderDays, [7, 30, 90]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get().n, 3);
    mail.stop();
  } finally { db.close(); }
}
function testAdminDemoStatistics() {
  const grid = { innerHTML: '' }, vm = require('node:vm');
  const context = vm.createContext({
    App: { ready() {} }, document: { getElementById: () => grid },
    Store: {
      getUsers: () => [],
      getAnimals: () => [{ id: 1, status: 'adotado', demonstration: true }, { id: 2, status: 'disponivel' }],
      getRequests: () => [{ id: 1, status: 'concluida', demonstration: true, createdAt: '2026-11-01', completedAt: '2026-11-22' }],
      getMissing: () => [], getReports: () => [],
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/pages/admin.js'), 'utf8'), context);
  vm.runInContext('renderStats()', context);
  assert.match(grid.innerHTML, /<b>1<\/b>Animais cadastrados/);
  assert.match(grid.innerHTML, /<b>0<\/b>Adotados/);
  assert.match(grid.innerHTML, /<b>-<\/b>Dias médios/);
}
async function messages(expected) {
  for (let i = 0; i < 600; i++) {
    const dir = path.join(dataDir, 'email-preview');
    const rows = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
    if (rows.length >= expected) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('Fila local não processou os avisos esperados.');
}
(async () => {
  try {
    let log = '';
    server = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3206', DATA_DIR: dataDir,
      EMAIL_TRANSPORT: 'file', MAIL_FROM: 'qa@example.test', MAIL_QUEUE_KEY: crypto.randomBytes(32).toString('base64'),
      PUBLIC_BASE_URL: base, BACKUP_AUTO: '0', COOKIE_SECURE: '0', SEED_DEMO_ACCOUNTS: '1', SEED_SAMPLE_DATA: '0',
      ADMIN_EMAIL: 'admin@adotapet.com', ADMIN_PASSWORD: '', DONOR_EMAIL: 'ong@adotapet.com', DONOR_PASSWORD: '', ADMIN_RECOVERY_ID: '',
    } });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', (d) => { log += d; });
    for (let i = 0; !log.includes('PotyPet rodando'); i++) {
      if (i > 300 || server.exitCode !== null) throw Error(log);
      await new Promise((r) => setTimeout(r, 50));
    }
    const f = await require('./etapa1-fixtures.cjs')({ base, dataDir, email: true });
    const { admin, owner, other, guest } = f.clients;
    sql((db) => {
      db.prepare('UPDATE users SET email=? WHERE id=?').run('ongpotypet@gmail.com', f.users.owner.id);
      db.prepare('UPDATE users SET email=? WHERE id=?').run('hypestoreoofc@gmail.com', f.users.other.id);
      db.prepare('DELETE FROM mail_outbox').run();
    });
    const preview = path.join(dataDir, 'email-preview');
    if (fs.existsSync(preview)) for (const name of fs.readdirSync(preview)) fs.unlinkSync(path.join(preview, name));
    const before = await guest.call('GET', '/api/stats');
    await guest.call('POST', '/api/admin/video-demo', { confirmed: true }, 401);
    await other.call('POST', '/api/admin/video-demo', { confirmed: true }, 403);
    await admin.call('POST', '/api/admin/video-demo', {}, 400);
    sql((db) => db.prepare('UPDATE users SET email_verified_at=NULL WHERE id=?').run(f.users.other.id));
    await admin.call('POST', '/api/admin/video-demo', { confirmed: true }, 409);
    sql((db) => db.prepare('UPDATE users SET email_verified_at=created_at WHERE id=?').run(f.users.other.id));
    const demo = await admin.call('POST', '/api/admin/video-demo', { confirmed: true });
    assert.equal(demo.day, 30); assert.equal(count(), 4);
    const demoCard = (await admin.call('GET', '/api/animals/cards?view=manage')).find((a) => a.id === demo.animalId);
    assert.equal(demoCard.demonstration, true, 'A lista compacta deve preservar a identificação de demonstração usada pelos indicadores administrativos.');
    assert.deepEqual(await admin.call('POST', '/api/admin/video-demo', { confirmed: true }), demo);
    assert.equal(count(), 4);
    assert.deepEqual(await guest.call('GET', '/api/stats'), before);
    assert.equal((await guest.call('GET', '/api/stories')).some((r) => r.id === demo.requestId), false);
    await guest.call('GET', '/api/animals/' + demo.animalId, undefined, 404);
    const records = (await other.call('GET', '/api/followups')).filter((r) => r.requestId === demo.requestId);
    assert.deepEqual(records.map((r) => r.day), [7, 30]);
    const body = { requestId: demo.requestId, day: 90, adaptation: 'boa', health: 'Relato privado do vídeo.',
      behavior: 'Relato privado de comportamento.', needsHelp: false, clientToken: crypto.randomUUID() };
    await other.call('POST', '/api/followups', body, 409);
    await other.call('POST', `/api/requests/${demo.requestId}/story`, { story: 'Teste', publish: true }, 409);
    await other.call('POST', '/api/admin/video-demo/advance', { confirmed: true }, 403);
    await admin.call('POST', '/api/admin/video-demo/advance', { confirmed: true });
    const afterAdvance = count(); assert.equal(afterAdvance, 5);
    await admin.call('POST', '/api/admin/video-demo/advance', { confirmed: true }); assert.equal(count(), afterAdvance);
    await owner.call('POST', '/api/followups', body, 403);
    const saved = await other.call('POST', '/api/followups', body, 201);
    assert.equal(saved.demonstration, true); assert.equal(count(), 7);
    assert.equal((await other.call('POST', '/api/followups', body)).id, saved.id); assert.equal(count(), 7);
    let sent = await messages(7);
    const ownerMails = sent.filter((m) => m.to.some((a) => a.address === 'ongpotypet@gmail.com'));
    const adopterMails = sent.filter((m) => m.to.some((a) => a.address === 'hypestoreoofc@gmail.com'));
    for (const day of [7, 30, 90]) {
      assert.ok(ownerMails.some((m) => m.subject.includes(`${day} dias recebido`)));
      assert.ok(adopterMails.some((m) => m.subject.includes(`${day} dias registrado`)));
    }
    for (const m of [...ownerMails, ...adopterMails]) {
      assert.match(m.text, /DEMONSTRAÇÃO/); assert.doesNotMatch(m.text, /Relato privado/);
    }
    await guest.call('POST', '/api/contact', { name: 'Teste controlado', email: 'endereco-nao-verificado@example.test', message: 'Conteúdo privado de atendimento.' }, 201);
    sent = await messages(8);
    const contact = sent.find((m) => m.subject.includes('nova mensagem de atendimento'));
    assert.equal(contact.to[0].address, 'admin@adotapet.com'); assert.doesNotMatch(contact.text, /Conteúdo privado|endereco-nao-verificado/);
    const mailCount = count();
    for (const email of ['a@gmail.com,b@gmail.com', 'a@gmail.com;b@gmail.com', 'a@gmail.com\r\nBcc: b@gmail.com'])
      await guest.call('POST', '/api/contact', { name: 'Teste controlado', email, message: 'Teste inválido.' }, 400);
    assert.equal(count(), mailCount);
    await guest.call('POST', '/api/admin/email-test', {}, 401);
    await other.call('POST', '/api/admin/email-test', {}, 403);
    await admin.call('POST', '/api/admin/email-test', {}, 202);
    await admin.call('POST', '/api/admin/email-test', {}, 429);
    await messages(9);
    const clock = require('../lib/video-demo.cjs');
    assert.equal(clock.available({ completedAt: new Date().toISOString(), demoDay: 90 }, 90), false);
    assert.equal(clock.available({ completedAt: 'inválido' }, 7), false);
    testReminders();
    testAdminDemoStatistics();
    assert.deepEqual(await guest.call('GET', '/api/stats'), before);
    for (const route of ['/api/admin/video-demo', '/api/admin/video-demo/advance']) {
      await admin.call('POST', '/api/auth/login', { email: 'admin@adotapet.com', password: 'admin123' });
      let request;
      const response = new Promise((resolve, reject) => {
        request = require('node:http').request(base + route, { method: 'POST', headers: {
          Cookie: admin.cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength('{"confirmed":true}'),
        } }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
        request.on('error', reject); request.write('{"confirmed":');
      });
      await new Promise((r) => setTimeout(r, 150));
      sql((db) => db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='admin')").run());
      request.end('true}');
      assert.equal(await response, 401, 'Sessão revogada durante a leitura do pedido deve bloquear a demonstração.');
    }
    console.log('OK — e-mails locais de 7/30/90, destinatários, sigilo, cenário único, avanço restrito, repetição, contato e teste administrativo. Não comprova entrega no Gmail.');
  } finally {
    if (server?.exitCode === null && server.signalCode === null) {
      const done = new Promise((r) => server.once('exit', r)); server.kill(); await done;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
