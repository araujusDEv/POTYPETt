// Testa a configuração de e-mail SMTP (npm run check:email).
'use strict';
const nodemailer = require('nodemailer'),
  { settings } = require('../lib/mail-service.cjs');
(async () => {
  const config = settings(process.env);
  if (!['smtp', 'gmail_http'].includes(config.mode))
    throw Error('Configure EMAIL_TRANSPORT=smtp ou gmail_http.');
  const transport = config.mode === 'gmail_http' ? require('../lib/gmail-http.cjs')(config) : nodemailer.createTransport(config.smtp);
  try {
    await transport.verify();
    console.log(
      'Conexão e autenticação de e-mail verificadas. Confira a entrega com um cadastro real. Nenhuma mensagem foi enviada por este comando.',
    );
  } finally {
    transport.close();
  }
})().catch(() => {
  console.error(
    'Não foi possível verificar o e-mail. Confira o transporte e as variáveis no guia. Credenciais não são exibidas.',
  );
  process.exitCode = 1;
});
