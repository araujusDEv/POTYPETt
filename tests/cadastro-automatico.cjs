'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-auto-'));
const project = path.join(temp, 'site'), dataDir = path.join(temp, 'database');
const donorPassword = 'Ong9' + crypto.randomBytes(12).toString('hex');
const userPassword = 'Maria9' + crypto.randomBytes(12).toString('hex');
const adminPassword = 'Gestao9' + crypto.randomBytes(12).toString('hex');
let child;
function removeManaged(target) {
  const absolute = path.resolve(target), relative = path.relative(path.resolve(temp), absolute);
  assert.ok(absolute === path.resolve(temp) || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)));
  fs.rmSync(absolute, { recursive: true, force: true });
}
function counts() {
  const db = new DatabaseSync(path.join(dataDir, 'adotapet.db'));
  try {
    const state = (key) => JSON.parse(db.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);
    return { animals: state('animals'), missing: state('missing'), campaigns: state('campaigns'),
      files: db.prepare('SELECT COUNT(*) AS n FROM campaign_files').get().n,
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n };
  } finally { db.close(); }
}
async function start(extra = {}, marker = 'Carga inicial concluída.') {
  let log = '';
  child = spawn(process.execPath, ['scripts/iniciar.cjs'], { cwd: project, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, NODE_PATH: path.join(root, 'node_modules'),
      NODE_ENV: 'test', DATA_DIR: dataDir, HOST: '127.0.0.1', PORT: '3212',
      EMAIL_TRANSPORT: 'disabled', BACKUP_AUTO: '0', COOKIE_SECURE: '1',
      SEED_SAMPLE_DATA: '0', SEED_DEMO_ACCOUNTS: '0', ADMIN_RECOVERY_ID: '', TRUST_PROXY: '0', TRUSTED_PROXY_IPS: '',
      ADMIN_EMAIL: 'gestao@potypet.org', ADMIN_PASSWORD: adminPassword,
      DONOR_EMAIL: 'ongpotypet@gmail.com', DONOR_NAME: 'Associação Poty Amigos dos Bichos', DONOR_PASSWORD: donorPassword,
      USUARIO_SENHA: userPassword, CADASTRO_INICIAL: '1', ...extra } });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => { log += d; });
  for (let n = 0; !log.includes(marker); n++) {
    if (n > 1600 || child.exitCode !== null) throw Error('A inicialização automática não concluiu: ' + log.replaceAll(donorPassword, '[sigilo]').replaceAll(userPassword, '[sigilo]').replaceAll(adminPassword, '[sigilo]'));
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(![donorPassword, userPassword, adminPassword].some((s) => log.includes(s)));
  return log;
}
async function stop() {
  if (child?.exitCode === null && child.signalCode === null) {
    // Graceful parent shutdown forwards SIGTERM to the server and aborts pending API work.
    if (process.platform === 'win32') child.send('stop');
    else child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await new Promise((r) => child.once('exit', r));
  }
  child = null;
}
(async () => {
  try {
    fs.cpSync(root, project, { recursive: true, filter: (file) => !path.relative(root, file).split(path.sep).some((part) => ['node_modules', 'fotos-cadastro', '.git', 'qa', 'qa-data'].includes(part)) });
    await start({ CADASTRO_INICIAL: '0' }, 'PotyPet rodando');
    assert.equal(fs.existsSync(path.join(project, 'fotos-cadastro')), false);
    assert.equal(counts().animals.length, 0); await stop();
    await start();
    const first = counts();
    assert.equal(first.users, 3); assert.equal(first.animals.length, 5); assert.equal(first.missing.length, 2); assert.equal(first.campaigns.length, 2); assert.equal(first.files, 2);
    assert.ok(first.animals.every((a) => a.approvalStatus === 'pending'));
    assert.ok(first.campaigns.every((c) => c.status === 'review' && c.approved === null));
    assert.equal(fs.existsSync(path.join(project, 'fotos-cadastro', 'ong-pipoca.jpg')), true);
    await stop(); await start(); assert.deepEqual(counts(), first); await stop();
    removeManaged(dataDir); await start();
    assert.equal(counts().animals.length, 5); assert.equal(counts().campaigns.length, 2); await stop();
    removeManaged(dataDir); await start({ USUARIO_SENHA: 'curta' }, 'cadastro inicial ficou pendente');
    assert.equal((await fetch('http://127.0.0.1:3212/api/health')).status, 200);
    assert.equal(counts().animals.length, 0); await stop();
    console.log('OK cadastro automático — posts incluídos, opt-in, inicialização HTTP, sete pendências, reinício sem duplicação, banco recriado e falha de carga sem derrubar o site');
  } finally { await stop(); removeManaged(temp); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
