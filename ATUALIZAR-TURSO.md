# Correção da inicialização com Turso — 17/11/2026

O deploy falhava na chamada `db.exec('PRAGMA optimize;')`, na inicialização do servidor. Essa é uma manutenção opcional do SQLite local. O servidor atualizado só executa essa chamada no modo local; no modo Turso, segue a inicialização sem essa manutenção.

As validações, transações, permissões, confirmação de e-mail e aprovações do projeto foram preservadas. Esta correção não altera senhas, contas ou postagens.

## Atualizar o serviço existente

1. Abra a raiz do mesmo repositório e da mesma branch conectados ao serviço **POTYPETt** no Render.
2. Substitua **`server.js`** pelo arquivo `server.js` deste pacote. Para esta correção de produção, basta substituir esse arquivo. Os outros arquivos atualizados são documentação e testes.
3. Salve as alterações em um novo commit no GitHub.
4. No Render, use **Manual Deploy → Deploy latest commit**.
5. Confira que o novo deploy usa o commit que contém essa correção. Aguarde **Live** e verifique `/api/health`.

Mantenha as variáveis de ambiente que já configurou. O banco permanece no Turso e o envio permanece no script Google já autorizado.

Depois que o site iniciar, conclua a confirmação do usuário comum pelo e-mail recebido, caso o cadastro inicial fique aguardando essa etapa. Reinicie o serviço para retomar a carga, e revise animais e campanhas pelo painel administrativo.

## Verificação da correção

Foi acrescentada ao ambiente de teste HTTP a recusa a comandos de manutenção de banco local. A versão anterior reproduziu a mesma falha da linha 839. A versão corrigida deve iniciar nesse ambiente e preservar os testes de cadastro, aprovação manual, fotos, reinício e persistência.

O resultado da suíte executada está no registro de testes entregue junto ao pacote. A validação no Render é concluída depois de publicar o novo commit e observar o serviço funcionando.

## Gravações e prints para o TCC

Siga o [roteiro de gravações e prints](docs/guias/ROTEIRO-TCC.md) após o serviço ficar Live. O roteiro inclui a apresentação funcional, sugestões de figuras, confirmação real de e-mail e uma verificação de persistência com favoritos após reinício.
