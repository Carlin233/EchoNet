# EchoNet — versão otimizada para celular

Esta versão mantém **Stories, notificações em tempo real, fotos de perfil, publicações, chat, login e SQLite** e melhora a interface responsiva. **Nenhuma tabela do banco de dados foi modificada** nesta atualização.

## Melhorias para celulares

- Fotos no feed exibidas em sua proporção natural, sem corte obrigatório para o quadrado. O limite de altura impede que uma única foto ocupe uma tela excessivamente longa.
- Grade do perfil com miniaturas quadradas e controles de arquivar/excluir organizados **abaixo** da miniatura; avatar e estatísticas se adaptam às telas pequenas.
- Ícones SVG incorporados à navegação, aos botões do feed, às abas do perfil, ao chat e aos controles dos Stories; esses botões não desaparecem quando uma biblioteca de ícones de terceiros falha.
- Barra inferior e cabeçalho com áreas de toque adequadas e respeito à área segura (notch/gestos) dos celulares compatíveis.
- Chat responsivo, com conversas sem estouro lateral; campo de envio preso à área visível. O ajuste via `visualViewport` ajuda quando o teclado virtual abre.
- Janelas de criar postagem, editar perfil, Stories e notificações adaptadas à altura disponível, com rolagem interna quando necessário.
- Campos de login, cadastro e recuperação maiores para evitar zoom automático no iPhone.

### Como testar no celular

Teste em um Android e/ou iPhone real, além de navegadores de computador: entre e saia da conta; abra o feed com fotos verticais e horizontais; publique um Story; abra notificações; edite a foto de perfil; abra e feche uma conversa; digite com o teclado na tela e confira se o botão de enviar fica acessível. Faça também o teste de rotação da tela. Diferentes sistemas/teclados podem se comportar de maneira distinta; uma verificação no aparelho real é recomendada.

### Validação já realizada

- Testes de integração existentes: **todos passaram** (`npm test`).
- Verificação de layout renderizado para larguras de **320, 360, 390, 430, 768 e 1024 px**, nas telas de feed, perfil, mensagens e login: sem rolagem horizontal encontrada nas condições testadas.
- Conversa aberta (larguras de 320, 360, 390 e 768 px): formulário visível e separado do cabeçalho, sem sobreposição. Stories e notificações também foram verificados em 320 e 390 px.
- **Não** houve teste em aparelhos físicos ou no serviço Render do usuário. Após publicar, confira no navegador real.

### Arquivos desta etapa

- `public/css/mobile-optimizations.css`: regras responsivas carregadas depois do tema original.
- `views/index.ejs`, `views/perfil.ejs`, `views/mensagens.ejs`, `views/login.html`, `views/resetar-senha.ejs`, `views/partials/sidebar.ejs`, `views/partials/stories.ejs`, `views/partials/notifications.ejs`: componentes móveis e ícones.
- `public/js/feed.js` e `public/js/chat.js`: estados de ícones do feed e ajuste da altura do chat ao teclado virtual.

**Implantação:** siga [ATUALIZAR_GITHUB_RENDER.md](ATUALIZAR_GITHUB_RENDER.md). Preserve suas variáveis `SESSION_SECRET` e `TRUST_PROXY=1` já configuradas no Render. **O projeto continua usando SQLite e uploads locais**: faça backup antes de publicar; o Render gratuito não garante persistência desses arquivos.

---

# Funcionalidades da versão anterior: Stories e notificações em tempo real

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
