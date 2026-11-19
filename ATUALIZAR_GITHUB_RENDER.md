# Atualizar EchoNet responsivo no GitHub e Render (Windows)

Este ZIP é **uma atualização de código e layout**, não um repositório novo. Não altera o banco de dados. Ele não inclui dados de usuários, uploads ou arquivos secretos.

## 1. Backup

Antes de qualquer mudança, salve uma cópia do projeto antigo. Se já usa banco persistente, faça **backup do banco e das imagens no Render** antes de um deploy. Não envie esse backup para o GitHub.

## 2. Extrair

Extraia `EchoNet_Mobile_Otimizado.zip` na Área de Trabalho. Localize a pasta `EchoNet_Mobile_Otimizado` e confirme que nela existem `server.js`, `package.json`, `README.md` etc.

## 3. Preparar um clone novo do seu GitHub

No PowerShell:

```powershell
cd "$env:USERPROFILE\Desktop"
git clone https://github.com/Carlin233/EchoNet.git EchoNet_Publicar_Mobile
```

Se a pasta `EchoNet_Publicar_Mobile` já existir, escolha outro nome para a pasta de clone. **Não** execute `git init`.

## 4. Copiar o código novo por cima do clone

Ainda no PowerShell, caso as duas pastas estejam na Área de Trabalho:

```powershell
robocopy "$env:USERPROFILE\Desktop\EchoNet_Mobile_Otimizado" "$env:USERPROFILE\Desktop\EchoNet_Publicar_Mobile" /E /XD .git node_modules /XF .env banco.db database.sqlite
```

O `robocopy` pode exibir códigos de saída entre 0 e 7 mesmo quando a cópia foi realizada com sucesso. Ele **não apaga** outros arquivos do clone por padrão. Atenção: se houver arquivos antigos que devem ser removidos, verifique-os manualmente antes de publicar. Se estiver usando outra pasta, adapte os caminhos.

## 5. Conferir e publicar

```powershell
cd "$env:USERPROFILE\Desktop\EchoNet_Publicar_Mobile"
git status
git add -A
git diff --cached --name-only
```

Revise a lista antes do commit. **NUNCA publique** arquivos `.env`, chaves, `node_modules/`, `database.sqlite`, `banco.db` ou imagens de pessoas em `public/uploads/`.

Quando estiver tudo correto:

```powershell
git commit -m "Otimizar layout do EchoNet para celulares"
git push origin main
```

Não use `git push --force`. Se o Git disser que o remoto mudou, não use `--force`. Confira `git status` e atualize a cópia com segurança; se houver alterações locais ou conflitos, resolva-os antes de enviar.

## 6. Render

Se o serviço Render estiver conectado à branch `main` e com auto-deploy ativo, ele deve iniciar um novo deploy após o push. Caso contrário, abra o Dashboard do Render e inicie um deploy do commit mais recente.

Verifique em **Environment**:

- `SESSION_SECRET`: chave secreta forte com 32+ caracteres (a que você já configurou, não substitua sem necessidade).
- `NODE_ENV`: `production`.
- `TRUST_PROXY`: `1` para conexão HTTPS por proxy.
- `DB_PATH` e `UPLOAD_DIR`: configure apenas se você preparou armazenamento **persistente** e migrou os dados antigos. Não altere isso às cegas.

Em **Logs**, verifique se o servidor inicializou. Teste o cadastro/login, teste o login e, no celular, confira o feed com fotos em proporções diferentes, o perfil, os Stories, a sineta de notificações e o chat com o teclado virtual aberto. Para testar as notificações em tempo real, mantenha o EchoNet aberto em dois navegadores/logins diferentes. Se o CSS antigo persistir após o deploy, faça uma atualização completa no navegador e abra a página em uma guia anônima.

## Aviso importante para serviços gratuitos

O Render gratuito **não oferece disco persistente** para web services. SQLite, contas e uploads locais podem desaparecer a cada redeploy/reinicialização ou suspensão. Não use essa configuração para armazenar contas e conteúdos importantes de pessoas. Para uso durável, migre para um banco persistente como PostgreSQL e um serviço próprio de arquivos, ou use serviço pago com disco persistente e backups.
