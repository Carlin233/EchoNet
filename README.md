# EchoNet — versão otimizada com foto de perfil

Projeto Node.js + Express 5 + EJS + SQLite. Mantém o estilo visual original e transforma interações anteriormente simuladas em funcionalidades persistidas no banco de dados.

## Executar localmente

1. Instale **Node.js 20 ou superior**.
2. Extraia este ZIP, abra um terminal na pasta do projeto e rode `npm ci` (ou `npm install`). **Não copie a pasta `node_modules` do RAR anterior**: ela contém binários compilados para Windows e pode falhar em outro sistema.
3. Configure a variável `SESSION_SECRET` com uma chave aleatória grande se o sistema for acessado por outras pessoas. Em modo de desenvolvimento local, uma chave temporária é usada apenas para facilitar testes.
4. Execute `npm start` e abra `http://localhost:3000`.
5. Execute `npm test` para testar cadastro, login, CSRF, upload de imagens e avatares, curtidas, comentários, salvar, seguir, mensagens, perfil, arquivo e autorização. Os testes criam seu próprio banco SQLite temporário, sem alterar suas contas reais.

### Windows (PowerShell)

```powershell
npm ci
$env:SESSION_SECRET="substitua-por-uma-chave-com-mais-de-32-caracteres"
npm start
```

### Linux/macOS

```bash
npm ci
export SESSION_SECRET="substitua-por-uma-chave-com-mais-de-32-caracteres"
npm start
```

## Usar suas contas e publicações antigas

**Faça um backup do projeto original primeiro.** Com o servidor desligado:

1. Copie seu arquivo `database.sqlite` do projeto original para a pasta desta versão, substituindo o banco criado automaticamente, se houver.
2. Se os arquivos de `public/uploads/` não tiverem sido copiados, transfira essa pasta do projeto anterior para preservar fotos das publicações.
3. Execute `npm start`. O sistema adicionará automaticamente a coluna `avatar` e demais atualizações sem apagar contas, posts e conversas existentes.
4. Caso já tenha usado fotos de perfil nesta versão, preserve também `public/uploads/avatars/` ao migrar de computador.

**ATENÇÃO:** os dados originais (contas, senhas em hash, conversas e tokens) foram intencionalmente **excluídos** deste ZIP para não redistribuir informações pessoais. A pasta de fotos originalmente anexada foi mantida no projeto, mas deve ser armazenada de maneira privada. Links de redefinição de senha antigos deixam de funcionar após a migração, por segurança.

## Funcionalidades implementadas

- Cadastro e login com validação, hash de senha, sessão regenerada e proteção CSRF.
- Feed de fotos com limite de tamanho de upload de 5 MB e validação de tipo.
- Curtir/descurtir, comentar, salvar/remover, compartilhar links (navegador/área de transferência).
- Seguir/deixar de seguir e contadores de seguidores/seguindo.
- Visualizar perfis, editar nome de exibição e biografia.
- **Fotos de perfil:** enviar, substituir e remover imagens JPG, PNG, WebP ou GIF com até **3 MB**. A imagem fica salva no SQLite como um caminho de arquivo e no disco em `public/uploads/avatars/`. Quem não tem foto usa a imagem padrão.
- A foto aparece no perfil (desktop e mobile), no feed, na barra de usuários, nos comentários, nas sugestões e na lista/cabeçalho do chat. As pessoas só podem alterar a própria foto.
- Publicar, arquivar/restaurar e excluir apenas posts próprios.
- Perfil com abas de publicações, salvos e arquivo.
- Mensagens privadas com envio via API, atualização a cada 5 segundos e consulta limitada às conversas do usuário.
- Indicação aproximada de quem está online, com atualização periódica.
- Proteção básica contra excesso de tentativas de login, cadastro e recuperação.

## Como trocar a foto de perfil

1. Entre com sua conta e abra **Perfil**.
2. Clique/toque na foto circular (ícone da câmera) ou em **Editar perfil**.
3. Clique em **Escolher foto**, selecione uma imagem de até 3 MB e confira a prévia.
4. Clique em **Salvar foto**. A página atualiza com sua nova imagem.
5. Para voltar à foto padrão, abra o mesmo menu e clique em **Remover foto atual**.

**Atenção:** não use o formulário de "Nova foto"/"Criar publicação" para atualizar o avatar; aquele é para os posts. Faça backup do banco SQLite **e** da pasta `public/uploads/` para preservar todas as imagens na migração. Não envie arquivos desconhecidos.

## Limitações e etapas de produção

- **Recuperação de senha:** no desenvolvimento, o link é exibido **no terminal do servidor** se o endereço pertencer a uma conta. Em produção ela fica desativada com aviso explícito, pois um provedor de envio de e-mail ainda precisa ser integrado. A aplicação **não diz que enviou um e-mail quando não enviou**.
- **Sessões:** o armazenamento padrão em memória é apropriado para demonstração/testes, não para produção com vários processos ou reinicializações. Configure armazenamento persistente de sessão antes de implantar publicamente.
- **Hospedagem:** exige HTTPS, segredo forte, backups e regras adequadas de acesso aos arquivos de upload. O sistema não foi auditado independentemente para produção.
- **Stories e Reels:** o código original só mostrava elementos visuais, sem tabelas ou fluxo de vídeos/stories. O círculo principal agora abre a publicação de fotos e os demais levam a perfis. Para Stories/Reels reais seria necessário desenvolver upload, expiração, player e moderação específicos.
- Curtidas e salvos antigos guardados somente em `localStorage` do navegador não são migrados automaticamente para o banco, pois não estavam no servidor.

## Estrutura

- `server.js`: inicialização/migração do banco, rotas e validações.
- `views/`: páginas EJS e modais.
- `public/css/`: visual original e ajustes funcionais em `functions.css`.
- `public/js/`: `common.js`, `feed.js`, `chat.js`, `profile.js`.
- `test/integration.js`: bateria de testes HTTP com SQLite temporário.
