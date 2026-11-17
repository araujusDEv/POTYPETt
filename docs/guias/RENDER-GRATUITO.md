# Publicar o PotyPet sem pagar

Use **Render Free** para executar o site, **Turso Free** para guardar o banco e uma **conta Google + Apps Script** para enviar os e-mails por HTTPS. O pacote não cria serviços pagos. Você precisa criar/configurar as contas e colocar os segredos no painel; nenhuma senha vem dentro do código.

O erro `mkdir '/var/data/appet'` é resolvido usando `DATABASE_DRIVER=turso`. Não é preciso contratar disco. As contas, fotos, campanhas, sessões e históricos ficam no Turso, fora do armazenamento temporário do Render. Os textos e as nove fotos iniciais acompanham o código em `conteudo-inicial/`.

## 1. Atualizar o GitHub

Extraia o ZIP e envie **os arquivos extraídos**, incluindo as pastas, para a raiz do mesmo repositório conectado ao Render. Pode usar o repositório antigo, desde que seja o deste site. `package.json`, `server.js` e `render.yaml` devem aparecer na raiz. O ZIP sozinho não serve para o deploy.

Inclua `lib/`, `scripts/`, `integracoes/`, `conteudo-inicial/`, `package-lock.json`, `.node-version`, `.gitignore` e as demais pastas do site. Prefira repositório privado, pois o conteúdo inicial contém contatos fornecidos para as postagens. Não envie `.env`, `node_modules`, bancos, backups ou tokens. Atualizar o código não copia o banco da hospedagem anterior; a configuração abaixo é para banco Turso novo.

## 2. Criar o banco gratuito

