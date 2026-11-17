# Publicar com as postagens incluídas

Os textos e as nove fotos agora acompanham o código em `conteudo-inicial/`. Essa pasta deve ir ao GitHub junto com o site. As senhas continuam somente nas variáveis do ambiente. O arquivo `fotos-cadastro/dados.json` não contém senhas; a pasta `fotos-cadastro/` continua ignorada pelo Git e é preparada automaticamente na hospedagem.

## No Render

1. Envie os arquivos extraídos do ZIP ao mesmo repositório conectado ao serviço, incluindo `conteudo-inicial/` e `scripts/iniciar.cjs`. Para controlar quem pode acessar os dados incluídos no código antes da publicação, use um repositório privado. Não envie `.env`, `node_modules` ou bancos.
2. Mantenha **Build Command: `npm ci`** e **Start Command: `npm start`**. O comando de início agora executa o servidor original e, depois que ele estiver ouvindo HTTP, prepara os cadastros pela API.
3. Em **Environment**, configure `CADASTRO_INICIAL=1` e `USUARIO_SENHA` com a senha de Maria, de 12 a 128 caracteres, com letra e número. Mantenha `DONOR_PASSWORD` com a senha atual da ONG. Não precisa informar senha administrativa ao cadastro.
4. A conta responsável esperada é `hypestoreoofc@gmai.com`, exatamente como informado. Em banco novo, `DONOR_EMAIL` precisa corresponder a esse endereço e `DONOR_NAME` pode ser `Associação Poty Amigos dos Bichos`. Em banco existente, o script avisa se o nome for diferente e preserva a conta.
5. Execute **Manual Deploy → Deploy latest commit**. Nos logs, aguarde `Carga inicial concluída. Aprovações seguem pelo painel.`. O cadastro não exige executar PowerShell no computador.

Se a instalação exigir confirmação de e-mail para Maria, o servidor continua funcionando e o cadastro informa essa pendência. Confirme pelo link recebido e use **Restart service** para retomar. Se o cadastro falhar por campo, senha, foto ou limite de requisições, ele informa o motivo e não derruba o site.

## O que aparece

O perfil público da ONG é preenchido, os desaparecidos Bolinha e Tigre seguem a publicação normal do servidor, e os cinco anúncios de adoção e duas campanhas ficam aguardando sua análise. Os nomes, textos, fotos e regras são os mesmos já fornecidos. A inclusão no pacote não transforma pendências em publicações aprovadas.

Entre com o administrador no painel para conferir e aprovar. Depois da aprovação, os animais aparecem em `/adotar.html` e as campanhas em `/doacoes.html`. A página da ONG mostra os animais e a campanha da própria ONG; a campanha de Maria não é vinculada a uma organização de terceiros.

O cadastro consulta os itens existentes a cada início, sem duplicá-los, e respeita aprovações, recusas e arquivamentos anteriores. Um banco recriado recebe o conjunto novamente no próximo início, desde que as contas e senhas esperadas estejam configuradas. Não existe marcador externo de conclusão.

Para interromper futuras importações, defina `CADASTRO_INICIAL=0`. A retirada dos cadastros já existentes continua sendo feita pelos painéis, conforme o [guia do cadastro](CADASTRO-INICIAL.md).

## A pasta do banco continua necessária

Essa mudança inclui as postagens e automatiza o cadastro. O servidor continua usando SQLite para as contas, aprovações, solicitações e demais operações.

O erro `EACCES: permission denied, mkdir '/var/data/appet'` acontece antes de o servidor abrir a API. A carga automática só começa depois que o servidor inicia; portanto, não corrige esse erro nem desliga as verificações de armazenamento ou de produção. Com disco montado em `/var/data`, o caminho do banco pode ser configurado como `DATA_DIR=/var/data/appet` e `PERSISTENT_DISK_PATH=/var/data`. O plano Free não disponibiliza disco persistente.

`server.js` e todos os arquivos de `lib/` permanecem idênticos ao ZIP original. Nenhum dado foi aprovado automaticamente, nenhuma credencial foi embutida e o transporte de e-mail e os controles de segurança da instalação foram preservados.
