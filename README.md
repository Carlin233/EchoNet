# EchoNet — contas e publicações persistentes

Esta versão mantém o EchoNet Mobile, Stories, notificações, feed, perfis e chat. Foram incluídas **duas opções** de persistência, sem depender do diretório temporário de deploy:

1. **Render Free — Turso + Cloudinary**: dados relacionais (contas, senhas criptografadas, posts, curtidas, comentários, mensagens, seguidores, notificações e Stories) em banco remoto **Turso/libSQL**, imagens no **Cloudinary**. As contas e imagens não são apagadas quando o Render reinicia. Cada serviço tem limites de uso; mantenha backups periódicos.
2. **Render pago — Persistent Disk**: mantenha SQLite e uploads locais, porém em disco persistente montado em `/var/data` (ou no caminho efetivamente montado no painel). Mais simples, mas **não disponível no Render gratuito**.

**O EchoNet ainda usa cookies e sessões temporárias no processo. Após um deploy, um usuário pode precisar fazer login novamente; isso não significa que a conta foi apagada.**

## Regra principal antes de publicar

**NÃO faça deploy se ainda houver contas/fotos no Render temporário que você não possui em backup.** Esta versão não recupera dados apagados anteriormente, nem move dados automaticamente de um Render Free em execução para o Turso. Migrar para banco novo vazio sem importar o antigo faria contas existentes desaparecerem da nova instalação. Guarde e migre uma cópia confiável do `database.sqlite` **e** da pasta `public/uploads` antes de virar o novo banco.

## A. Configuração no Render Free (Turso + Cloudinary)

1. Crie um banco libSQL no [Turso](https://turso.tech/) e obtenha sua URL de conexão (`libsql://...`) e token de autenticação.
2. Crie uma conta [Cloudinary](https://cloudinary.com/) e obtenha as credenciais da API. O SDK usa `CLOUDINARY_URL` no formato `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.
3. **Antes de publicar** a atualização, adicione estas variáveis na seção **Environment** do seu serviço Render:

   | KEY | VALUE |
   | --- | --- |
   | `TURSO_DATABASE_URL` | URL privada do banco Turso |
   | `TURSO_AUTH_TOKEN` | Token do banco Turso (segredo) |
   | `CLOUDINARY_URL` | Credencial Cloudinary (segredo) |
   | `REQUIRE_PERSISTENCE` | `1` |

4. Mantenha `SESSION_SECRET` e `TRUST_PROXY=1` já configurados. Não escreva tokens ou senhas no código ou no GitHub.
5. Se houver backup local de contas antigas, migre **antes de conectar usuários ao novo banco** com o script abaixo. A cópia de origem precisa conter imagens originais e o banco SQLite correspondente.
6. No Render, confirme que o **Build Command** é `npm install` (não `npm ci`, pois esta edição usa dependências novas sem um `package-lock.json` atualizado). Faça o upload do projeto atualizado ao GitHub e inicie o deploy. Em **Logs**, confirme que não há erros de banco, dependências ou Cloudinary.
7. Execute `npm install` também no clone local antes de preparar o commit para atualizar o `package-lock.json`, então teste cadastrar uma conta, criar um post, enviar foto, fazer login, depois realizar um novo deploy e conferir se os dados continuam. Guarde backups periódicos fora do provedor.

### Migração opcional de um backup local

No computador que contém o backup, extraia o projeto, execute `npm install` e configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `CLOUDINARY_URL` **somente no terminal local**. Em seguida:

```powershell
node scripts/importar-backup-para-turso.js "C:\backups\database.sqlite" "C:\backups\uploads"
```

O destino Turso deve estar **vazio**. O script interrompe a operação se faltar qualquer arquivo referenciado pelas publicações/avatares/Stories. Evite repetir uma importação parcial; confira os registros do provedor antes de tentar de novo.

> No Render Free, uma cópia dos arquivos criados dentro do serviço pode não estar mais disponível após um reinício. Se não houver backup, não é possível prometer recuperar contas já perdidas.

## B. Configuração no Render pago (Persistent Disk)

1. Em **Render → EchoNet → Disk**, adicione um Persistent Disk e monte em `/var/data` (exemplo, use o caminho configurado no Render).
2. Em **Environment**, adicione `PERSISTENT_DATA_DIR` com valor `/var/data` e `REQUIRE_PERSISTENCE=1`. Mantenha `SESSION_SECRET` e `TRUST_PROXY=1`.
3. O EchoNet passará a gravar `database.sqlite` em `/var/data/database.sqlite` e uploads em `/var/data/uploads`.
4. **Atenção:** o Render **não transfere automaticamente** o `database.sqlite` e imagens anteriores para o disco novo. Preserve ou migre os dados antes de alterar a configuração. A simples instalação do disco não recupera o que já foi apagado.
5. Não compartilhe o disco com vários serviços; faça backups periódicos. Persistent Disk desativa deploy sem interrupção (zero-downtime).

## Desenvolvimento local

Sem as variáveis de nuvem, o comportamento permanece igual ao anterior, com SQLite local e arquivos em `public/uploads`:

```bash
npm install
npm test
npm start
```

O GitHub **não** é armazenamento para banco de dados de produção ou fotos privadas. Os arquivos `.sqlite`, `.db`, `.env` e `public/uploads` continuam ignorados pelo Git.

## Testes e limitações

- Testes automatizados locais de cadastro/login, feed, fotos, perfil, comentários, Stories, notificações e permissões passaram.
- A integração com **Turso e Cloudinary** exige credenciais próprias; **não foi testada contra contas reais dos provedores** nesta entrega.
- O banco remoto e as imagens na nuvem somente passam a ser persistentes **depois** de configurar as credenciais, migrar os dados existentes, e concluir um deploy bem-sucedido.
- Manter dados entre deploys não substitui backups, planos adequados ao uso, monitoramento e restauração.
