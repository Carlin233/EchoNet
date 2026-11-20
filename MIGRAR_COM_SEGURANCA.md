# Passo a passo: EchoNet do SQLite para Supabase sem perder contas

**NÃ£o publique o novo ZIP no GitHub/Render antes de concluir a migraÃ§Ã£o.** Seu Render atual pode perder arquivos temporÃ¡rios a cada novo deploy. A configuraÃ§Ã£o de um banco novo **nÃ£o importa os usuÃ¡rios automaticamente**.

## 1. FaÃ§a backup privado da versÃ£o atual

- Guarde uma cÃ³pia local do RAR original e da pasta que estiver usando no computador.
- Se possÃ­vel, obtenha um backup do banco SQLite **atualmente usado no Render** antes da troca. Uma cÃ³pia antiga sÃ³ tem os dados que existiam na data em que foi feita.
- Copie `database.sqlite`, `database.sqlite-wal` e `database.sqlite-shm` para a **mesma pasta**. NÃ£o copie apenas o `database.sqlite` se as alteraÃ§Ãµes mais recentes estiverem no WAL. De preferÃªncia faÃ§a um snapshot/backup com o serviÃ§o parado.
- Copie tambÃ©m `public/uploads/` com as subpastas `avatars/` e `stories/`.
- **NÃ£o envie banco, WAL, imagens de terceiros, `.env` ou chaves ao GitHub.** O `.gitignore` jÃ¡ bloqueia esses arquivos.

## 2. Configure um Supabase vazio

No seu projeto **Echo Net** do Supabase:

1. No menu **Storage**, escolha **New bucket** e crie o bucket chamado `echonet-media`.
2. Marque **Public bucket**. Imagens publicadas tÃªm URLs pÃºblicas, como jÃ¡ acontecia quando eram postadas em hospedagem pÃºblica. NÃ£o coloque arquivos particulares nesse bucket.
3. VÃ¡ a **Project Settings â†’ API Keys**, copie a **Secret key** (`sb_secret_...`). Ela ficarÃ¡ **somente no servidor**. NÃ£o use a chave publicÃ¡vel para o upload administrativo.
4. Em **Connect â†’ Direct â†’ Method: Session pooler â†’ Type: URI**, copie a URI `postgresql://...:5432/postgres`. Substitua `[YOUR-PASSWORD]` pela senha criada para o banco. A senha deve ter caracteres especiais codificados em URL; nÃ£o envie essa URI a ninguÃ©m.
5. Guarde o endereÃ§o do seu projeto Supabase (`https://...supabase.co`).

Na primeira execuÃ§Ã£o, o adaptador do EchoNet cria as tabelas com Row Level Security ativada. **NÃ£o Ã© necessÃ¡rio colar SQL no SQL Editor para essa versÃ£o.** Se precisar revisar, veja `db/supabase-schema.sql`.

## 3. Preparar o computador Windows

Extraia `EchoNet_Supabase_Adaptado.zip` numa pasta nova e entre nela pelo PowerShell, sem misturar com a pasta Git anterior:

```powershell
cd "$env:USERPROFILE\Desktop\EchoNet_Supabase_Adaptado"
npm install
```

Crie um arquivo `.env` **local e privado** na pasta do projeto, com:

```dotenv
DATABASE_URL=postgresql://postgres.PROJETO:SENHA-CODIFICADA@SEU-POOLER:5432/postgres
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=SUA_CHAVE_SECRETA_AQUI
SUPABASE_STORAGE_BUCKET=echonet-media
```

Esses sÃ£o exemplos fictÃ­cios; substitua pelos valores reais **sem compartilhar a tela mostrando o segredo**. NÃ£o adicione `.env` ao Git.

## 4. Simular a migraÃ§Ã£o: nÃ£o escreve nada na nuvem

Com o backup do seu SQLite no computador, execute um comando como este, ajustando os caminhos para onde vocÃª extraiu o RAR:

```powershell
node scripts/migrar-sqlite-para-supabase.js "C:\CAMINHO\PARA\database.sqlite" "C:\CAMINHO\PARA\public\uploads"
```

O comando mostra sÃ³ a contagem de contas, publicaÃ§Ãµes e imagens; **nÃ£o envia nem altera nada**. Se disser que falta imagem ou que o banco nÃ£o contÃ©m contas, verifique o backup antes de continuar.

## 5. Executar a migraÃ§Ã£o (somente apÃ³s confirmar o backup)

