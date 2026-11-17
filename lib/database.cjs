'use strict';
const path = require('node:path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
function settings(env = process.env) {
  const driver = env.DATABASE_DRIVER || 'sqlite';
  if (!['sqlite', 'turso'].includes(driver)) throw Error('DATABASE_DRIVER deve ser sqlite ou turso.');
  if (driver === 'sqlite') return { driver, remote: false };
  let url;
  try { url = new URL(env.TURSO_DATABASE_URL); } catch { throw Error('Configure TURSO_DATABASE_URL.'); }
  const testFile = env.NODE_ENV === 'test' && url.protocol === 'file:';
  const testHttp = env.NODE_ENV === 'test' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!testFile && (!['https:', 'libsql:'].includes(url.protocol) && !testHttp ||
      url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)))
    throw Error('TURSO_DATABASE_URL deve usar libsql ou HTTPS, sem senha ou parâmetros na URL.');
  if (!testFile && (typeof env.TURSO_AUTH_TOKEN !== 'string' || !/^[A-Za-z0-9._-]{16,16384}$/.test(env.TURSO_AUTH_TOKEN)))
    throw Error('Configure TURSO_AUTH_TOKEN somente no ambiente seguro.');
  if (url.protocol === 'libsql:') url.protocol = 'https:';
  // URL.protocol cannot change between non-special libsql and special https in every runtime.
  const address = url.href.replace(/^libsql:/, 'https:');
  return { driver, remote: true, url: address, authToken: testFile ? undefined : env.TURSO_AUTH_TOKEN, testFile };
}
const revive = (v) => {
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  return v;
};
class RemoteDatabase {
  constructor(config) {
    this.remote = true; this.closed = false; this.isTransaction = false; this.sequence = 0;
    const channel = new MessageChannel(); this.port = channel.port1;
    this.worker = new Worker(path.join(__dirname, 'database-worker.cjs'), {
      workerData: { config, port: channel.port2 }, transferList: [channel.port2],
    });
    this.worker.on('error', () => { this.broken = true; });
    this.worker.unref(); this.port.unref();
    try { this.rpc('ready'); } catch (e) { this.closeFailed(); throw e; }
  }
  closeFailed() { this.broken = true; this.port.close(); void this.worker.terminate(); }
  rpc(action, fields = {}) {
    if (this.closed || this.broken) throw Object.assign(Error('Banco remoto indisponível.'), { status: 503 });
    const id = ++this.sequence, signal = new Int32Array(new SharedArrayBuffer(4));
    this.port.postMessage({ id, action, ...fields, signal: signal.buffer });
    if (Atomics.wait(signal, 0, 0, action === 'export' ? 120000 : 30000) === 'timed-out') {
      this.closeFailed();
      // Never retry an uncertain write or fall back to an empty local database.
      throw Object.assign(Error('O banco remoto demorou a responder. Confira a operação antes de repetir.'), { status: 503 });
    }
    const message = receiveMessageOnPort(this.port)?.message;
    if (!message || message.id !== id) { this.closeFailed(); throw Object.assign(Error('Resposta inválida do banco remoto.'), { status: 503 }); }
    this.isTransaction = message.transaction === true;
    if (!message.ok) throw Object.assign(Error(message.error.message), message.error);
    return revive(message.value);
  }
  prepare(sql) {
    return {
      get: (...args) => this.rpc('statement', { sql, args, result: 'get' }),
      all: (...args) => this.rpc('statement', { sql, args, result: 'all' }),
      run: (...args) => this.rpc('statement', { sql, args, result: 'run' }),
    };
  }
  exec(sql) { this.rpc('exec', { sql }); }
  loadState(key) { return this.rpc('load_state', { key }); }
  saveState(key, value, timestamp) { this.rpc('save_state', { key, value, timestamp }); }
  exportSnapshot(destination) { this.rpc('export', { destination }); }
  close() {
    if (this.closed) return;
    try { if (!this.broken) this.rpc('close'); }
    finally { this.closed = true; this.port.close(); void this.worker.terminate(); }
  }
}
function openDatabase(filename, config = settings()) {
  return config.remote ? new RemoteDatabase(config) : new (require('node:sqlite').DatabaseSync)(filename);
}
module.exports = { settings, openDatabase };
