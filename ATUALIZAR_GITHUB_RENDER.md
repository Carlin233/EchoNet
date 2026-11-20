# Atualização do EchoNet no GitHub e Render

**Antes de publicar:** faça a migração do banco SQLite e das imagens para o Supabase, seguindo [MIGRAR_COM_SEGURANCA.md](MIGRAR_COM_SEGURANCA.md). Publicar o código primeiro inicia o projeto com um banco novo e vazio.

Depois da migração:

1. Configure as variáveis secretas `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=echonet-media` e `REQUIRE_PERSISTENCE=1` no Render → EchoNet → Environment. Conserve as variáveis `SESSION_SECRET` e `TRUST_PROXY=1` que já funcionam.
2. Atualize um clone limpo de `https://github.com/Carlin233/EchoNet`, copiando apenas os arquivos de código de `EchoNet_Supabase_Adaptado`. Nunca copie seu arquivo `.env` nem dados de `public/uploads/` para o repositório.
3. No terminal dentro do clone, confira `git status`, `git add -A`, `git diff --cached --name-only`, `git commit -m "EchoNet Supabase PostgreSQL e Storage"`, `git push origin main`.
4. No Render, use `npm install` como comando de build. Esta entrega não inclui lockfile antigo porque ele não declarava as dependências novas. Se desejar gerar um lockfile reproduzível, execute `npm install` localmente com Node 20+ e inclua o `package-lock.json` gerado.
5. Após o deploy, verifique os logs e teste contas antigas, feed, comentários, fotos, chat, Stories e notificações. Repita um deploy de teste apenas depois de validar a persistência dos dados.

Se algo falhar, **não exclua o banco Supabase, não recrie contas nem sobrescreva o backup**. Guarde os logs com credenciais ocultas e faça o diagnóstico antes de tentar novamente.