**Pare novas postagens e cadastros no sistema antigo**, ou eles nÃ£o estarÃ£o no snapshot que serÃ¡ migrado. Confirme que o Supabase estÃ¡ vazio e que o Storage estÃ¡ configurado.

Com o `.env` criado, em Node 20+ use:

```powershell
node --env-file=.env scripts/migrar-sqlite-para-supabase.js "C:\CAMINHO\PARA\database.sqlite" "C:\CAMINHO\PARA\public\uploads" --execute
```

O script verifica que o Supabase estÃ¡ vazio, transfere arquivos ao Storage, importa as linhas preservando IDs, atualiza as sequÃªncias e usa uma **transaÃ§Ã£o PostgreSQL**. Em caso de erro, cancela as alteraÃ§Ãµes do banco e tenta limpar os arquivos que acabou de enviar.

**NÃ£o execute duas vezes no mesmo banco**. Se um deploy anterior ou teste gravou contas nesse banco, a migraÃ§Ã£o Ã© interrompida para nÃ£o mesclar registros.

### Confira as contagens importadas (somente leitura)

```powershell
node --env-file=.env scripts/verificar-supabase.js
```

Compare as contagens com as da simulaÃ§Ã£o do SQLite. O comando lÃª os totais e verifica o bucket sem modificar registros.

## 6. Configurar as variÃ¡veis no Render

Seu Render: **EchoNet â†’ Environment â†’ Edit**.

| VariÃ¡vel | Valor |
|---|---|
| `DATABASE_URL` | URI de **Session pooler**, incluindo senha privada |
| `SUPABASE_URL` | URL HTTPS do seu projeto |
| `SUPABASE_SECRET_KEY` | Chave **Secret** privada |
| `SUPABASE_STORAGE_BUCKET` | `echonet-media` |
| `REQUIRE_PERSISTENCE` | `1` |
| `TRUST_PROXY` | `1` (manter) |
| `SESSION_SECRET` | MANTER a chave atual; nÃ£o trocar |

Se houver variÃ¡veis `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` antigas, remova-as **somente depois que confirmar a migraÃ§Ã£o ao Supabase**, para nÃ£o ter dois bancos configurados em conflito.

## 7. Atualizar o GitHub e publicar

**Somente depois de migrar e verificar:** copie o cÃ³digo de `EchoNet_Supabase_Adaptado` para um clone atualizado do seu repositÃ³rio `Carlin233/EchoNet`, preservando `.git`, e sem copiar `.env`, bancos nem fotos privadas.

No PowerShell, dentro do clone:

```powershell
git status
git add -A
git diff --cached --name-only
git commit -m "Migrar EchoNet para Supabase PostgreSQL e Storage"
git push origin main
```

Confirme que `database.sqlite`, `.env`, `public/uploads/` e `*.db` **nÃ£o aparecem como novos arquivos adicionados**. O Render, conectado ao GitHub, poderÃ¡ fazer um novo deploy. Confira tambÃ©m se o comando de instalaÃ§Ã£o no Render Ã© `npm install` (nÃ£o `npm ci` enquanto o lock novo nÃ£o estiver gerado).

## 8. Valide antes de considerar concluÃ­do

- Consegue fazer login com as contas antigas?
- A contagem de postagens, comentÃ¡rios, mensagens e seguidores bate com o backup?
- As fotos aparecem no perfil, feed e Stories?
- Depois de um deploy de teste, as mesmas contas e publicaÃ§Ãµes continuam presentes?

**AtenÃ§Ã£o:** pÃ¡ginas carregadas em abas antigas podem precisar de atualizaÃ§Ã£o; alguns usuÃ¡rios precisarÃ£o entrar novamente porque as sessÃµes atuais sÃ£o mantidas em memÃ³ria. NÃ£o recrie contas antigas para "recuperÃ¡-las" sem antes confirmar se os dados foram migrados.

## ObservaÃ§Ãµes

- No Render gratuito, SQLite e imagens locais nÃ£o sÃ£o persistentes; a soluÃ§Ã£o proposta evita usar esse disco temporÃ¡rio para esses dados em produÃ§Ã£o.
- Supabase gratuito tem limites e pode pausar projetos inativos. Persistente nÃ£o significa backup ilimitado; faÃ§a backups regulares e acompanhe limites.
- NÃ£o foi feita nenhuma alteraÃ§Ã£o na sua conta Supabase ou no Render automaticamente. Esta entrega inclui o cÃ³digo e as ferramentas para completar a migraÃ§Ã£o.

