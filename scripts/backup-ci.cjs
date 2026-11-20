'use strict';
const { create } = require('../lib/backup-ci.cjs');
const directory = process.argv[2];
if (!directory) throw Error('Informe uma pasta privada e vazia fora do repositório.');
create({ directory }).then((result) => console.log(JSON.stringify(result))).catch(() => {
  console.error('Backup não concluído. Confira DATABASE_DRIVER, as credenciais do banco, BACKUP_ENCRYPTION_KEY, a rede e o espaço. Nenhuma credencial é exibida.');
  process.exitCode = 1;
});
