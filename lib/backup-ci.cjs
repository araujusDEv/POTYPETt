'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const protection = require('./backup-crypto.cjs');
const ROOT = path.resolve(__dirname, '..');
const NAME = /^potypet-backup-\d{13}-[a-f0-9]{8}\.db\.enc$/;
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function requireOutsideRepository(directory) {
  const target = path.resolve(directory), relative = path.relative(ROOT, target);
  if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)))
    throw Error('Use uma pasta privada fora do repositório para a cópia operacional.');
  return target;
}
function removeOwnFiles(directory, names) {
  for (const name of names) {
    const target = path.resolve(directory, name);
    if (path.dirname(target) !== path.resolve(directory)) throw Error('Destino temporário inválido.');
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  if (fs.existsSync(directory) && !fs.readdirSync(directory).length) fs.rmdirSync(directory);
}
function inspect(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('A restauração não passou pela verificação de integridade.');
    for (const name of ['users', 'app_state'])
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
        throw Error('O arquivo não corresponde ao banco do PotyPet.');
    for (const row of db.prepare('SELECT value FROM app_state').all()) JSON.parse(row.value);
    return { integrity: 'ok', foreignKeys: 'ok', collectionsReadable: true };
  } finally { db.close(); }
}
async function create({ directory, env = process.env }) {
  const target = requireOutsideRepository(directory);
  protection.key(env.BACKUP_ENCRYPTION_KEY);
  const database = require('./database.cjs'), config = database.settings(env);
  if (config.driver !== 'turso') throw Error('O backup independente exige DATABASE_DRIVER=turso.');
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  if (fs.readdirSync(target).length) throw Error('Escolha uma pasta de saída vazia para preservar as cópias existentes.');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-ci-export-'));
  fs.chmodSync(scratch, 0o700);
  const plain = path.join(scratch, 'snapshot.db');
  const test = path.join(scratch, 'roundtrip.db');
  const name = 'potypet-backup-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.db.enc';
  const encrypted = path.join(target, name), manifest = encrypted + '.manifest.json';
  let complete = false;
  try {
    const command = spawnSync(process.execPath, [path.join(ROOT, 'scripts/backup.cjs'), plain], {
      cwd: ROOT, env, windowsHide: true, stdio: 'ignore', timeout: 240000,
    });
    if (command.status !== 0) throw Error('Falha ao exportar o banco externo; confira acesso, rede e espaço no executor.');
    inspect(plain);
    await protection.encrypt(plain, encrypted, env.BACKUP_ENCRYPTION_KEY);
    await protection.decrypt(encrypted, test, env.BACKUP_ENCRYPTION_KEY);
    inspect(test);
    if (hash(plain) !== hash(test)) throw Error('A conferência da cópia cifrada apresentou divergência.');
    const metadata = { format: 'potypet-backup-ci-1', createdAt: new Date().toISOString(),
      file: name, encryptedSha256: hash(encrypted), encryption: 'AES-256-GCM',
      localRoundtrip: 'pass', productionUploadVerified: false };
    fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    complete = true;
    return { file: name, localRoundtrip: 'pass', encryptedSha256: metadata.encryptedSha256 };
  } finally {
    removeOwnFiles(scratch, ['snapshot.db', 'roundtrip.db', 'snapshot.db-wal', 'snapshot.db-shm', 'roundtrip.db-wal', 'roundtrip.db-shm']);
    if (!complete) for (const file of [encrypted, manifest]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
async function verify({ directory, env = process.env }) {
  const source = requireOutsideRepository(directory);
  protection.key(env.BACKUP_ENCRYPTION_KEY);
  const candidates = fs.readdirSync(source).filter((name) => NAME.test(name));
  if (candidates.length !== 1) throw Error('Selecione um único artefato cifrado para a restauração isolada.');
  const encrypted = path.join(source, candidates[0]);
  const metadata = JSON.parse(fs.readFileSync(encrypted + '.manifest.json', 'utf8'));
  if (metadata.format !== 'potypet-backup-ci-1' || metadata.file !== candidates[0] || metadata.encryptedSha256 !== hash(encrypted))
    throw Error('O arquivo recebido não corresponde ao manifesto do backup.');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'potypet-ci-restore-'));
  fs.chmodSync(scratch, 0o700);
  const restored = path.join(scratch, 'restored.db'), copy = path.join(scratch, 'copy.db');
  try {
    await protection.decrypt(encrypted, restored, env.BACKUP_ENCRYPTION_KEY);
    inspect(restored);
    fs.copyFileSync(restored, copy, fs.constants.COPYFILE_EXCL);
    inspect(copy);
    if (hash(copy) !== hash(restored)) throw Error('A cópia restaurada apresentou divergência.');
    return { integrity: 'ok', decryption: 'ok', restoredToNewDirectory: true,
      liveDatabaseModified: false, source: 'downloaded_encrypted_artifact' };
  } finally {
    removeOwnFiles(scratch, ['restored.db', 'copy.db', 'restored.db-wal', 'restored.db-shm', 'copy.db-wal', 'copy.db-shm']);
  }
}
module.exports = { create, verify, inspect };
