'use strict';
const path = require('node:path'), { DatabaseSync } = require('node:sqlite');
const review = require('../lib/retention-review.cjs');
const filename = process.argv[2];
if (!filename) {
  console.error('Uso: npm run retention:review -- CAMINHO_DE_COPIA_RESTAURADA.db. Somente leitura; não elimina dados.');
  process.exitCode = 1;
} else {
  let db;
  try {
    db = new DatabaseSync(path.resolve(filename), { readOnly: true });
    // Snapshot completo reconstruído pelo backup; nunca consulta tabelas fragmentadas do banco ativo.
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='potypet_state_chunks' AND type='table'").get() &&
        db.prepare('SELECT COUNT(*) AS n FROM potypet_state_chunks').get().n)
      throw Error('Use a cópia reconstruída pelo backup, não o armazenamento fragmentado.');
    const report = review((key) => {
      const row = db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
      const value = row ? JSON.parse(row.value) : [];
      if (!Array.isArray(value)) throw Error('Coleção inválida.');
      return value;
    });
    console.log(JSON.stringify(report, null, 2));
  } catch {
    console.error('Não foi possível analisar a cópia. Confira formato, integridade e acesso ao arquivo. Nenhum registro foi apagado.');
    process.exitCode = 1;
  } finally { db?.close(); }
}
