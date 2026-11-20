'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'),
  path = require('node:path'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const database = require('../lib/database.cjs'), ci = require('../lib/backup-ci.cjs'),
  protection = require('../lib/backup-crypto.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-ci-test-'));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  let remote;
  try {
    const source = path.join(temp, 'source.db'),
      env = { ...process.env, NODE_ENV: 'test', DATABASE_DRIVER: 'turso',
        TURSO_DATABASE_URL: pathToFileURL(source).href,
        BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
    remote = database.openDatabase('', database.settings(env));
    remote.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL);
      CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE evidence(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),payload BLOB);`);
    remote.prepare('INSERT INTO users(name) VALUES(?)').run('Pessoa fictícia do ensaio');
    const photo = 'data:image/png;base64,' + 'ABCD'.repeat(800000);
    remote.saveState('animals', [{ id: 1, name: 'Animal fictício', photos: [photo] }], '2026-11-19');
    remote.saveState('requests', [{ id: 2, animalId: 1, requesterId: 1, status: 'concluida' }], '2026-11-19');
    remote.prepare('INSERT INTO evidence VALUES(?,?,?)').run(1, 1, Buffer.from('anexo privado de teste'));
    remote.close(); remote = null;
    const original = hash(source), output = path.join(temp, 'export');
    await assert.rejects(ci.create({ directory: path.join(__dirname, '../data/forbidden'), env }));
    await assert.rejects(ci.create({ directory: output, env: { ...env, BACKUP_ENCRYPTION_KEY: '' } }));
    const created = await ci.create({ directory: output, env });
    assert.equal(created.localRoundtrip, 'pass');
    assert.deepEqual(fs.readdirSync(output).sort(), [created.file, created.file + '.manifest.json'].sort());
    assert.notEqual(fs.readFileSync(path.join(output, created.file)).subarray(0,16).toString(), 'SQLite format 3\0');
    const download = path.join(temp, 'independent-download'); fs.mkdirSync(download);
    for (const name of fs.readdirSync(output)) fs.copyFileSync(path.join(output,name),path.join(download,name));
    // O verificador não recebe URL, token ou conexão com o banco de origem.
    const verified = await ci.verify({ directory: download, env: { BACKUP_ENCRYPTION_KEY: env.BACKUP_ENCRYPTION_KEY } });
    assert.equal(verified.restoredToNewDirectory,true); assert.equal(verified.liveDatabaseModified,false);
    const plain = path.join(temp,'check.db');
    await protection.decrypt(path.join(download,created.file),plain,env.BACKUP_ENCRYPTION_KEY);
    const restored = new DatabaseSync(plain,{ readOnly:true });
    try {
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);
      assert.equal(JSON.parse(restored.prepare('SELECT value FROM app_state WHERE key=?').get('animals').value)[0].photos[0],photo);
      assert.equal(JSON.parse(restored.prepare('SELECT value FROM app_state WHERE key=?').get('requests').value)[0].animalId,1);
      assert.equal(Buffer.from(restored.prepare('SELECT payload FROM evidence').get().payload).toString(),'anexo privado de teste');
    } finally { restored.close(); }
    await assert.rejects(ci.create({ directory: output, env }),/vazia/);
    await assert.rejects(ci.verify({ directory: download, env: { BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') } }));
    const encrypted = path.join(download,created.file), bytes=fs.readFileSync(encrypted);
    bytes[bytes.length-20] ^= 1; fs.writeFileSync(encrypted,bytes);
    await assert.rejects(ci.verify({ directory: download,env }),/manifesto/);
    const manifest=JSON.parse(fs.readFileSync(encrypted+'.manifest.json','utf8'));
    manifest.encryptedSha256=hash(encrypted);fs.writeFileSync(encrypted+'.manifest.json',JSON.stringify(manifest));
    await assert.rejects(ci.verify({ directory: download,env }),/autenticar/);
    assert.equal(hash(source),original,'O ensaio preserva o banco de origem.');
    console.log('OK backup CI — exportação remota simulada, coleções fragmentadas/fotos/anexos/vínculos, cifragem, cópia independente, restauração, chave incorreta, adulteração e origem preservada');
  } finally {
    remote?.close();
    assert.equal(path.dirname(temp),os.tmpdir()); assert.ok(path.basename(temp).startsWith('potypet-ci-test-'));
    fs.rmSync(temp,{ recursive:true, force:true });
  }
})().catch((error)=>{ console.error(error);process.exitCode=1; });