1. Abra [Turso](https://app.turso.tech/) e escolha **Free**, sem upgrade ou cartão.
2. Crie um banco chamado `potypet`, com mecanismo **libSQL/SQLite compatível**, e escolha a região disponível mais próxima da região do Render.
3. Copie o **Database URL** (`libsql://...`) e gere um token com permissão de leitura e escrita para esse banco.
4. Guarde a URL e o token para `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no Render. Não coloque o token no GitHub, em HTML ou no JavaScript do navegador.

O aplicativo cria as tabelas sozinho. Ele recusa conexões sem proteção de chaves estrangeiras; se aparecer `foreign_keys=ON`, confira se escolheu um banco libSQL compatível.

## 3. Preparar o envio gratuito de e-mail

O Render Free bloqueia as portas SMTP comuns. Este pacote usa HTTPS para um pequeno script seu no Google, sem compra de domínio.

1. Entre na conta Google que enviará os e-mails e abra [Google Apps Script](https://script.google.com/). Crie um projeto chamado `PotyPet Email`.
2. Substitua o conteúdo de `Code.gs` pelo arquivo `integracoes/google-email/Code.gs` deste pacote.
3. Nas configurações do projeto, habilite a exibição de `appsscript.json` e substitua seu conteúdo pelo arquivo de mesmo nome da pasta `integracoes/google-email/`. Salve.
4. Em **Configurações do projeto → Propriedades do script**, adicione:
   - `MAIL_FROM`: o endereço da própria conta Google usada para criar o script, em letras minúsculas. Não use um alias com `+maria` como remetente.
   - `MAIL_HTTP_SECRET`: uma chave aleatória de **32 bytes em base64**.
5. Para gerar essa chave, no terminal com Node instalado execute o comando abaixo. Copie o resultado para a propriedade do script e, depois, para o Render. Não salve o resultado em arquivo do repositório.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

6. No editor Google, selecione `autorizarEmail` e clique em **Executar**. Autorize o envio de e-mails e a identificação do remetente na sua própria conta. Esse script usa `MailApp`; não solicita leitura da caixa de entrada. Se a conta gerenciada bloquear aplicativos web públicos, use uma conta pessoal em que esse recurso esteja disponível.
7. Clique em **Implantar → Nova implantação → Aplicativo da Web**. Selecione **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. O endereço pode ser público porque o envio exige uma assinatura secreta conferida pelo código.
8. Copie a **URL do aplicativo da Web**, terminada em `/exec`, para `MAIL_HTTP_URL`. A URL `/dev` não serve.

O segredo precisa ser o mesmo no Google e no Render. `MAIL_FROM` também precisa ser igual nos dois. Se alterar `Code.gs`, publique uma nova versão em **Gerenciar implantações**. Não basta salvar no editor.

## 4. Configurar seu serviço no Render

No serviço existente, mantenha o plano **Free** e abra **Environment**. Use **Build Command: `npm ci`**, **Start Command: `npm start`**, runtime Node e health check `/api/health`.

Configure:

| Variável | Valor |
| --- | --- |
| `NODE_VERSION` | `24.21.0` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_DRIVER` | `turso` |
| `TURSO_DATABASE_URL` | URL do banco criado |
| `TURSO_AUTH_TOKEN` | Token de leitura e escrita desse banco |
| `EMAIL_TRANSPORT` | `gmail_http` |
| `MAIL_FROM` | Mesma conta Google configurada no script |
| `MAIL_HTTP_URL` | URL do aplicativo Google, terminada em `/exec` |
| `MAIL_HTTP_SECRET` | Mesma chave base64 configurada no Google |
| `MAIL_QUEUE_KEY` | **Outra** chave de 32 bytes em base64; gere novamente com o comando acima |
| `COOKIE_SECURE` | `1` |
| `SEED_DEMO_ACCOUNTS` | `0` |
| `SEED_SAMPLE_DATA` | `0` |
| `BACKUP_AUTO` | `0` |
| `TRUST_PROXY` | `0` |
| `CADASTRO_INICIAL` | `1` |
| `ADMIN_EMAIL` | Seu e-mail de administrador |
| `ADMIN_PASSWORD` | Senha exclusiva, mínimo 12 caracteres, letras e números |
| `DONOR_EMAIL` | `hypestoreoofc@gmai.com`, exatamente como solicitado para a ONG |
| `DONOR_NAME` | `Associação Poty Amigos dos Bichos` |
| `DONOR_PASSWORD` | Outra senha forte para a ONG |
| `USUARIO_SENHA` | Outra senha forte para Maria Helena Souza |

Remova `DATA_DIR=/var/data/appet` e `PERSISTENT_DISK_PATH`: não são usados no modo Turso. Não adicione disco, Render Postgres ou plano pago. Remova as variáveis SMTP antigas para não confundir o próximo ajuste.

O Render define `PORT` e `RENDER_EXTERNAL_URL` automaticamente. O aplicativo usa esse endereço HTTPS nos links de confirmação. Se já houver `PUBLIC_BASE_URL`, corrija para a origem real do site ou remova para usar `RENDER_EXTERNAL_URL`; não deixe `https://SEU_SITE`.

Para um serviço novo, pode usar **New → Blueprint** com o `render.yaml` da raiz: ele já define o plano Free e pede as variáveis privadas. As mesmas etapas de Turso e Google continuam necessárias.

## 5. Publicar e concluir as postagens

1. Salve o ambiente e use **Manual Deploy → Deploy latest commit**.
2. Aguarde o site iniciar. Os logs devem indicar `Banco remoto Turso/libSQL conectado`.
3. Na primeira carga, Maria receberá a confirmação em `potypett+maria@gmail.com`. Abra o link recebido e informe a senha definida em `USUARIO_SENHA`. Confira também a caixa de spam.
4. Use **Restart service** no Render para retomar a carga. Aguarde `Carga inicial concluída. Aprovações seguem pelo painel.`.
5. Entre em `/login.html` com `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Confira os cinco anúncios de adoção e as duas campanhas e decida pelo painel. Eles só aparecem no catálogo público após aprovação. Bolinha e Tigre seguem a publicação normal dos desaparecidos.
6. Faça outro reinício e confira uma foto e as aprovações: os dados devem permanecer. O cadastro não duplica os itens já existentes.
7. Após concluir a carga, pode definir `CADASTRO_INICIAL=0`. Isso preserva os cadastros e evita novas tentativas a cada início.

As senhas de bootstrap não mudam contas já criadas quando você altera o painel. Use a recuperação de senha da própria aplicação. Mantenha `MAIL_QUEUE_KEY` estável: ela protege os e-mails ainda pendentes. Não publique os segredos em prints ou no GitHub.

## Limites e cópia de segurança

Os serviços gratuitos têm cotas. O Render pode suspender o processo sem tráfego e levar cerca de um minuto para voltar; a fila de e-mail só trabalha enquanto o processo está ativo. O Turso mantém os dados remotamente, dentro da cota do plano. Uma conta Google pessoal tem limite de destinatários por dia; notificações também consomem essa cota. O site mantém a confirmação obrigatória mesmo se o envio falhar.

O `BACKUP_AUTO=0` evita tratar a pasta temporária como backup permanente. Para guardar uma cópia sua, configure as variáveis Turso no seu computador, instale as dependências com `npm ci` e execute:

```powershell
npm run backup -- C:\caminho\privado\potypet-backup.db
npm run restore:check -- C:\caminho\privado\potypet-backup.db
```

O comando exporta um snapshot consistente para SQLite, com fotos e anexos, sem sobrescrever arquivo existente. Guarde a cópia em pasta privada fora do repositório. O token Turso e as chaves de ambiente precisam ser guardados separadamente. Essa exportação não substitui automaticamente o banco ativo do Turso.

## Se não funcionar

- **Erro `/var/data/appet`:** confira se o commit novo foi publicado e `DATABASE_DRIVER=turso` está definido.
- **Banco remoto indisponível:** confira URL, token, validade e mecanismo libSQL. O servidor não muda para um banco local vazio quando o remoto falha.
- **E-mail não chega:** confira a implantação Google `/exec`, o acesso público, a execução como proprietário, as duas propriedades e a cota. Com as variáveis configuradas no computador, `npm run check:email` verifica a autenticação sem enviar mensagem; a chegada na caixa precisa de um cadastro real.
- **Carga pendente:** confira a confirmação de Maria, as senhas e os logs. A falha da carga não derruba o site. Os detalhes do importador estão em [CADASTRO-INICIAL.md](CADASTRO-INICIAL.md).

## O que foi verificado neste pacote

Testes locais com servidor HTTP real e SDK oficial libSQL: transações, restrições, dados com mais de 10 MB, integridade de fotos, confirmação de e-mail, aprovação manual, reinício sem pasta temporária, idempotência e backup restaurável. O envio Google foi testado com o código Apps Script em ambiente simulado, incluindo assinatura, expiração, quota e redirecionamentos. A publicação real no Render/Turso e a entrega na sua caixa dependem das suas contas e credenciais; ainda precisam da conferência do passo 5.

Referências oficiais consultadas em 16/11/2026: [limites do Render Free](https://render.com/docs/free), [Turso Free](https://turso.tech/pricing), [cotas Google Apps Script](https://developers.google.com/apps-script/guides/services/quotas), [aplicativos web Google](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app). Confira o plano Free ao criar as contas; os limites dos provedores podem mudar.
