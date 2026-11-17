# Contas do PotyPet — 17/11/2026

| Uso | E-mail |
| --- | --- |
| Administrador e remetente dos e-mails | `potypett@gmail.com` |
| ONG | `ongpotypet@gmail.com` |
| Usuário comum | `hypestoreoofc@gmail.com` |

No Render, abra o serviço **POTYPETt → Environment** e confira estes valores prontos:

| Key | Value |
| --- | --- |
| `ADMIN_EMAIL` | `potypett@gmail.com` |
| `MAIL_FROM` | `potypett@gmail.com` |
| `DONOR_EMAIL` | `ongpotypet@gmail.com` |

O endereço do usuário comum está em `conteudo-inicial/dados.json`. Não é necessário criar uma variável de e-mail do usuário.

Defina as senhas diretamente no Render:

- `ADMIN_PASSWORD`: senha do administrador do PotyPet.
- `DONOR_PASSWORD`: senha da ONG no PotyPet.
- `USUARIO_SENHA`: senha do usuário comum no PotyPet. Escolha uma com 12 a 128 caracteres, letras e números. Uma senha só com letras interrompe o cadastro inicial antes de qualquer criação.

Use senhas exclusivas para o site. O Google autoriza o script pela própria tela de login; a senha do Gmail não é usada como variável do site. O pacote não contém senhas ou tokens reais.

Envie os arquivos extraídos deste novo ZIP ao mesmo repositório do GitHub. Atualize os e-mails em Environment no serviço existente: o `render.yaml` não altera sozinho um serviço criado manualmente. Os nomes, fotos, descrições e regras de aprovação dos cadastros foram mantidos.

Se o banco já tiver contas criadas com outros endereços, alterar variáveis de ambiente não renomeia essas contas. Preserve-as. Para usar a nova ONG nesse caso, cadastre-a pela página de registro, confirme seu e-mail e aprove a conta pelo painel administrativo antes de retomar o cadastro inicial. O importador não cria ou aprova uma ONG por conta própria.

A configuração do envio Google ainda precisa ser concluída conforme [RENDER-GRATUITO.md](docs/guias/RENDER-GRATUITO.md). Depois confirme o cadastro do usuário em `hypestoreoofc@gmail.com` e reinicie o serviço para retomar as postagens. Os cinco anúncios de adoção e as duas campanhas continuam aguardando análise administrativa.
