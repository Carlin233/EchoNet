'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=__dirname;
const key=crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
const folder=path.join(os.tmpdir(),'Nosverso_Sinais22_Backups',key);
const pointer=path.join(folder,'ultimo.json');
if(!fs.existsSync(pointer)){console.error('Backup local não encontrado. Para desfazer no GitHub, use git revert do commit.');process.exit(1);}
const info=JSON.parse(fs.readFileSync(pointer,'utf8'));
if(info.root!==path.resolve(root))throw new Error('Backup pertence a outra pasta.');
for(const [file,saved] of Object.entries(info.saved)){if(!fs.existsSync(saved))throw new Error('Backup ausente: '+file);fs.copyFileSync(saved,file);}
console.log('Arquivos de código anteriores restaurados. Colunas aditivas do banco mantidas para proteger mensagens.');
