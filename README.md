# EchoNet — Supabase PostgreSQL + Storage

Rede social Node.js/Express/EJS adaptada para que **contas, publicações, mensagens, comentários, seguidores, notificações e imagens sobrevivam aos deploys no Render**. Mantém o feed, Stories de 24 horas, chat, notificações SSE e interface para celular.

## O que mudou

- `DATABASE_URL` ativa o PostgreSQL remoto. Não usa banco SQLite temporário no Render.
- `SUPABASE_URL` + `SUPABASE_SECRET_KEY` enviam fotos de perfil, posts e Stories ao **Supabase Storage**, em vez de salvá-las apenas no disco do Render.
- `db/supabase-schema.sql` define as tabelas e ativa Row Level Security (RLS), sem políticas públicas. **As páginas acessam o banco pelo servidor Express autenticado, não pela API pública do Supabase**.
- `scripts/migrar-sqlite-para-supabase.js` simula a transferência de um backup SQLite e, apenas com `--execute`, migra dados e imagens. Não publica nem inclui o banco original.
- Quando `DATABASE_URL` não está definida, o desenvolvimento local continua utilizando SQLite; a opção Turso/Cloudinary legada também foi preservada.

## MUITO IMPORTANTE: não faça deploy antes da migração

Seu `Atualizada.rar` incluía arquivos `database.sqlite`, `database.sqlite-wal`, `database.sqlite-shm` e imagens enviados por usuários. **Por privacidade, esses arquivos estão fora do ZIP entregue.** O backup do RAR é apenas uma cópia de um momento: confirme se é o estado mais recente do EchoNet. Se usuários publicaram depois desse backup, as postagens mais novas não estarão nele. Não apague seu serviço Render atual até validar o conteúdo do Supabase.

Siga **[MIGRAR_COM_SEGURANCA.md](MIGRAR_COM_SEGURANCA.md)**. Um resumo:

1. Salve um backup **consistente** do banco SQLite original e da pasta `public/uploads`, incluindo o WAL enquanto o app estiver fechado, se houver. Para um sistema ativo no Render gratuito, backups anteriores talvez não contenham dados recentes.
2. No projeto Supabase, crie em **Storage** o bucket `echonet-media`, configurado como **Public**. Isso permite exibir as imagens da rede social por links diretos; os arquivos do bucket são acessíveis a quem tiver o URL.
3. Vá a **Project Settings > API Keys** e copie a **Secret key** do servidor (`sb_secret_...`). Nunca a coloque em HTML, JS público ou GitHub.
4. Em **Connect > Session pooler > URI**, pegue a conexão PostgreSQL para `DATABASE_URL` (porta 5432). A senha no endereço deve ser codificada se contiver caracteres especiais.
5. No computador, faça a simulação da migração; confirme que não faltam imagens. Depois, com um Supabase vazio e a aplicação antiga sem novas gravações, rode a migração real.
6. Só após validar os dados, configure no Render: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=echonet-media`, `REQUIRE_PERSISTENCE=1`, mantendo `SESSION_SECRET` e `TRUST_PROXY=1`.
7. Publique a versão no GitHub, acione o deploy, e teste login, feed, perfil, chat, Stories, e notificações com o novo banco. Não limpe seus backups até ter validado tudo.

### Atenção às contas e sessões

As contas e senhas com hash bcrypt são migradas do SQLite. O Supabase Auth não substitui automaticamente a autenticação atual do EchoNet: o login continua no Express. A sessão de navegador pode encerrar após um deploy porque o Express ainda usa sessão na memória; **isso não significa que a conta foi apagada**, basta entrar novamente. Para preservar a sessão entre reinicializações, um armazenamento de sessões no PostgreSQL será uma melhoria posterior.

### Requisitos

- Node.js 20 ou superior.
- PostgreSQL com `pg` e Supabase Storage com `@supabase/supabase-js` (dependências declaradas no `package.json`).
- `npm install` gera um `package-lock.json` novo; o lock anterior foi removido por estar incompleto e não incluir as dependências de Supabase.

### Rodar localmente (SQLite)

```powershell
npm install
npm test
npm start
```

Abra `http://localhost:3000`. Sem `DATABASE_URL`, continua usando SQLite local.

### Testes disponíveis

- `node test/postgres-sql.js`: verifica a conversão de comandos legados SQLite para a sintaxe PostgreSQL (não requer conexão remota).
- `npm test`: também executa os testes de integração locais sobre SQLite.

**Limitação:** testes de conexão, migração e uploads reais no Supabase dependem das suas credenciais e do seu ambiente. Não foram executados com sua conta, e o banco remoto não foi modificado por esta entrega.
