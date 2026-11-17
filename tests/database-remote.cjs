'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), { fork } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const database = require('../lib/database.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-libsql-'));
let fixture, db;
async function start(noFk = false) {
  const token = crypto.randomBytes(24).toString('hex');
  fixture = fork(path.join(__dirname, 'helpers/turso-http.cjs'), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, FIXTURE_TOKEN: token, FIXTURE_DATABASE: path.join(directory, noFk ? 'nofk.db' : 'remote.db'), FIXTURE_NO_FK: noFk ? '1' : '0' } });
  const { port } = await new Promise((resolve, reject) => { fixture.once('message', resolve); fixture.once('error', reject); });
  return database.settings({ DATABASE_DRIVER: 'turso', NODE_ENV: 'test', TURSO_DATABASE_URL: 'http://127.0.0.1:' + port, TURSO_AUTH_TOKEN: token });
}
async function stop() {
  db?.close(); db = undefined;
  if (fixture?.connected) { const exit = new Promise((r) => fixture.once('exit', r)); fixture.send('stop'); await exit; }
  fixture = undefined;
}
(async () => {
  try {
    assert.equal(database.settings({ DATABASE_DRIVER: 'turso', TURSO_DATABASE_URL: 'libsql://potypet.example.turso.io', TURSO_AUTH_TOKEN: 'a'.repeat(32) }).url, 'https://potypet.example.turso.io');
    assert.throws(() => database.settings({ DATABASE_DRIVER: 'turso', NODE_ENV: 'production', TURSO_DATABASE_URL: 'file:/tmp/no.db' }));
    assert.throws(() => database.settings({ DATABASE_DRIVER: 'turso', NODE_ENV: 'production', TURSO_DATABASE_URL: 'http://example.test/' }));
    const config = await start(); db = database.openDatabase('', config);
    db.exec(`PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL);
      CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    db.prepare('INSERT INTO users(name) VALUES(?)').run('Pipoca');
    db.prepare('INSERT INTO sessions VALUES(?,?)').run('token', 1);
    assert.throws(() => db.prepare('INSERT INTO sessions VALUES(?,?)').run('invalid', 99));
    db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO users(name) VALUES(?)').run('Rollback');
    db.saveState('animals', [{ name: 'Rollback' }], 'now'); db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1); assert.deepEqual(db.loadState('animals'), []);
    const large = [{ name: 'Adoção 🐈', text: 'ação 🐾'.repeat(1100000) }];
    assert.ok(Buffer.byteLength(JSON.stringify(large)) > 10 * 1024 * 1024);
    db.saveState('animals', large, 'now'); assert.deepEqual(db.loadState('animals'), large);
    db.saveState('migration', { appliedAt: 'now' }, 'now'); assert.deepEqual(db.loadState('migration'), { appliedAt: 'now' });
    db.close(); db = database.openDatabase('', config); assert.deepEqual(db.loadState('animals'), large);
    const backup = path.join(directory, 'snapshot.db'); db.exportSnapshot(backup);
    const native = new DatabaseSync(backup);
    try {
      assert.equal(native.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(native.prepare('PRAGMA foreign_key_check').all().length, 0);
      assert.deepEqual(JSON.parse(native.prepare('SELECT value FROM app_state WHERE key=?').get('animals').value), large);
    } finally { native.close(); }
    assert.throws(() => db.exportSnapshot(backup));
    db.exec('BEGIN IMMEDIATE'); db.saveState('animals', [{ name: 'Novo' }], 'later'); db.exec('ROLLBACK');
    assert.deepEqual(db.loadState('animals'), large);
    db.prepare('UPDATE potypet_state_chunks SET payload=? WHERE state_key=? AND ordinal=?').run(Buffer.from('corrompido'), 'animals', 0);
    assert.throws(() => db.loadState('animals'), /Dados incompletos/);
    db.saveState('animals', [{ name: 'Mel' }], 'later'); assert.deepEqual(db.loadState('animals'), [{ name: 'Mel' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM potypet_state_chunks').get().n, 0);
    await new Promise((r) => { fixture.once('message', r); fixture.send('lose-commit'); });
    assert.throws(() => db.prepare('INSERT INTO users(name) VALUES(?)').run('Commit sem resposta'), (e) => e.status === 503 && !e.message.includes(config.authToken));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE name=?').get('Commit sem resposta').n, 1);
    db.prepare('DELETE FROM users WHERE id=?').run(1); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    await stop();
    const noFk = await start(true); assert.throws(() => database.openDatabase('', noFk), /foreign_keys=ON/); await stop();
    console.log('OK banco remoto — SDK HTTP real, transações, restrições, fotos acima de 10 MB, integridade, reinício, backup restaurável e escrita sem repetição');
  } finally { await stop(); assert.ok(path.basename(directory).startsWith('potypet-libsql-')); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
