# Publicar com as postagens incluídas

**No Render gratuito, comece por [RENDER-GRATUITO.md](RENDER-GRATUITO.md).** Este pacote já aceita Turso e e-mail por HTTPS, sem disco pago. As instruções de cadastro abaixo continuam válidas.

Os textos e as nove fotos agora acompanham o código em `conteudo-inicial/`. Essa pasta deve ir ao GitHub junto com o site. As senhas continuam somente nas variáveis do ambiente. O arquivo `fotos-cadastro/dados.json` não contém senhas; a pasta `fotos-cadastro/` continua ignorada pelo Git e é preparada automaticamente na hospedagem.

## No Render

1. Envie os arquivos extraídos do ZIP ao mesmo repositório conectado ao serviço, incluindo `conteudo-inicial/` e `scripts/iniciar.cjs`. Para controlar quem pode acessar os dados incluídos no código antes da publicação, use um repositório privado. Não envie `.env`, `node_modules` ou bancos.
2. Mantenha **Build Command: `npm ci`** e **Start Command: `npm start`**. O comando de início agora executa o servidor original e, depois que ele estiver ouvindo HTTP, prepara os cadastros pela API.
3. Em **Environment**, configure `CADASTRO_INICIAL=1` e `USUARIO_SENHA` com a senha de Maria, de 12 a 128 caracteres, com letra e número. Mantenha `DONOR_PASSWORD` com a senha atual da ONG. Não precisa informar senha administrativa ao cadastro.
4. A conta da ONG esperada é `ongpotypet@gmail.com`; o usuário comum é `hypestoreoofc@gmail.com`. Em banco novo, defina `DONOR_EMAIL=ongpotypet@gmail.com` e `DONOR_NAME=Associação Poty Amigos dos Bichos`. Em banco existente, o script avisa se o nome for diferente e preserva a conta. Atualizar variáveis de bootstrap não renomeia contas existentes.
5. Execute **Manual Deploy → Deploy latest commit**. Nos logs, aguarde `Carga inicial concluída. Aprovações seguem pelo painel.`. O cadastro não exige executar PowerShell no computador.

Se a instalação exigir confirmação de e-mail para Maria, o servidor continua funcionando e o cadastro informa essa pendência. Confirme pelo link recebido e use **Restart service** para retomar. Se o cadastro falhar por campo, senha, foto ou limite de requisições, ele informa o motivo e não derruba o site.

## O que aparece

O perfil público da ONG é preenchido, os desaparecidos Bolinha e Tigre seguem a publicação normal do servidor, e os cinco anúncios de adoção e duas campanhas ficam aguardando sua análise. Os nomes, textos, fotos e regras são os mesmos já fornecidos. A inclusão no pacote não transforma pendências em publicações aprovadas.

Entre com o administrador no painel para conferir e aprovar. Depois da aprovação, os animais aparecem em `/adotar.html` e as campanhas em `/doacoes.html`. A página da ONG mostra os animais e a campanha da própria ONG; a campanha de Maria não é vinculada a uma organização de terceiros.

O cadastro consulta os itens existentes a cada início, sem duplicá-los, e respeita aprovações, recusas e arquivamentos anteriores. Um banco recriado recebe o conjunto novamente no próximo início, desde que as contas e senhas esperadas estejam configuradas. Não existe marcador externo de conclusão.

Para interromper futuras importações, defina `CADASTRO_INICIAL=0`. A retirada dos cadastros já existentes continua sendo feita pelos painéis, conforme o [guia do cadastro](CADASTRO-INICIAL.md).

## Armazenamento no plano gratuito

Com `DATABASE_DRIVER=turso`, contas, fotos, aprovações, campanhas e históricos ficam no banco externo. A pasta local é apenas temporária; não é necessário montar `/var/data`.

O erro `EACCES: permission denied, mkdir '/var/data/appet'` veio da configuração anterior de SQLite local sem disco montado. O caminho gratuito está no novo guia. Se optar por `DATABASE_DRIVER=sqlite`, o modo de produção continua exigindo armazenamento persistente fora do código e de pastas temporárias.

O servidor foi adaptado para esses provedores após sua autorização. Nenhum dado foi aprovado automaticamente ou credencial embutida. Confirmação de e-mail, validações, sessões e análise administrativa continuam obrigatórias.
