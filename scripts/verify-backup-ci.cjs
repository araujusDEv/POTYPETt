'use strict';
const { verify } = require('../lib/backup-ci.cjs');
const directory = process.argv[2];
if (!directory) throw Error('Informe a pasta do artefato cifrado baixado.');
verify({ directory }).then((result) => console.log(JSON.stringify(result))).catch(() => {
  console.error('Restauração não aprovada. Confira o artefato, o manifesto e BACKUP_ENCRYPTION_KEY. O banco ativo não foi alterado.');
  process.exitCode = 1;
});
