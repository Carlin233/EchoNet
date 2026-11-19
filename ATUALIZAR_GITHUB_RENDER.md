# Publicar persistência sem apagar contas

**Primeiro leia o [README.md](README.md). Não faça push do ZIP no Render antes de configurar o armazenamento permanente e cuidar dos dados existentes.**

1. Escolha a configuração de banco:
   - Render Free: Turso + Cloudinary, com as chaves **apenas** em Environment.
   - Render pago: Persistent Disk montado em `/var/data` e variável `PERSISTENT_DATA_DIR=/var/data`.
2. Faça backup de `database.sqlite` e **de todas as imagens de uploads**, se ainda existirem em algum lugar. Sem cópia, a migração dos dados atuais pode ser impossível.
3. Para Turso, caso possua backup, execute o script de importação do README **antes** de mudar o serviço para o banco novo.
4. Em **Render → Settings**, confirme `Build Command = npm install` (esta edição adiciona pacotes e não inclui `package-lock.json`). Em **Render → Environment**, configure as variáveis da opção escolhida; preserve `SESSION_SECRET` e `TRUST_PROXY=1`.
5. Clone o repositório em uma pasta nova, ou atualize um clone limpo:

```powershell
git clone https://github.com/Carlin233/EchoNet.git EchoNet_Publicar
cd EchoNet_Publicar
```

6. Copie **o conteúdo extraído** da pasta `EchoNet_Persistencia_Permanente` para `EchoNet_Publicar`, substituindo os arquivos correspondentes. **Não copie o banco `.sqlite`, pastas uploads nem secrets**.
7. Na pasta do repositório, execute `npm install` para atualizar o `package-lock.json` com as novas dependências. Depois confira o resultado:

```powershell
git status
git add -A
git diff --cached --name-only
```

8. Certifique-se de que não existem `database.sqlite`, `banco.db`, `.env`, tokens ou fotos privadas entre arquivos adicionados. Então:

```powershell
git commit -m "Persistencia de contas posts e imagens"
git push origin main
```

9. Espere o Render concluir o deploy, depois teste criação de conta, login, publicação, foto de perfil e novo deploy.

**Não force o push. Não apague ou troque o antigo banco antes de possuir backup verificado.**
