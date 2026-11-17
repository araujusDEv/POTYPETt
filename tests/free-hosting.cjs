'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { fork, spawn } = require('node:child_process'), database = require('../lib/database.cjs');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-free-'));
const project = path.join(temp, 'site'), runtime = path.join(temp, 'runtime'), base = 'http://127.0.0.1:3213';
const token = crypto.randomBytes(24).toString('hex'), adminPassword = 'Gestao9' + crypto.randomBytes(10).toString('hex');
const donorPassword = 'Ong9' + crypto.randomBytes(10).toString('hex'), userPassword = 'Maria9' + crypto.randomBytes(10).toString('hex');
let fixture, child, config, inspector, cookie = '', log = '';
async function stop() {
  if (child?.connected) { const done = new Promise((r) => child.once('exit', r)); child.send('stop'); await done; }
  child = undefined;
}
async function start(marker) {
  log = ''; child = spawn(process.execPath, ['scripts/iniciar.cjs'], { cwd: project, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, NODE_PATH: path.join(root, 'node_modules'), NODE_ENV: 'test',
      DATABASE_DRIVER: 'turso', TURSO_DATABASE_URL: config.url, TURSO_AUTH_TOKEN: token, RUNTIME_DIR: runtime,
      DATA_DIR: '/var/data/appet', HOST: '127.0.0.1', PORT: '3213', COOKIE_SECURE: '1', BACKUP_AUTO: '0',
      EMAIL_TRANSPORT: 'file', PUBLIC_BASE_URL: base, MAIL_FROM: 'potypet@example.test', MAIL_QUEUE_KEY: crypto.randomBytes(32).toString('base64'),
      ADMIN_EMAIL: 'gestao@example.test', ADMIN_PASSWORD: adminPassword, ADMIN_RECOVERY_ID: '',
      DONOR_EMAIL: 'ongpotypet@gmail.com', DONOR_NAME: 'Associação Poty Amigos dos Bichos', DONOR_PASSWORD: donorPassword,
      SEED_SAMPLE_DATA: '0', SEED_DEMO_ACCOUNTS: '0', USUARIO_SENHA: userPassword, CADASTRO_INICIAL: '1', TRUST_PROXY: '0', TRUSTED_PROXY_IPS: '' } });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (s) => { log += s; });
  for (let n = 0; !log.includes(marker); n++) {
    if (n > 2400 || child.exitCode !== null) throw Error('Inicialização remota não concluiu: ' + log.replaceAll(adminPassword, '[sigilo]').replaceAll(userPassword, '[sigilo]').replaceAll(donorPassword, '[sigilo]'));
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(![adminPassword, userPassword, donorPassword, token].some((value) => log.includes(value)));
}
async function call(method, route, body, status = 200, authenticated = false) {
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: base, ...(authenticated ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json(); assert.equal(res.status, status, route + ': ' + JSON.stringify(result));
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0]; return result;
}
(async () => {
  try {
    fs.cpSync(root, project, { recursive: true, filter: (file) => !path.relative(root, file).split(path.sep).some((p) => ['node_modules', 'fotos-cadastro', '.git', 'qa', 'qa-data'].includes(p)) });
    fixture = fork(path.join(__dirname, 'helpers/turso-http.cjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
      env: { ...process.env, FIXTURE_TOKEN: token, FIXTURE_DATABASE: path.join(temp, 'remote.db') } });
    const { port } = await new Promise((r) => fixture.once('message', r));
    config = database.settings({ DATABASE_DRIVER: 'turso', NODE_ENV: 'test', TURSO_DATABASE_URL: 'http://127.0.0.1:' + port, TURSO_AUTH_TOKEN: token });
    await start('Após confirmar o e-mail de Maria'); inspector = database.openDatabase('', config);
    assert.equal(inspector.loadState('animals').length, 0);
    assert.equal(inspector.prepare('SELECT email_verified_at FROM users WHERE email=?').get('hypestoreoofc@gmail.com'), undefined);
    await call('POST', '/api/auth/login', { email: 'hypestoreoofc@gmail.com', password: userPassword }, 401);
    const previews = path.join(runtime, 'email-preview'); let confirmation;
    for (let n = 0; !confirmation; n++) {
      if (n > 300) throw Error('Confirmação não enviada');
      if (fs.existsSync(previews)) for (const file of fs.readdirSync(previews)) {
        const message = JSON.parse(fs.readFileSync(path.join(previews, file), 'utf8'));
        if (message.subject.includes('confirme')) confirmation = message.text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
      }
      if (!confirmation) await new Promise((r) => setTimeout(r, 25));
    }
    await call('POST', '/api/auth/verify-email', { token: confirmation, password: userPassword });
    await call('POST', '/api/auth/verify-email', { token: confirmation, password: userPassword }, 400);
    await stop(); await start('Carga inicial concluída.');
    const records = inspector.loadState('animals'), campaigns = inspector.loadState('campaigns');
    const ong = inspector.prepare('SELECT id,account_type FROM users WHERE email=?').get('ongpotypet@gmail.com');
    const person = inspector.prepare('SELECT id,account_type FROM users WHERE email=?').get('hypestoreoofc@gmail.com');
    assert.equal(ong.account_type, 'ong'); assert.equal(person.account_type, 'usuario');
    assert.ok(records.every((animal) => Number(animal.ownerId) === (animal.name === 'Biscoito' ? person.id : ong.id)));
    assert.equal(records.length, 5); assert.ok(records.every((a) => a.approvalStatus === 'pending'));
    assert.equal(campaigns.length, 2); assert.ok(campaigns.every((c) => c.status === 'review' && c.approved === null));
    assert.equal(inspector.loadState('missing').length, 2); assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM campaign_files').get().n, 2);
    assert.equal((await call('GET', '/api/animals')).length, 0);
    await call('PATCH', '/api/animals/' + records[0].id, { approvalStatus: 'approved', reason: 'Revisado' }, 401);
    await call('POST', '/api/auth/login', { email: 'gestao@example.test', password: adminPassword });
    await call('PATCH', '/api/animals/' + records[0].id, { approvalStatus: 'approved', reason: 'Cadastro e fotografia conferidos pelo responsável.' }, 200, true);
    assert.equal((await call('GET', '/api/animals')).length, 1);
    const approved = inspector.loadState('animals');
    await stop(); fs.rmSync(runtime, { recursive: true, force: true });
    await start('Carga inicial concluída.');
    assert.deepEqual(inspector.loadState('animals'), approved); assert.deepEqual(inspector.loadState('campaigns'), campaigns);
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM campaign_files').get().n, 2);
    assert.equal((await call('GET', '/api/health')).database, 'Turso/libSQL');
    const snapshot = path.join(temp, 'backup.db'); inspector.exportSnapshot(snapshot);
    assert.ok(fs.statSync(snapshot).size > 5 * 1024 * 1024);
    console.log('OK hospedagem gratuita — servidor + SDK HTTP, nove fotos, e-mail obrigatório, aprovação manual, pasta temporária apagada sem perder dados e sem duplicação');
  } finally {
    await stop(); inspector?.close();
    if (fixture?.connected) { const done = new Promise((r) => fixture.once('exit', r)); fixture.send('stop'); await done; }
    assert.ok(path.basename(temp).startsWith('potypet-free-')); fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
