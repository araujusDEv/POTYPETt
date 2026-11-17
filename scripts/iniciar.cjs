'use strict';
const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

// These are public posting inputs, never credentials or an operational database.
// Existing local inputs are preserved so that manual corrections are not overwritten.
function prepareInputs(source = path.join(root, 'conteudo-inicial'), destination = path.join(root, 'fotos-cadastro')) {
  const data = JSON.parse(fs.readFileSync(path.join(source, 'dados.json'), 'utf8'));
  const files = ['dados.json', ...new Set(['animals', 'missing', 'campaigns'].flatMap((key) => data[key].map((item) => item.photo)))];
  for (const name of files) {
    if (typeof name !== 'string' || path.basename(name) !== name || !fs.statSync(path.join(source, name)).isFile())
      throw Error('Confira os arquivos incluídos em conteudo-inicial.');
  }
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const name of files) {
    try { fs.copyFileSync(path.join(source, name), path.join(destination, name), fs.constants.COPYFILE_EXCL); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  return destination;
}
function start(env = process.env) {
  const controller = new AbortController();
  const redact = (value) => {
    let result = String(value);
    for (const key of ['ADMIN_PASSWORD', 'DONOR_PASSWORD', 'USUARIO_SENHA'])
      if (env[key]) result = result.split(env[key]).join('[sigilo]');
    return result.replace(/^(Administrador|Doador):(.+?) \/ .+$/, '$1:$2 / credenciais não exibidas');
  };
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root, env, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'],
  });
  let importing = false;
  async function importContent() {
    if (env.CADASTRO_INICIAL !== '1' || importing) return;
    importing = true;
    try {
      const port = Number(env.PORT || 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw Error('Defina PORT entre 1 e 65535 para o cadastro automático.');
      const directory = prepareInputs();
      console.log('Preparando o conteúdo inicial incluído no site.');
      const result = await require('./cadastro-inicial.cjs').run({
        directory, env: { ...env, CADASTRO_URL: 'http://127.0.0.1:' + port },
        log: (line) => console.log(redact(line)),
        fetchImpl: (url, options) => fetch(url, {
          ...options, signal: AbortSignal.any([controller.signal, options.signal]),
        }),
      });
      if (result.status === 'pending_email')
        console.log('Após confirmar o e-mail de Maria, reinicie o serviço para concluir o cadastro.');
      else if (result.status === 'complete') console.log('Carga inicial concluída. Aprovações seguem pelo painel.');
    } catch (e) {
      if (!controller.signal.aborted)
        console.error('O site iniciou; o cadastro inicial ficou pendente: ' + redact(e.message));
    }
  }
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let buffer = '';
    stream.setEncoding('utf8');
    const line = (text) => {
      output.write(redact(text) + '\n');
      // Run only after the original server has successfully opened its HTTP listener.
      if (text.startsWith('PotyPet rodando em http://127.0.0.1:')) void importContent();
    };
    stream.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, index).replace(/\r$/, '')); buffer = buffer.slice(index + 1);
      }
    });
    stream.on('end', () => { if (buffer) line(buffer); });
  }
  const stop = () => { controller.abort(); child.kill('SIGTERM'); };
  const onMessage = (message) => { if (message === 'stop') stop(); };
  if (process.connected) process.on('message', onMessage);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  child.once('error', (e) => { controller.abort(); console.error('Falha ao iniciar: ' + redact(e.message)); process.exitCode = 1; });
  child.once('close', (code, signal) => {
    controller.abort();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    process.removeListener('message', onMessage);
    if (process.connected) process.disconnect();
    process.exitCode = signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : code ?? 1;
  });
  return child;
}
module.exports = { prepareInputs, start };
if (require.main === module) start();
