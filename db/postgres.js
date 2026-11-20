'use strict';
// Adaptador PostgreSQL para as consultas legadas do EchoNet.
// Todas as entradas do usuário permanecem em parâmetros vinculados ($1, $2...).
const fs = require('node:fs');
const path = require('node:path');

function translateSql(original) {
  let sql = original;
  // SQLite aceita COLLATE NOCASE no lado direito de comparações; PostgreSQL não.
  sql = sql.replace(/([a-zA-Z_][\w.]*)\s*=\s*(\?|\$\d+|[a-zA-Z_][\w.]*)\s+COLLATE\s+NOCASE\b/gi,
    (_, left, right) => `lower(${left}) = lower(${right})`);
  sql = sql.replace(/datetime\(\s*'now'\s*,\s*'([+-])(\d+)\s+(minute|minutes|hour|hours|day|days)'\s*\)/gi,
    (_, sign, amount, unit) => `(CURRENT_TIMESTAMP ${sign} INTERVAL '${Number(amount)} ${unit}')`);
  sql = sql.replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
  sql = sql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
  const needsIgnore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(original);
  let n = 0;
  sql = sql.replace(/\?/g, () => `$${++n}`);
  if (needsIgnore) sql += ' ON CONFLICT DO NOTHING';
  return sql;
}

function createPostgresAdapter(connectionString) {
  if (!/^postgres(?:ql)?:\/\//.test(connectionString || '')) {
    throw new Error('DATABASE_URL deve ser uma URI postgresql:// do Supabase (Session pooler).');
  }
  const { Pool, types } = require('pg');
  types.setTypeParser(20, Number); // Contagens de linhas: bigint -> Number (para a interface).
  // O pooler do Supabase utiliza TLS. Nunca desative a verificação do certificado.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true
  });
  async function query(sql, params = []) { return pool.query(translateSql(sql), params); }
  async function run(sql, params = []) {
    // A API de Stories utiliza lastID, seguindo o retorno que existia no SQLite.
    let rewritten = translateSql(sql);
    const getsId = /^\s*INSERT\s+INTO\s+(?:users|posts|messages|password_resets|comments|stories|notifications)\s*\(/i.test(rewritten);
    if (getsId) rewritten += ' RETURNING id';
    const result = await pool.query(rewritten, params);
    return { changes: result.rowCount || 0, lastID: getsId ? result.rows[0]?.id : undefined };
  }
  async function get(sql, params = []) { return (await query(sql, params)).rows[0]; }
  async function all(sql, params = []) { return (await query(sql, params)).rows; }
  async function initialize() {
    const schema = fs.readFileSync(path.join(__dirname, 'supabase-schema.sql'), 'utf8');
    await pool.query(schema);
  }
  return { pool, query, get, all, run, initialize };
}
module.exports = { translateSql, createPostgresAdapter };
