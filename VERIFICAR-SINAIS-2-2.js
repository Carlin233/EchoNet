'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const errors=[];
const files=['nosverso-sinais-2-2-server.js','public/js/nosverso-sinais-2-2.js','public/css/nosverso-sinais-2-2.css'];
for(const name of files)if(!fs.existsSync(path.join(root,name)))errors.push('Falta '+name);
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const view=fs.readFileSync(path.join(root,'views/mensagens.ejs'),'utf8');
if(!server.includes('// NOSVERSO-SINAIS-2-2:SERVER'))errors.push('Servidor não vinculado ao Sinais 2.2');
if((server.match(/await sinais22\.initialize\(\);/g)||[]).length!==2)errors.push('Inicialização do banco incompleta');
for(const id of ['sinais22Record','sinais22Attach','sinais22Preview','sinais22PreviewMedia','sinais22Status','sinais22File','sinaisReplyBar'])if(!view.includes(`id="${id}"`))errors.push('Falta '+id);
for(const term of ['nosverso-sinais-2-2.js','nosverso-sinais-2-2.css','nosverso-sinais-2-1-fix.css','nosverso-chat-iphone-v3.js'])if(!view.includes(term))errors.push('Falta '+term);
if(view.includes('src="/js/nosverso-sinais-2.js'))errors.push('JS 2.0 antigo ainda carrega junto com o 2.2');
if(/<input type="text" name="conteudo"[^>]*\srequired/.test(view))errors.push('required impede mensagens só com arquivo');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('✓ Instalação Sinais 2.2 verificada (áudio, fotos/vídeos, leitura, CSS 2.1 e teclado V3).');
console.log('✓ Verificação estrutural; execute os testes de API antes de publicar.');
