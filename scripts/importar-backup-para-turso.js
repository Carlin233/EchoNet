'use strict';
/*
  Importa uma cópia LOCAL existente do SQLite e das imagens para Turso + Cloudinary.
  Exemplo: node scripts/importar-backup-para-turso.js C:\backups\database.sqlite C:\backups\uploads
  Não executa backup remoto do Render. NÃO use se o Turso já contiver dados.
*/
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cloudinary = require('cloudinary').v2;
const { initialize, db } = require('../server');

const TABLES = ['users', 'posts', 'messages', 'password_resets', 'post_likes',
  'saved_posts', 'comments', 'follows', 'stories', 'story_views', 'notifications'];
const MEDIA = [
  { table: 'users', col: 'avatar', group: 'avatars' },
  { table: 'posts', col: 'imagem', group: 'posts' },
  { table: 'stories', col: 'image_path', group: 'stories' }
];
const source = path.resolve(process.argv[2] || '');
const uploads = path.resolve(process.argv[3] || path.join(path.dirname(source), 'uploads'));
if (!process.argv[2] || !fs.existsSync(source) || !process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN || !process.env.CLOUDINARY_URL) {
  console.error('Uso: node scripts/importar-backup-para-turso.js CAMINHO_DATABASE_SQLITE CAMINHO_PASTA_UPLOADS');
  console.error('Configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN e CLOUDINARY_URL no terminal, sem compartilhar os valores.');
  process.exit(1);
}
const origin = new sqlite3.Database(source, sqlite3.OPEN_READONLY);
const origAll = (sql, args = []) => new Promise((resolve, reject) => origin.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
const sourceTables = new Set();
const contents = new Map();
async function main() {
  cloudinary.config({ secure: true });
  for (const row of await origAll("SELECT name FROM sqlite_master WHERE type='table'")) sourceTables.add(row.name);
  for (const table of TABLES) contents.set(table, sourceTables.has(table) ? await origAll(`SELECT * FROM "${table}"`) : []);
  if (!contents.get('users').length) throw new Error('Backup SQLite sem contas: confira se selecionou o banco correto.');
  const needed = [];
  const resolvesLocalPath = (storedPath, folder) => {
    if (!storedPath || typeof storedPath !== 'string' || !storedPath.startsWith('/uploads/')) return null;
    const expected = folder === 'posts' ? '/uploads/' : `/uploads/${folder}/`;
    if (!storedPath.startsWith(expected)) return null;
    const name = storedPath.slice(expected.length);
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/.test(name)) throw new Error(`Nome de arquivo inesperado: ${storedPath}`);
    return path.join(uploads, folder === 'posts' ? '' : folder, name);
  };
  for (const { table, col, group } of MEDIA) {
    for (const row of contents.get(table)) {
      const filename = resolvesLocalPath(row[col], group);
      if (filename) needed.push({ table, col, group, id: row.id, filename });
    }
  }
  const missing = needed.filter(x => !fs.existsSync(x.filename));
  if (missing.length) {
    console.error(`Faltam ${missing.length} arquivos de imagens. Exemplo: ${missing[0].filename}`);
    throw new Error('Importação interrompida antes de escrever no banco remoto. Faça backup das imagens também.');
  }
  await initialize();
  for (const table of ['users','posts','messages','stories']) {
    const remote = await db.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    if (Number(remote.rows[0].count) !== 0) throw new Error(`Turso não está vazio (${table}). Escolha um banco novo para evitar misturar contas.`);
  }
  let added = 0;
  for (const table of TABLES) {
    for (const row of contents.get(table)) {
      const cols = Object.keys(row);
      const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      await db.execute({ sql, args: cols.map(c => row[c] === undefined ? null : row[c]) });
      added += 1;
    }
    console.log(`${table}: ${contents.get(table).length} registros importados`);
  }
  let uploaded = 0;
  for (const file of needed) {
    const result = await cloudinary.uploader.upload(file.filename, { folder: `echonet/${file.group}`, resource_type: 'image', use_filename: false, unique_filename: true, overwrite: false });
    await db.execute({ sql: `UPDATE "${file.table}" SET "${file.col}"=? WHERE id=?`, args: [result.secure_url, file.id] });
    uploaded++;
  }
  console.log(`Migração concluída: ${added} registros e ${uploaded} arquivos enviados à nuvem.`);
  console.log('Mantenha seu backup LOCAL guardado até validar login, feed, perfis e fotos no Render.');
}
main().catch(err => { console.error('Falha na migração:', err.message); process.exitCode = 1; })
  .finally(() => { origin.close(); db.close?.(); });
