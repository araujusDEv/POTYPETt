# PotyPet — Render gratuito com dados persistidos no Turso

**Governança — 19/11/2026:** Equipe PotyPet, atendimento de segunda a quinta, critérios de conservação e novo aceite explícito. Backup cifrado pelo GitHub Actions preparado, com ativação externa ainda necessária. Leia `ATUALIZAR-GOVERNANCA.txt` e `docs/governanca/BACKUP-GITHUB.txt`.

**Atualização do acesso — 19/11/2026:** recuperação de senha e confirmação de cadastro agora possuem títulos e instruções diferentes, com atalho para recuperar a senha e preservação do e-mail digitado. Leia `ATUALIZAR-ACESSO.txt`.

**Atualização de interface — 19/11/2026:** análise de campanhas em três etapas, progresso das verificações, campos condicionais e foto local do login. Para atualizar a instalação existente, leia `ATUALIZAR-INTERFACE.txt`.

Este pacote foi adaptado para **Render Free + Turso Free + e-mail Google por HTTPS**, com as postagens e nove fotos já incluídas. O `render.yaml` não cria disco ou serviço pago. As contas e os segredos dos provedores são configurados por você, conforme o guia.

**Comece por [RENDER-GRATUITO.md](docs/guias/RENDER-GRATUITO.md).** Ele explica como atualizar o mesmo repositório no GitHub, criar o banco, preparar o e-mail e corrigir o erro de `/var/data/appet` sem contratar disco.

Contas atualizadas em 17/11/2026: administrador e remetente `potypett@gmail.com`, ONG `ongpotypet@gmail.com` e usuário comum `hypestoreoofc@gmail.com`. Defina as senhas somente no Render; `DONOR_PASSWORD` e `USUARIO_SENHA` exigem de 12 a 128 caracteres, letras e números. No serviço existente, atualize `DONOR_EMAIL` em Environment. A mudança não renomeia contas que já existam no banco.

## Publicação

1. Envie os arquivos extraídos para a raiz do repositório conectado ao Render; inclua `conteudo-inicial/`, `lib/`, `scripts/` e `integracoes/`.
2. Crie um banco **Turso Free compatível com libSQL** e configure o aplicativo Google de e-mail descrito no guia.
3. No Render, use plano **Free**, Build `npm ci`, Start `npm start`, Node **24.21.0** e as variáveis do guia. O modo remoto usa `DATABASE_DRIVER=turso`; dispensa `DATA_DIR` e disco persistente.
4. Confirme o e-mail de Maria, reinicie o serviço e revise os cinco anúncios e duas campanhas no painel administrativo. As aprovações continuam manuais.

A pasta `conteudo-inicial/` contém os textos, contatos e fotos fornecidos para publicação, sem senhas. Prefira repositório privado. Não envie `.env`, `node_modules`, bancos, backups, tokens ou arquivos de execução. `fotos-cadastro/` é preparada automaticamente e continua ignorada pelo Git.

## Funcionamento

O servidor mantém as páginas, validações, sessões, confirmação de e-mail, recuperação de senha e aprovação administrativa do PotyPet 4.7.0. No modo Turso, as consultas usam o SDK oficial libSQL por HTTPS. Fotos e anexos ficam no banco externo, inclusive coleções grandes divididas em partes com verificação de integridade. O banco remoto indisponível interrompe a operação; não há troca automática para um banco local vazio.

O envio de e-mail usa `MailApp` em um aplicativo Google seu, com requisições assinadas. O segredo fica somente no ambiente e nas Propriedades do script. A fila permanece cifrada no banco e falhas de envio não liberam contas sem confirmação. A configuração SMTP original continua disponível em hospedagens compatíveis.

Os planos gratuitos têm cotas e o Render pode suspender o processo sem tráfego. Siga a etapa de verificação do guia depois da implantação: os testes locais não certificam as credenciais, a permanência no provedor ou a chegada na sua caixa.

## Uso local e testes

Com Node 24.21.0:

```powershell
npm ci
npm test
npm run test:gratuito
```

`npm test` inclui os testes de segurança e fluxos existentes, cadastro inicial e hospedagem remota. `test:gratuito` executa apenas os cenários novos de banco HTTP, e-mail assinado e persistência após reinício. Não envia e-mails reais nem acessa contas Turso.

Para desenvolvimento local, o padrão permanece SQLite e `npm start` inicia o site. Para produção com SQLite local, use `DATABASE_DRIVER=sqlite`, armazenamento persistente privado fora do código e transporte de e-mail válido, conforme `.env.production.example`. Essa alternativa não corresponde ao Render Free. `render.demo.yaml` permanece como configuração antiga de prévia temporária; o guia gratuito e o `render.yaml` da raiz são os caminhos deste pacote.

## Documentação

- [Publicar gratuitamente](docs/guias/RENDER-GRATUITO.md)
- [Postagens incluídas](docs/guias/POSTAGENS-INCLUIDAS.md)
- [Importador HTTP e como desfazer](docs/guias/CADASTRO-INICIAL.md)

Os demais guias de hospedagem do projeto descrevem também a alternativa SQLite com disco e SMTP. Para este pacote no Render Free, use as variáveis do novo guia. Atualizar o código não migra automaticamente um banco operacional antigo. As configurações legais e os dados dos responsáveis devem ser conferidos por quem administra o site.
