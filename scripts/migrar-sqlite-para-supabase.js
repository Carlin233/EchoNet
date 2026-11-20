'use strict';
/**
 * Migração privada e segura de um backup SQLite para Supabase.
 * Sem --execute: apenas faz a verificação local, SEM alterar nada na nuvem.
 * --execute: requer DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY e bucket público.
 * Execute com seu serviço em manutenção/sem novas gravações e mantenha o backup.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TABLES = [
  'users','posts','messages','password_resets','post_likes','saved_posts',
  'comments','follows','stories','story_views','notifications'
];
const COLUMNS = {
  users: ['id','username','email','password','ultimo_ativo','bio','display_name','avatar'],
  posts: ['id','imagem','legenda','usuario','criado_em','archived'],
  messages: ['id','remetente','destinatario','conteudo','enviado_em'],
  password_resets: [], // Nunca importamos tokens de redefinição de senha já emitidos.
  post_likes: ['user_id','post_id'],
  saved_posts: ['user_id','post_id'],
  comments: ['id','user_id','post_id','conteudo','criado_em'],
  follows: ['follower_id','following_id'],
  stories: ['id','user_id','image_path','caption','created_at','expires_at'],
  story_views: ['story_id','user_id','viewed_at'],
  notifications: ['id','recipient_id','actor_id','kind','message','target_url','created_at','read_at']
};
const DATE_COLUMNS = new Set(['ultimo_ativo','criado_em','enviado_em','created_at','expires_at','viewed_at','read_at']);
const IMAGE_FIELDS = [
  { table:'users',column:'avatar', folder:'avatars' },
  { table:'posts',column:'imagem',folder:'posts' },
  { table:'stories',column:'image_path',folder:'stories' }
];
const MIME = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif' };
const execute = process.argv.includes('--execute');
const args = process.argv.slice(2).filter(a => a !== '--execute');
const source = args[0] && path.resolve(args[0]);
const uploads = args[1] && path.resolve(args[1]);
if (!source || !uploads || !fs.existsSync(source)) {
  console.error('Uso: node scripts/migrar-sqlite-para-supabase.js CAMINHO/database.sqlite CAMINHO/uploads [--execute]');
  process.exit(1);
}
const sqlite3 = require('sqlite3').verbose();
const old = new sqlite3.Database(source, sqlite3.OPEN_READONLY);
const readAll = (sql) => new Promise((resolve, reject) => old.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
const closeSqlite = () => new Promise(resolve => old.close(() => resolve()));
function dateToISO(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(s) ? s : s.replace(' ', 'T')+'Z');
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida encontrada no backup.');
  return date.toISOString();
}
function localPath(value, folder) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return null;
  const prefix = folder === 'posts' ? '/uploads/' : `/uploads/${folder}/`;
  if (!value.startsWith(prefix)) throw new Error('Imagem referenciada em pasta inesperada; revise backup.');
  const name = value.slice(prefix.length);
  if (!name || name.includes('/') || name.includes('\\') || name === '..' || name === '.') throw new Error('Caminho de imagem inválido no backup.');
  const ext = path.extname(name).toLowerCase();
  if (!MIME[ext]) throw new Error('Tipo de arquivo não permitido no backup.');
  const targetDir = folder === 'posts' ? uploads : path.join(uploads,folder);
  const filepath = path.resolve(targetDir,name);
  if (!filepath.startsWith(path.resolve(targetDir)+path.sep)) throw new Error('Arquivo fora da pasta de uploads.');
  return { filepath, ext, folder, name };
}
async function readBackup() {
  const tableNames = new Set((await readAll("SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name));
  const data = new Map();
  for (const t of TABLES) data.set(t, tableNames.has(t) ? await readAll(`SELECT * FROM "${t}"`) : []);
  if (!data.get('users').length) throw new Error('Nenhuma conta encontrada. Confirme o database.sqlite correto e seus arquivos -wal e -shm.');
  const files = new Map();
  for (const {table,column,folder} of IMAGE_FIELDS) {
    for (const row of data.get(table)) {
      const obj = localPath(row[column],folder);
      if (obj) files.set(row[column],obj);
    }
  }
  const missing = [...files.values()].filter(o => !fs.existsSync(o.filepath));
  console.log('Prévia do backup (somente quantidades, sem divulgar dados pessoais):');
  for (const t of TABLES) console.log(`  ${t}: ${data.get(t).length}`);
  console.log(`  imagens locais referenciadas: ${files.size}; não encontradas: ${missing.length}`);
  if (missing.length) throw new Error(`Faltam ${missing.length} fotos no backup. Exemplo de caminho local: ${missing[0].filepath}. Migração interrompida.`);
  return { data,files };
}
async function migrate(data, files) {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Configure DATABASE_URL, SUPABASE_URL e SUPABASE_SECRET_KEY no terminal local (não em arquivos do Git).');
  }
  const { createPostgresAdapter } = require('../db/postgres');
  const db = createPostgresAdapter(process.env.DATABASE_URL);
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{ auth: { persistSession:false, autoRefreshToken:false } });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'echonet-media';
  const uploaded = [];
  const remoteMedia = new Map();
  let client;
  let committed = false;
  try {
    await db.initialize();
    client = await db.pool.connect();
    for (const t of TABLES) {
      const r = await client.query(`SELECT COUNT(*)::integer AS count FROM public."${t}"`);
      if (r.rows[0].count !== 0) throw new Error(`O Supabase não está vazio (tabela ${t}). Use projeto novo e vazio; NÃO apague dados existentes.`);
    }
    const { data: bucketInfo,error:bucketError } = await supabase.storage.getBucket(bucket);
    if (bucketError || !bucketInfo?.public) throw new Error(`Crie o bucket público "${bucket}" em Supabase > Storage, antes de migrar.`);
    for (const [local,info] of files) {
      const directory = path.resolve(info.folder === 'posts' ? uploads : path.join(uploads,info.folder));
      const actualDirectory = await fs.promises.realpath(directory);
      const actualFile = await fs.promises.realpath(info.filepath);
      if (!actualFile.startsWith(actualDirectory + path.sep)) throw new Error('Um upload é um link para fora do backup; migração interrompida.');
      const key = `echonet/${info.folder}/${Date.now()}_${crypto.randomBytes(14).toString('hex')}${info.ext}`;
      const { error } = await supabase.storage.from(bucket).upload(key, await fs.promises.readFile(info.filepath), { contentType:MIME[info.ext], upsert:false });
      if (error) throw new Error(`Upload para o Storage falhou: ${error.message}`);
      uploaded.push(key);
      remoteMedia.set(local,supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl);
    }
    await client.query('BEGIN');
    let imported = 0;
    for (const table of TABLES) {
      const allowed = COLUMNS[table];
      if (!allowed.length) continue;
      for (const sourceRow of data.get(table)) {
        const row = { ...sourceRow };
        if (table === 'messages' && !row.enviado_em && row.timestamp) row.enviado_em = row.timestamp;
        for (const c of Object.keys(row)) if (remoteMedia.has(row[c])) row[c] = remoteMedia.get(row[c]);
        const columns = allowed.filter(c => row[c] !== undefined);
        const values = columns.map(c => DATE_COLUMNS.has(c) && row[c] ? dateToISO(row[c]) : row[c]);
        const query = `INSERT INTO public."${table}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`;
        await client.query(query,values);
        imported++;
      }
      if (allowed.includes('id')) {
        // Ajustar a sequência para os próximos cadastros/posts após importar IDs antigos.
        await client.query(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public."${table}"),0),1), EXISTS(SELECT 1 FROM public."${table}"))`);
      }
    }
    await client.query('COMMIT');
    committed = true;
    console.log(`Migração concluída: ${imported} registros e ${uploaded.length} imagens.`);
    console.log('Valide as contas, postagens, fotos e Stories antes de mudar a versão do Render.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // Remove arquivos adicionados nesta tentativa, nunca arquivos antigos.
    if (!committed && uploaded.length) {
      const { error } = await supabase.storage.from(bucket).remove(uploaded);
      if (error) console.error('Alguns uploads desta tentativa exigem limpeza manual:',error.message);
    }
    throw error;
  } finally {
    client?.release();
    await db.pool.end();
  }
}
(async () => {
  try {
    const { data,files } = await readBackup();
    if (!execute) console.log('Simulação finalizada, nada foi enviado. Para importar: repita com --execute depois de configurar o Supabase.');
    else await migrate(data,files);
  } catch (err) { console.error('Migração não concluída:',err.message); process.exitCode=1; }
  finally { await closeSqlite(); }
})();
