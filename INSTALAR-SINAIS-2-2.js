'use strict';
// Nósverso Sinais 2.2 — instalador idempotente e compatível com Sinais 2.1.
// node INSTALAR-SINAIS-2-2.js --dry-run  |  node INSTALAR-SINAIS-2-2.js
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=__dirname,dry=process.argv.includes('--dry-run');
const required=['server.js','views/mensagens.ejs','nosverso-sinais-2-server.js','nosverso-sinais-2-2-server.js','public/js/nosverso-sinais-2-2.js','public/css/nosverso-sinais-2-2.css','public/css/nosverso-sinais-2-1-fix.css'];
function abort(s){console.error('Instalação cancelada: '+s);process.exit(1);}
for(const file of required)if(!fs.existsSync(path.join(root,file)))abort('Falta '+file+'. Extraia o pacote NA RAIZ do EchoNet, após instalar o Sinais 2.1.');
const serverPath=path.join(root,'server.js'),viewPath=path.join(root,'views/mensagens.ejs'),ignorePath=path.join(root,'.gitignore');
const oldServer=fs.readFileSync(serverPath,'utf8'),oldView=fs.readFileSync(viewPath,'utf8');
let server=oldServer,view=oldView;
const marker='// NOSVERSO-SINAIS-2-2:SERVER';
const viewMarker='<!-- NOSVERSO-SINAIS-2-2:JS -->';
if(!server.includes(marker)){
  const anchor='const CONTACTS_QUERY =';
  if(!server.includes(anchor)||!server.includes('const sinais2 =')||!(server.match(/await sinais2\.initialize\(\);/g)||[]).length||!server.includes("const sinais2 = require('./nosverso-sinais-2-server')"))abort('server.js não corresponde ao Sinais 2.0.');
  const dependency=`${marker}\nconst sinais22 = require('./nosverso-sinais-2-2-server').register({\n  app,run,get,all,requireLogin,withErrors,notify,\n  usingPostgres:USING_POSTGRES,postgresPool:postgres?.pool,\n  supabaseAdmin,cloudinary,multer,uploadDir:UPLOAD_DIR,publicRoot:path.join(ROOT,'public'),\n  privateDir:path.resolve(process.env.SINAIS_PRIVATE_UPLOAD_DIR || (DATA_DIR ? path.join(DATA_DIR,'chat-private') : path.join(ROOT,'private-chat-media'))),\n  durableLocal:Boolean(process.env.SINAIS_PRIVATE_UPLOAD_DIR || DATA_DIR),\n  bucket:process.env.SINAIS_MEDIA_BUCKET || 'echonet-chat-private'\n});\n\n`;
  server=server.replace(anchor,dependency+anchor);
  const count=(server.match(/await sinais2\.initialize\(\);/g)||[]).length;
  if(count!==2)abort('Não encontrei a inicialização dupla do Sinais 2.0.');
  server=server.replaceAll('await sinais2.initialize();','await sinais2.initialize();\n    await sinais22.initialize();');
}
if(!view.includes(viewMarker)){
  if(!view.includes('<!-- NOSVERSO-SINAIS-2-1:CORRECAO -->')||!view.includes('id="sinaisReplyBar"')||!view.includes('id="formMensagem"'))abort('Instale primeiro o Sinais 2.1. A correção do layout é obrigatória.');
  const regex=/<script\s+src=["']\/js\/nosverso-sinais-2\.js(?:\?[^"']*)?["']\s+defer><\/script>/g;
  if((view.match(regex)||[]).length!==1)abort('Não encontrei a inclusão ÚNICA do JS do Sinais 2.0.');
  view=view.replace(regex,`${viewMarker}\n  <script src="/js/nosverso-sinais-2-2.js?v=2.2.0" defer></script>`);
  const formAnchor='        <form id="formMensagem" class="form-mensagem">';
  if(!view.includes(formAnchor))abort('Formulário de mensagens diferente da versão testada.');
  view=view.replace(formAnchor,`        <!-- NOSVERSO-SINAIS-2-2:COMPOSER -->\n        <div class="sinais22-panel" id="sinais22Preview" hidden><div class="sinais22-preview-content"><span id="sinais22PreviewText"></span><div id="sinais22PreviewMedia"></div></div><button type="button" id="sinais22CancelFile" aria-label="Remover anexo">Remover</button></div>\n        <div class="sinais22-panel" id="sinais22Status" role="status" aria-live="polite" hidden></div>\n${formAnchor}`);
  const target='          <input type="text" name="conteudo"';
  if(!view.includes(target))abort('Campo de texto do chat diferente da versão esperada.');
  view=view.replace(target,`          <div class="sinais22-tools">\n            <button type="button" id="sinais22Attach" class="sinais22-tool" aria-label="Anexar foto ou vídeo" title="Anexar foto ou vídeo">📎</button>\n            <button type="button" id="sinais22Record" class="sinais22-tool" aria-label="Gravar áudio" title="Gravar áudio" aria-pressed="false">🎙️</button>\n            <input type="file" id="sinais22File" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" hidden>\n          </div>\n${target}`);
  const inputRegex=/(<input type="text" name="conteudo"[^>]*?)\srequired(\s[^>]*>|>)/;
  if(!inputRegex.test(view))abort('Campo de texto requerido não encontrado; evitei alterar formulário incompatível.');
  view=view.replace(inputRegex,'$1$2');
  const cssAnchor=/(<link\s+rel="stylesheet"\s+href="\/css\/nosverso-sinais-2-1-fix\.css\?[^"\s]+">)/;
  if(!cssAnchor.test(view))abort('CSS Sinais 2.1 não está referenciado.');
  view=view.replace(cssAnchor,`$1\n  <!-- NOSVERSO-SINAIS-2-2:CSS -->\n  <link rel="stylesheet" href="/css/nosverso-sinais-2-2.css?v=2.2.0">`);
}
let priorIgnore=fs.existsSync(ignorePath)?fs.readFileSync(ignorePath,'utf8'):'';
const newIgnore=priorIgnore.includes('private-chat-media/')?priorIgnore:priorIgnore.trimEnd()+'\n\n# Mídias privadas do Sinais (nunca enviar para o Git)\nprivate-chat-media/\n';
if(server===oldServer&&view===oldView&&newIgnore===priorIgnore){console.log('Sinais 2.2 já instalado.');process.exit(0);}
if(dry){console.log('SIMULAÇÃO OK. Alterações em: '+[server!==oldServer?'server.js':'',view!==oldView?'views/mensagens.ejs':'',newIgnore!==priorIgnore?'.gitignore':''].filter(Boolean).join(', '));console.log('Sem tocar no banco existente, CSS 2.1, JS do iPhone V3 ou credenciais.');process.exit(0);}
const key=crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
const folder=path.join(os.tmpdir(),'Nosverso_Sinais22_Backups',key);
fs.mkdirSync(folder,{recursive:true});
const saved={};
for(const [file,content] of [[serverPath,oldServer],[viewPath,oldView],[ignorePath,priorIgnore]]){
  const snapshot=path.join(folder,path.basename(file)+'-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.backup');
  fs.writeFileSync(snapshot,content,'utf8');saved[file]=snapshot;
}
const edits=[[serverPath,server],[viewPath,view],[ignorePath,newIgnore]];
const changed=[];
try{
  for(const [file,content] of edits){if(content=== (file===serverPath?oldServer:file===viewPath?oldView:priorIgnore))continue;
    const temp=file+'.sinais22-tmp';fs.writeFileSync(temp,content,'utf8');fs.renameSync(temp,file);changed.push(file);}
  fs.writeFileSync(path.join(folder,'ultimo.json'),JSON.stringify({root:path.resolve(root),saved,createdAt:new Date().toISOString()},null,2));
}catch(err){for(const file of changed)fs.copyFileSync(saved[file],file);abort(err.message);}
console.log('Sinais 2.2 instalado. Reinicie Node/Render para adicionar as colunas de recibos e anexos.');
console.log('Backups de código: '+folder);
