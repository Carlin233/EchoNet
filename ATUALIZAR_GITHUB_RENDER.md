# Como atualizar o EchoNet no GitHub e no Render (Windows)

Este ZIP é **uma atualização de código**, não um repositório novo. Ele não inclui dados de usuários, uploads ou arquivos secretos.

## 1. Backup

Antes de qualquer mudança, salve uma cópia do projeto antigo. Se já usa banco persistente, faça **backup do banco e das imagens no Render** antes de um deploy. Não envie esse backup para o GitHub.

## 2. Extrair

Extraia `EchoNet_Stories_Notificacoes.zip` na Área de Trabalho. Localize a pasta `EchoNet_Stories_Notificacoes` e confirme que nela existem `server.js`, `package.json`, `README.md` etc.

## 3. Preparar um clone novo do seu GitHub

No PowerShell:

```powershell
cd "$env:USERPROFILE\Desktop"
git clone https://github.com/Carlin233/EchoNet.git EchoNet_Publicar_Stories
```

Se a pasta `EchoNet_Publicar_Stories` já existir, escolha outro nome para a pasta de clone. **Não** execute `git init`.

## 4. Copiar o código novo por cima do clone

Ainda no PowerShell, caso as duas pastas estejam na Área de Trabalho:

```powershell
robocopy "$env:USERPROFILE\Desktop\EchoNet_Stories_Notificacoes" "$env:USERPROFILE\Desktop\EchoNet_Publicar_Stories" /E /XD .git node_modules /XF .env banco.db database.sqlite
```

O `robocopy` pode exibir códigos de saída entre 0 e 7 mesmo quando a cópia foi realizada com sucesso. Ele **não apaga** outros arquivos do clone por padrão. Se estiver usando outra pasta, adapte os caminhos.

## 5. Conferir e publicar

```powershell
cd "$env:USERPROFILE\Desktop\EchoNet_Publicar_Stories"
git status
git add -A
git diff --cached --name-only
```

Revise a lista antes do commit. **NUNCA publique** arquivos `.env`, chaves, `node_modules/`, `database.sqlite`, `banco.db` ou imagens de pessoas em `public/uploads/`.

Quando estiver tudo correto:

```powershell
git commit -m "Adicionar Stories e notificacoes em tempo real"
git push origin main
```

Não use `git push --force`. Se o Git disser que o remote mudou, primeiro faça `git pull --ff-only origin main`, resolva a situação com segurança e tente novamente.

## 6. Render

Se o serviço Render estiver conectado à branch `main` e com auto-deploy ativo, ele deve iniciar um novo deploy após o push. Caso contrário, abra o Dashboard do Render e inicie um deploy do commit mais recente.

Verifique em **Environment**:

- `SESSION_SECRET`: chave secreta forte com 32+ caracteres (a que você já configurou, não substitua sem necessidade).
- `NODE_ENV`: `production`.
- `TRUST_PROXY`: `1` para conexão HTTPS por proxy.
- `DB_PATH` e `UPLOAD_DIR`: configure apenas se você preparou armazenamento **persistente** e migrou os dados antigos. Não altere isso às cegas.

Em **Logs**, verifique se o servidor inicializou. Teste o cadastro/login, publique um Story com duas contas, visualize-o, curta um post e confira o aviso no sino da outra conta. Para testar atualização imediata, mantenha o EchoNet aberto em dois navegadores/logins diferentes.

## Aviso importante para serviços gratuitos

O Render gratuito **não oferece disco persistente** para web services. SQLite, contas e uploads locais podem desaparecer a cada redeploy/reinicialização ou suspensão. Não use essa configuração para armazenar contas e conteúdos importantes de pessoas. Para uso durável, migre para um banco persistente como PostgreSQL e um serviço próprio de arquivos, ou use serviço pago com disco persistente e backups.
