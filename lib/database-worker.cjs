'use strict';
const { workerData } = require('node:worker_threads');
const crypto = require('node:crypto');
const { config, port } = workerData;
let client, transaction;
const CHUNK = 512 * 1024;
const normalize = (value) => value instanceof Uint8Array ? Buffer.from(value) : value;
const rows = (result) => result.rows.map((r) => Object.fromEntries(result.columns.map((k, i) => [k, r[i]])));
function fault(message, code = 'REMOTE_DATABASE') { return Object.assign(Error(message), { code }); }
async function ready() {
  const factory = config.testFile ? require('@libsql/client') : require('@libsql/client/http');
  client = factory.createClient({ url: config.url, authToken: config.authToken, intMode: 'number',
    concurrency: 1, fetch: (request) => fetch(request, { signal: AbortSignal.timeout(25000), redirect: 'error' }) });
  await client.execute('SELECT 1');
  // The server must enforce foreign keys on each connection used for writing.
  // An incompatible provider fails closed instead of dropping that protection.
  const tx = await client.transaction('write');
  try {
    const fk = await tx.execute('PRAGMA foreign_keys');
    if (Number(fk.rows[0]?.foreign_keys) !== 1) throw fault('O banco remoto precisa manter foreign_keys=ON.', 'FOREIGN_KEYS_REQUIRED');
  } finally { await tx.rollback(); tx.close(); }
  await client.execute(`CREATE TABLE IF NOT EXISTS potypet_state_chunks (
    state_key TEXT NOT NULL, ordinal INTEGER NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY(state_key, ordinal))`);
}
async function within(mode, work) {
  if (transaction) {
    if (transaction.closed) throw fault('A transação remota foi encerrada.', 'TRANSACTION_CLOSED');
    return work(transaction);
  }
  const tx = await client.transaction(mode);
  try {
    if (mode === 'write') {
      const fk = await tx.execute('PRAGMA foreign_keys');
      if (Number(fk.rows[0]?.foreign_keys) !== 1) throw fault('O banco remoto precisa manter foreign_keys=ON.', 'FOREIGN_KEYS_REQUIRED');
    }
    const value = await work(tx); await tx.commit(); return value;
  } catch (e) { try { await tx.rollback(); } catch { /* Original error is retained. */ } throw e; }
  finally { tx.close(); }
}
async function begin() {
  if (transaction) throw fault('Já existe uma transação aberta.', 'TRANSACTION_OPEN');
  const tx = await client.transaction('write');
  try {
    const fk = await tx.execute('PRAGMA foreign_keys');
    if (Number(fk.rows[0]?.foreign_keys) !== 1) throw fault('O banco remoto precisa manter foreign_keys=ON.', 'FOREIGN_KEYS_REQUIRED');
    transaction = tx;
  } catch (e) { await tx.rollback(); tx.close(); throw e; }
}
async function exec(sql) {
  const command = sql.trim().replace(/;$/, '').toUpperCase();
  if (command === 'BEGIN IMMEDIATE') return begin();
  if (command === 'COMMIT' || command === 'ROLLBACK') {
    if (!transaction) throw fault('Não há transação aberta.', 'TRANSACTION_CLOSED');
    const current = transaction;
    try { await (command === 'COMMIT' ? current.commit() : current.rollback()); }
    finally { current.close(); transaction = undefined; }
    return;
  }
  // Turso owns its journal and contention settings. All SQL constraints stay enabled.
  const filtered = sql.replace(/\bPRAGMA\s+(busy_timeout|journal_mode)\s*=\s*[^;]+;/gi, '').trim();
  if (!filtered) return;
  return within('write', (tx) => tx.executeMultiple(filtered));
}
async function statement(sql, args, result) {
  const operation = async (connection) => {
    const r = await connection.execute({ sql, args: args.map(normalize) });
    if (result === 'run') return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
    const list = rows(r); return result === 'get' ? list[0] : list;
  };
  // RETURNING queries write as well. Do not infer writability from .get()/.all().
  if (/^\s*(SELECT\b|PRAGMA\s+(?:table_info|page_count|page_size|integrity_check|foreign_key_check)\b)/i.test(sql))
    return operation(transaction || client);
  return within('write', operation);
}
async function loadState(key) {
  return within('read', (tx) => readState(tx, key));
}
async function readState(tx, key) {
    const r = await tx.execute({ sql: 'SELECT value FROM app_state WHERE key=?', args: [key] });
    if (!r.rows.length) return [];
    const metadata = JSON.parse(r.rows[0].value);
    if (metadata?.format !== 'potypet-chunks-v1') return metadata;
    if (!Number.isSafeInteger(metadata.parts) || metadata.parts < 1)
      throw fault('Formato de dados inválido.', 'STATE_INTEGRITY');
    const buffers = [];
    for (let i = 0; i < metadata.parts; i++) {
      const item = await tx.execute({ sql: 'SELECT payload FROM potypet_state_chunks WHERE state_key=? AND ordinal=?', args: [key, i] });
      if (!item.rows.length) throw fault('Parte de dados ausente.', 'STATE_INTEGRITY');
      buffers.push(Buffer.from(item.rows[0].payload));
    }
    const bytes = Buffer.concat(buffers);
    if (bytes.length !== metadata.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== metadata.sha256)
      throw fault('Dados incompletos no banco remoto.', 'STATE_INTEGRITY');
    const value = JSON.parse(bytes.toString('utf8'));
    return value;
}
async function saveState(key, value, timestamp) {
  const bytes = Buffer.from(JSON.stringify(value));
  return within('write', async (tx) => {
    await tx.execute({ sql: 'DELETE FROM potypet_state_chunks WHERE state_key=?', args: [key] });
    let serialized = bytes.toString('utf8');
    if (bytes.length > CHUNK) {
      const parts = Math.ceil(bytes.length / CHUNK);
      for (let i = 0; i < parts; i++) await tx.execute({
        sql: 'INSERT INTO potypet_state_chunks(state_key,ordinal,payload) VALUES(?,?,?)',
        args: [key, i, bytes.subarray(i * CHUNK, (i + 1) * CHUNK)],
      });
      serialized = JSON.stringify({ format: 'potypet-chunks-v1', parts, bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    await tx.execute({ sql: `INSERT INTO app_state(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, args: [key, serialized, timestamp] });
  });
}
function publicError(e) {
  const raw = e.code || e.cause?.code || '';
  const busy = /SQLITE_BUSY|SQLITE_LOCKED/.test(raw);
  const known = ['FOREIGN_KEYS_REQUIRED', 'STATE_INTEGRITY', 'TRANSACTION_CLOSED', 'TRANSACTION_OPEN'].includes(raw);
  return { message: known ? e.message : busy ? 'Banco ocupado. Aguarde e tente novamente.' : 'Banco remoto indisponível ou operação recusada.',
    code: known || /^SQLITE_[A-Z_]+$/.test(raw) ? raw : 'REMOTE_DATABASE',
    ...(busy ? { errcode: 5 } : {}), status: 503 };
}
async function exportSnapshot(destination) {
  const fs = require('node:fs'), { DatabaseSync } = require('node:sqlite');
  // Exclusive creation: an existing backup is never overwritten, even if another process races.
  const fd = fs.openSync(destination, 'wx', 0o600); fs.closeSync(fd);
  let target;
  const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
  try {
    target = new DatabaseSync(destination);
    target.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    await within('read', async (tx) => {
      const schema = await tx.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'potypet_state_chunks' ORDER BY type='table' DESC");
      const tables = rows(schema).filter((row) => row.type === 'table');
      for (const table of tables) {
        target.exec(table.sql);
        const columns = rows(await tx.execute('PRAGMA table_info(' + quote(table.name) + ')')).map((column) => column.name);
        const insert = target.prepare('INSERT INTO ' + quote(table.name) + '(' + columns.map(quote).join(',') + ') VALUES(' + columns.map(() => '?').join(',') + ')');
        // One row at a time keeps individual responses below the provider's response limit.
        for (let offset = 0;; offset++) {
          const r = await tx.execute('SELECT ' + columns.map(quote).join(',') + ' FROM ' + quote(table.name) + ' ORDER BY rowid LIMIT 1 OFFSET ' + offset);
          if (!r.rows.length) break;
          const item = rows(r)[0];
          if (table.name === 'app_state') item.value = JSON.stringify(await readState(tx, item.key));
          insert.run(...columns.map((name) => normalize(item[name])));
        }
      }
      if (rows(await tx.execute("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'")).length) {
        target.exec('DELETE FROM sqlite_sequence');
        const insert = target.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)');
        for (const item of rows(await tx.execute('SELECT name,seq FROM sqlite_sequence'))) insert.run(item.name, item.seq);
      }
      for (const item of rows(schema).filter((row) => row.type !== 'table')) target.exec(item.sql);
    });
    if (target.prepare('PRAGMA foreign_key_check').all().length || target.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw fault('O backup não passou na verificação de integridade.', 'STATE_INTEGRITY');
    target.exec('COMMIT'); target.close(); target = undefined; fs.chmodSync(destination, 0o600);
  } catch (e) {
    try { target?.close(); } catch { /* Remove the incomplete file below. */ }
    fs.rmSync(destination, { force: true }); throw e;
  }
}
let queue = Promise.resolve();
port.on('message', (message) => {
  queue = queue.then(async () => {
    const signal = new Int32Array(message.signal);
    try {
      let value;
      if (message.action === 'ready') await ready();
      else if (message.action === 'exec') value = await exec(message.sql);
      else if (message.action === 'statement') value = await statement(message.sql, message.args, message.result);
      else if (message.action === 'load_state') value = await loadState(message.key);
      else if (message.action === 'save_state') value = await saveState(message.key, message.value, message.timestamp);
      else if (message.action === 'export') value = await exportSnapshot(message.destination);
      else if (message.action === 'close') { if (transaction) { await transaction.rollback(); transaction.close(); transaction = undefined; } client.close(); }
      else throw fault('Operação de banco desconhecida.');
      port.postMessage({ id: message.id, ok: true, value, transaction: Boolean(transaction) });
    } catch (e) { port.postMessage({ id: message.id, ok: false, error: publicError(e), transaction: Boolean(transaction) }); }
    finally { Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); }
  });
});
