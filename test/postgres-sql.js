'use strict';
// Testes offline de conversão de consultas da antiga versão SQLite.
const assert = require('node:assert/strict');
const { translateSql } = require('../db/postgres');
const tests = [
  ['SELECT id FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE',
   'SELECT id FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($2)'],
  ['SELECT * FROM posts p LEFT JOIN users u ON u.username=p.usuario COLLATE NOCASE WHERE p.id=?',
   'SELECT * FROM posts p LEFT JOIN users u ON lower(u.username) = lower(p.usuario) WHERE p.id=$1'],
  ["SELECT * FROM stories WHERE expires_at>datetime('now') AND user_id=?",'SELECT * FROM stories WHERE expires_at>CURRENT_TIMESTAMP AND user_id=$1'],
  ["INSERT INTO stories(user_id,image_path,caption,expires_at) VALUES(?,?,?,datetime('now','+24 hours'))",
   "INSERT INTO stories(user_id,image_path,caption,expires_at) VALUES($1,$2,$3,(CURRENT_TIMESTAMP + INTERVAL '24 hours'))"],
  ['INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(?,?)',
   'INSERT INTO story_views(story_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING'],
  ["UPDATE users SET ultimo_ativo=datetime('now') WHERE id=?",'UPDATE users SET ultimo_ativo=CURRENT_TIMESTAMP WHERE id=$1'],
  ["SELECT CASE WHEN u.ultimo_ativo >= datetime('now','-5 minutes') THEN 'away' END AS status FROM users u WHERE u.id=?",
   "SELECT CASE WHEN u.ultimo_ativo >= (CURRENT_TIMESTAMP - INTERVAL '5 minutes') THEN 'away' END AS status FROM users u WHERE u.id=$1"]
];
for (const [source,expected] of tests) assert.equal(translateSql(source),expected);
console.log(`✓ ${tests.length} testes de conversão SQL PostgreSQL`);
