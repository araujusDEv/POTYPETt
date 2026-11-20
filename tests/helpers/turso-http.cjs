// Local Hrana v2 fixture: real SQLite transactions behind the official libSQL HTTP SDK.
'use strict';
const http = require('node:http'), crypto = require('node:crypto'), { DatabaseSync } = require('node:sqlite');
const connections = new Map(); let loseCommit = false;
const wire = (value) => value === null ? { type: 'null' } : value instanceof Uint8Array ? { type: 'blob', base64: Buffer.from(value).toString('base64') } :
  typeof value === 'string' ? { type: 'text', value } : Number.isInteger(value) ? { type: 'integer', value: String(value) } : { type: 'float', value };
const unwire = (v) => v.type === 'null' ? null : v.type === 'blob' ? Buffer.from(v.base64, 'base64') : v.type === 'integer' ? Number(v.value) : v.value;
const error = (e) => ({ message: 'SQL refused in fixture', code: e.errstr?.includes('constraint') ? 'SQLITE_CONSTRAINT' : e.errcode === 5 ? 'SQLITE_BUSY' : 'SQLITE_ERROR' });
function allowedSql(sql) {
  // Managed providers reserve local database maintenance for their own infrastructure.
  if (/\bPRAGMA\s+(?:optimize|busy_timeout|journal_mode)\b/i.test(sql))
    throw Error('Local maintenance is not allowed on the managed fixture.');
  return sql;
}
function execute(c, input) {
  const sql = allowedSql(input.sql ?? c.cache.get(input.sql_id)), statement = c.db.prepare(sql);
  const args = (input.args || []).map(unwire), cols = statement.columns().map((col) => ({ name: col.name, decltype: col.type || null }));
  let data;
  if (cols.length) data = statement.all(...args).map((row) => cols.map((col) => wire(row[col.name])));
  else { statement.run(...args); data = []; }
  const changes = c.db.prepare('SELECT changes() AS n,last_insert_rowid() AS id').get();
  if (/^\s*COMMIT/i.test(sql) && loseCommit) { loseCommit = false; c.drop = true; }
  return { cols, rows: input.want_rows === false ? [] : data,
    affected_row_count: /^\s*(?:SELECT|PRAGMA)/i.test(sql) ? 0 : Number(changes.n), last_insert_rowid: String(changes.id) };
}
function condition(c, input, results, errors) {
  if (!input) return true;
  if (input.type === 'ok') return Boolean(results[input.step]);
  if (input.type === 'error') return Boolean(errors[input.step]);
  if (input.type === 'not') return !condition(c, input.cond, results, errors);
  if (input.type === 'and') return input.conds.every((v) => condition(c, v, results, errors));
  if (input.type === 'or') return input.conds.some((v) => condition(c, v, results, errors));
  if (input.type === 'is_autocommit') return !c.db.isTransaction;
  throw Error('Unsupported condition');
}
const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + process.env.FIXTURE_TOKEN) { res.writeHead(403); return res.end(); }
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    let baton = body.baton, c = baton && connections.get(baton);
    if (!c) {
      baton = crypto.randomUUID(); const db = new DatabaseSync(process.env.FIXTURE_DATABASE);
      db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=' + (process.env.FIXTURE_NO_FK === '1' ? 'OFF' : 'ON'));
      c = { db, cache: new Map() }; connections.set(baton, c);
    }
    let closed = false;
    const results = body.requests.map((item) => {
      try {
        let response = { type: item.type };
        if (item.type === 'execute') response.result = execute(c, item.stmt);
        else if (item.type === 'sequence') c.db.exec(allowedSql(item.sql ?? c.cache.get(item.sql_id)));
        else if (item.type === 'store_sql') c.cache.set(item.sql_id, item.sql);
        else if (item.type === 'close_sql') c.cache.delete(item.sql_id);
        else if (item.type === 'get_autocommit') response.is_autocommit = !c.db.isTransaction;
        else if (item.type === 'close') { c.db.close(); connections.delete(baton); closed = true; }
        else if (item.type === 'batch') {
          const step_results = [], step_errors = [];
          for (const step of item.batch.steps) {
            try { step_results.push(condition(c, step.condition, step_results, step_errors) ? execute(c, step.stmt) : null); step_errors.push(null); }
            catch (e) { step_results.push(null); step_errors.push(error(e)); }
          }
          response.result = { step_results, step_errors };
        } else throw Error('Unsupported request');
        return { type: 'ok', response };
      } catch (e) { return { type: 'error', error: error(e) }; }
    });
    if (c.drop) {
      if (!closed) { c.db.close(); connections.delete(baton); }
      return res.destroy();
    }
    const output = JSON.stringify({ baton: closed ? null : baton, base_url: null, results });
    if (Buffer.byteLength(output) > 9 * 1024 * 1024) { res.writeHead(413); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(output);
  } catch { res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', (message) => {
  if (message === 'lose-commit') { loseCommit = true; process.send('armed'); }
  if (message === 'stop') {
    for (const c of connections.values()) c.db.close(); connections.clear();
    server.close(); server.closeAllConnections(); process.disconnect();
  }
});
