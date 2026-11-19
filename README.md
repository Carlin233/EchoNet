# EchoNet — Stories e notificações em tempo real

**Versão atualizada do EchoNet com fotos de perfil**, agora com Stories de 24 horas e notificações em tempo real no site. Projeto Node.js 20+, Express, EJS e SQLite. O layout, cadastro, login, publicações, comentários, perfil, seguidores e mensagens anteriores foram mantidos.

## Novidades

### Stories

- Criar Story de imagem JPG, PNG, WebP ou GIF com até **5 MB** e legenda opcional de até **200 caracteres**.
- Stories expiram automaticamente **24 horas** após a publicação. O servidor remove periodicamente os registros e arquivos expirados.
- Círculos na parte superior do feed: clicar para assistir; usar setas para avançar e voltar; fechar com Esc; avanço automático a cada 6 segundos.
- O autor pode excluir seus Stories e consultar o número de visualizações. Cada espectador conta apenas uma vez, e o próprio autor não conta.
- Máximo de 20 Stories ativos por usuário para limitar abuso.
- As imagens ficam em `public/uploads/stories/` por padrão. O banco guarda seus metadados; os arquivos **não** são incluídos no repositório Git.

### Notificações em tempo real

- Sineta com contador de avisos não lidos no menu (desktop e celular).
- Avisos de **curtida, comentário, novo seguidor e mensagem recebida**.
- Os avisos são privados, persistidos no SQLite, abrem a página relacionada e podem ser marcados como lidos individualmente ou todos de uma vez.
- Atualização automática via **Server-Sent Events (SSE)** com reconexão do navegador; consulta de segurança a cada 45 segundos quando a página está visível.
- **Atenção:** são notificações **dentro do EchoNet com a página aberta**. Não são notificações push do celular com o navegador fechado. A conexão SSE da versão atual foi projetada para **uma instância do servidor**. Para múltiplas instâncias, o sinal em tempo real deve usar Redis/pub-sub ou infraestrutura compartilhada.

## Iniciar no computador

```bash
npm ci
npm start
```

Acesse `http://localhost:3000`. Para testes: `npm test`.

**Recomendado:** Node.js 22 LTS. Se o `sqlite3` não tiver binário pré-compilado para o seu sistema, a instalação pode precisar compilar componentes nativos.

O servidor cria as tabelas `stories`, `story_views` e `notifications` automaticamente, **sem apagar suas tabelas antigas**. Faça backup do `database.sqlite` e das imagens antes de implantar.

## Atualizar GitHub e Render

Siga o arquivo [ATUALIZAR_GITHUB_RENDER.md](ATUALIZAR_GITHUB_RENDER.md). Use um clone atualizado do seu repositório em vez de `git init` ou `git push --force`.

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `SESSION_SECRET` | Obrigatória em produção. Chave aleatória com pelo menos 32 caracteres. Nunca publicar. |
| `NODE_ENV` | `production` em produção. |
| `TRUST_PROXY` | `1` atrás do proxy HTTPS confiável do Render. |
| `DB_PATH` | Opcional. Local do banco SQLite; padrão: `./database.sqlite`. |
| `UPLOAD_DIR` | Opcional. Pasta de uploads; padrão: `./public/uploads`. |
| `PORT` | Definida automaticamente pelo Render. |

### Muito importante: dados persistentes no Render

**Este EchoNet ainda usa SQLite e imagens salvas no disco.** O armazenamento de arquivos do Render é temporário por padrão. No plano grátis, banco SQLite, usuários, mensagens, Stories e imagens enviados após o deploy podem desaparecer em reinicializações, suspensão ou novos deploys. Um serviço pago com disco persistente ou a migração para banco e armazenamento externos é necessária para manter tudo com segurança.

Se o serviço tiver um **disco persistente pago** montado em `/var/data`, configure:

```
DB_PATH=/var/data/database.sqlite
UPLOAD_DIR=/var/data/uploads
```

**Não mude essas variáveis se já existem contas ou fotos no ambiente sem migrar antes o banco e os uploads para o disco.** O disco não faz cópia automática dos dados existentes. O `UPLOAD_DIR` fora da pasta de código é servido pela aplicação em `/uploads`. Se o aplicativo estiver no plano gratuito, não configure caminhos persistentes inexistentes e não considere o armazenamento local durável.

As sessões ainda usam `express-session` com armazenamento em memória; em um ambiente de produção com continuidade de sessão, substitua por um store persistente. Em novas implantações, usuários podem precisar realizar login novamente.

## Segurança e limitações

- Uploads verificam extensão/tipo e assinatura básica do arquivo, com nomes aleatórios. **Não é uma auditoria de segurança completa**; moderação de conteúdo, antivírus/decodificação de imagens e prevenção de abuso precisam ser avaliados antes de um serviço público grande.
- CSRF e autenticação são exigidos nas ações de escrita, inclusive visualizações, exclusões e marcação de notificações.
- O projeto não inclui bancos de dados reais, segredos, imagens de usuários nem `node_modules`.
- Recuperação de senha por e-mail continua exigindo um provedor externo para produção.
- Reels e Stories em vídeo ainda **não** foram implementados nesta versão.

## Principais arquivos modificados

- `server.js`: tabelas, Stories, SSE, notificações e caminho de uploads configurável.
- `views/index.ejs`, `views/partials/stories.ejs`, `views/partials/notifications.ejs`, `views/partials/sidebar.ejs`.
- `public/js/stories.js`, `public/js/notifications.js`, `public/css/stories-notifications.css`.
- `test/integration.js`: testes de visualizações, expiração, upload, autorização, notificações e SSE.
