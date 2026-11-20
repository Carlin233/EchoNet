'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const USING_POSTGRES = Boolean(process.env.DATABASE_URL);
const sqlite3 = (USING_POSTGRES || process.env.TURSO_DATABASE_URL) ? null : require('sqlite3').verbose();
const multer = require('multer');

const app = express();
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const IN_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (IN_PRODUCTION ? '' : 'DEV_ONLY_CHANGE_THIS_ECHONET_SECRET');
if (!SESSION_SECRET || (IN_PRODUCTION && SESSION_SECRET.length < 32)) {
  throw new Error('Configure SESSION_SECRET com pelo menos 32 caracteres para produção.');
}
// O EchoNet pode usar SQLite em disco persistente ou Turso remoto (libSQL).
// IMPORTANTE: somente definir DB_PATH/UPLOAD_DIR não cria um disco persistente no Render.
const DATA_DIR = process.env.PERSISTENT_DATA_DIR ? path.resolve(process.env.PERSISTENT_DATA_DIR) : '';
const DB_PATH = process.env.DB_PATH || (DATA_DIR ? path.join(DATA_DIR, 'database.sqlite') : path.join(ROOT, 'database.sqlite'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || (DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'public', 'uploads')));
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const STORY_DIR = path.join(UPLOAD_DIR, 'stories');
const REMOTE_DATABASE = Boolean(process.env.TURSO_DATABASE_URL);
if (USING_POSTGRES && REMOTE_DATABASE) throw new Error('Use apenas DATABASE_URL (Supabase) OU TURSO_DATABASE_URL.');
const CLOUD_IMAGES = Boolean(process.env.CLOUDINARY_URL);
const SUPABASE_IMAGES = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'echonet-media';
const SUPABASE_PROJECT_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
if (USING_POSTGRES && !SUPABASE_IMAGES && IN_PRODUCTION) throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY para persistir imagens.');
if (USING_POSTGRES && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)) {
  console.warn('[AVISO] DATABASE_URL sem Supabase Storage: uploads locais não persistem.');
}
if (SUPABASE_IMAGES && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL)) {
  throw new Error('SUPABASE_URL precisa ser a URL HTTPS oficial do seu projeto.');
}
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(SUPABASE_BUCKET)) throw new Error('Nome inválido do bucket Supabase.');
if (REMOTE_DATABASE && !process.env.TURSO_AUTH_TOKEN) throw new Error('Falta TURSO_AUTH_TOKEN.');
if (REMOTE_DATABASE && !CLOUD_IMAGES && IN_PRODUCTION) throw new Error('Configure CLOUDINARY_URL para manter fotos e Stories após deploy.');
if (IN_PRODUCTION && process.env.REQUIRE_PERSISTENCE === '1' && !USING_POSTGRES && !REMOTE_DATABASE && !DATA_DIR && !(process.env.DB_PATH && process.env.UPLOAD_DIR)) {
  throw new Error('Sem armazenamento durável: configure Turso + Cloudinary ou disco persistente do Render.');
}
if (IN_PRODUCTION && !USING_POSTGRES && !REMOTE_DATABASE && !DATA_DIR && !(process.env.DB_PATH && process.env.UPLOAD_DIR)) {
  console.warn('[AVISO] SQLite e uploads no disco temporário: contas, posts e fotos podem sumir após redeploy.');
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });
fs.mkdirSync(STORY_DIR, { recursive: true });
if (!REMOTE_DATABASE) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const postgres = USING_POSTGRES ? require('./db/postgres').createPostgresAdapter(process.env.DATABASE_URL) : null;
const db = USING_POSTGRES ? postgres.pool : REMOTE_DATABASE
  ? require('@libsql/client').createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : new sqlite3.Database(DB_PATH);
if (!USING_POSTGRES && !REMOTE_DATABASE) db.configure('busyTimeout', 5000);
const cloudinary = CLOUD_IMAGES ? require('cloudinary').v2 : null;
if (cloudinary) cloudinary.config({ secure: true });
const supabaseAdmin = SUPABASE_IMAGES ? require('@supabase/supabase-js').createClient(
  SUPABASE_PROJECT_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
) : null;
const run = (sql, params = []) => USING_POSTGRES ? postgres.run(sql, params) : REMOTE_DATABASE
  ? db.execute({ sql, args: params }).then(r => ({ changes: r.rowsAffected, lastID: r.lastInsertRowid ? Number(r.lastInsertRowid) : undefined }))
  : new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (sql, params = []) => USING_POSTGRES ? postgres.get(sql, params) : REMOTE_DATABASE
  ? db.execute({ sql, args: params }).then(r => r.rows[0] ? { ...r.rows[0] } : undefined)
  : new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => USING_POSTGRES ? postgres.all(sql, params) : REMOTE_DATABASE
  ? db.execute({ sql, args: params }).then(r => r.rows.map(row => ({ ...row })))
  : new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

// Arquivos de usuários são armazenados no Cloudinary quando configurado.
async function saveMedia(file, folder) {
  if (supabaseAdmin) {
    const filename = path.basename(file.filename);
    const key = `echonet/${folder}/${filename}`;
    try {
      const content = await fs.promises.readFile(file.path);
      const { error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET).upload(key, content, {
        contentType: file.mimetype, upsert: false, cacheControl: '3600'
      });
      if (error) throw new Error(`Falha no Supabase Storage: ${error.message}`);
      const { data } = supabaseAdmin.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
      if (!data?.publicUrl) throw new Error('URL pública do arquivo não foi gerada.');
      return data.publicUrl;
    } finally { await fs.promises.unlink(file.path).catch(() => {}); }
  }
  if (!cloudinary) return `/uploads/${folder === 'posts' ? '' : `${folder}/`}${file.filename}`;
  try {
    const uploaded = await cloudinary.uploader.upload(file.path, {
      folder: `echonet/${folder}`, resource_type: 'image', use_filename: false, unique_filename: true, overwrite: false
    });
    if (!uploaded.secure_url || !uploaded.secure_url.startsWith('https://res.cloudinary.com/')) throw new Error('Upload externo sem URL HTTPS válida.');
    return uploaded.secure_url;
  } finally {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}
async function removeMedia(imagePath, folder) {
  if (typeof imagePath !== 'string' || !['posts', 'avatars', 'stories'].includes(folder)) return;
  if (supabaseAdmin && imagePath.startsWith(`${SUPABASE_PROJECT_URL}/storage/v1/object/public/`)) {
    try {
      const origin = new URL(SUPABASE_PROJECT_URL);
      const url = new URL(imagePath);
      const prefix = `/storage/v1/object/public/${SUPABASE_BUCKET}/echonet/${folder}/`;
      if (url.origin !== origin.origin || !url.pathname.startsWith(prefix)) return;
      const filename = url.pathname.slice(prefix.length);
      if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/.test(filename)) return;
      const { error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET).remove([`echonet/${folder}/${filename}`]);
      if (error) console.error('Falha ao limpar arquivo no Storage:', error.message);
    } catch (error) { console.error('Erro ao validar imagem do Supabase:', error.message); }
    return;
  }
  if (cloudinary && imagePath.startsWith('https://res.cloudinary.com/')) {
    const expectedCloud = cloudinary.config().cloud_name;
    try {
      const url = new URL(imagePath);
      if (url.hostname !== 'res.cloudinary.com') return;
      const prefix = `/${expectedCloud}/image/upload/`;
      if (!url.pathname.startsWith(prefix)) return;
      const remainder = url.pathname.slice(prefix.length).replace(/^v\d+\//, '');
      if (!new RegExp(`^echonet/${folder}/[a-zA-Z0-9_/-]+\.(jpg|jpeg|png|webp|gif)$`).test(remainder)) return;
      const publicId = remainder.replace(/\.[^.]+$/, '');
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err) { console.error('Falha ao limpar imagem externa:', err.message); }
    return;
  }
  const prefix = folder === 'posts' ? '/uploads/' : `/uploads/${folder}/`;
  if (imagePath.startsWith(prefix) && /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(imagePath.slice(prefix.length))) {
    const target = folder === 'posts' ? UPLOAD_DIR : folder === 'avatars' ? AVATAR_DIR : STORY_DIR;
    await fs.promises.unlink(path.join(target, path.basename(imagePath))).catch(() => {});
  }
}

async function initialize() {
  if (USING_POSTGRES) {
    await postgres.initialize();
    await purgeExpiredStories();
    return;
  }
  if (!REMOTE_DATABASE) {
    await run('PRAGMA journal_mode = WAL');
    await run('PRAGMA foreign_keys = ON');
  }
  await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, ultimo_ativo DATETIME)`);
  await run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, imagem TEXT NOT NULL, legenda TEXT NOT NULL, usuario TEXT NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, remetente TEXT NOT NULL, destinatario TEXT NOT NULL, conteudo TEXT NOT NULL, enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, token TEXT NOT NULL, expires_at DATETIME NOT NULL)`);
  const userFields = (await all('PRAGMA table_info(users)')).map(x => x.name);
  if (!userFields.includes('ultimo_ativo')) await run('ALTER TABLE users ADD COLUMN ultimo_ativo DATETIME');
  if (!userFields.includes('bio')) await run("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
  if (!userFields.includes('display_name')) await run("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''");
  if (!userFields.includes('avatar')) await run("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL");
  const postFields = (await all('PRAGMA table_info(posts)')).map(x => x.name);
  if (!postFields.includes('criado_em')) await run('ALTER TABLE posts ADD COLUMN criado_em DATETIME DEFAULT NULL');
  if (!postFields.includes('archived')) await run('ALTER TABLE posts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  const msgFields = (await all('PRAGMA table_info(messages)')).map(x => x.name);
  if (!msgFields.includes('enviado_em')) {
    await run('ALTER TABLE messages ADD COLUMN enviado_em DATETIME');
    if (msgFields.includes('timestamp')) await run('UPDATE messages SET enviado_em = timestamp WHERE enviado_em IS NULL');
  }
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)');
  await run('CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(usuario, criado_em DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(remetente, destinatario, id)');
  await run(`CREATE TABLE IF NOT EXISTS post_likes (user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, PRIMARY KEY(user_id, post_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS saved_posts (user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, PRIMARY KEY(user_id, post_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, conteudo TEXT NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE)`);
  await run('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id)');
  await run(`CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL, PRIMARY KEY(follower_id, following_id), CHECK(follower_id != following_id), FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run('CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)');
  // Tokens antigos eram armazenados em texto puro. Os novos usam SHA-256.
  await run('CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)');
  await run(`CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(expires_at, id)');
  await run(`CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(story_id,user_id),
    FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    target_url TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications(recipient_id, id DESC)');
  await purgeExpiredStories();
}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.urlencoded({ extended: false, limit: '30kb' }));
app.use(express.json({ limit: '30kb' }));
// Permite colocar uploads fora do código, em um disco persistente do Render.
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, maxAge: IN_PRODUCTION ? '1h' : 0 }));
app.use(express.static(path.join(ROOT, 'public'), { index: false, maxAge: IN_PRODUCTION ? '1h' : 0 }));
app.use(session({
  name: 'echonet.sid', secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IN_PRODUCTION, maxAge: 7 * 24 * 3600 * 1000 }
}));
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
});
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const supplied = req.get('x-csrf-token') || (typeof req.body?._csrf === 'string' ? req.body._csrf : '');
  const expected = req.session.csrfToken;
  const ok = supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!ok) return res.status(403).json({ success: false, message: 'Página desatualizada. Atualize e tente novamente.' });
  next();
});
const isJsonRequest = req => req.is('application/json') || req.get('accept')?.includes('application/json');
const requireLogin = (req, res, next) => req.session.user ? next() : (req.path.startsWith('/api/') || isJsonRequest(req) ? res.status(401).json({ success: false, message: 'Faça login para continuar.' }) : res.redirect('/login.html'));
const withErrors = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = value => typeof value === 'string' ? value.trim() : '';
const validId = value => /^[1-9]\d*$/.test(String(value));
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const safeDate = str => {
  if (!str) return '';
  const date = str instanceof Date ? str : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(str))
    ? String(str) : String(str).replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
};
const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 128;
const attemptMap = new Map();
function limitAttempts(kind, max, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const now = Date.now(), key = `${kind}:${req.ip}`;
    if (attemptMap.size > 2000) for (const [k, v] of attemptMap) if (now >= v.until) attemptMap.delete(k);
    const prior = attemptMap.get(key);
    const count = !prior || now >= prior.until ? { count: 1, until: now + windowMs } : { count: prior.count + 1, until: prior.until };
    attemptMap.set(key, count);
    if (count.count > max) return res.status(429).json({ success: false, message: 'Muitas tentativas. Tente novamente em alguns minutos.' });
    next();
  };
}

const POST_SELECT = `SELECT p.*, u.avatar AS author_avatar, (SELECT COUNT(*) FROM post_likes l WHERE l.post_id=p.id) AS like_count, (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS comment_count, EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=?) AS liked, EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id=p.id AND s.user_id=?) AS saved FROM posts p LEFT JOIN users u ON u.username=p.usuario COLLATE NOCASE`;
const listPosts = (viewerId, extra = '', params = []) => all(`${POST_SELECT} ${extra}`, [viewerId, viewerId, ...params]);
const userAvatar = async userId => (await get('SELECT avatar FROM users WHERE id=?', [userId]))?.avatar || '/img/default-avatar.svg';

// Uma conexão SSE por aba: atualiza a sineta sem serviços adicionais no Render.
// SSE envia apenas um aviso para recarregar; os dados privados são lidos via API autenticada.
// ECHONET_APP2_PUSH — integracao modular de notificacoes web.
const echonetPush = require('./echonet-push-server').register({
  app, run, all, requireLogin, withErrors, limitAttempts
});
const notificationStreams = new Map();
function emitNotification(recipientId) {
  for (const stream of notificationStreams.get(Number(recipientId)) || []) {
    try { stream.write('event: notifications\ndata: {}\n\n'); }
    catch { stream.end(); }
  }
}
async function notify(recipientId, actor, kind, message, targetUrl) {
  if (!recipientId || Number(recipientId) === Number(actor.id)) return;
  await run('INSERT INTO notifications(recipient_id,actor_id,kind,message,target_url) VALUES(?,?,?,?,?)',
    [recipientId,actor.id,kind,`${actor.username} ${message}`,targetUrl]);
  emitNotification(recipientId);
  // ECHONET_APP2_DELIVERY — envia push sem atrasar a notificacao existente.
  echonetPush.send(recipientId, {
    kind, body: kind === 'message' ? 'Você recebeu uma nova mensagem.' : `${actor.username} ${message}`,
    url: targetUrl
  }).catch(error => console.warn('[EchoNet Push] Erro ao enviar:', error?.message || 'indisponivel'));
}
async function purgeExpiredStories() {
  const expired = await all("SELECT image_path FROM stories WHERE expires_at <= datetime('now')");
  await run("DELETE FROM stories WHERE expires_at <= datetime('now')");
  for (const { image_path: pathName } of expired) {
    await removeMedia(pathName, 'stories');
  }
}

// Listagem e notificações são privadas: apenas o destinatário pode ler e marcar.
app.get('/api/notifications', requireLogin, withErrors(async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  const [notifications, counts] = await Promise.all([
    all(`SELECT n.id,n.kind,n.message,n.target_url,n.created_at,n.read_at,u.avatar AS actor_avatar
         FROM notifications n JOIN users u ON u.id=n.actor_id
         WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 30`, [req.session.user.id]),
    get('SELECT COUNT(*) AS unread FROM notifications WHERE recipient_id=? AND read_at IS NULL', [req.session.user.id])
  ]);
  res.json({ success: true, notifications, unread: counts.unread });
}));
app.post('/api/notifications/read-all', requireLogin, withErrors(async (req, res) => {
  await run("UPDATE notifications SET read_at=datetime('now') WHERE recipient_id=? AND read_at IS NULL", [req.session.user.id]);
  emitNotification(req.session.user.id);
  res.json({ success: true, unread: 0 });
}));
app.post('/api/notifications/:id/read', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id)) return res.sendStatus(404);
  const updated = await run("UPDATE notifications SET read_at=coalesce(read_at, datetime('now')) WHERE id=? AND recipient_id=?", [req.params.id,req.session.user.id]);
  if (!updated.changes) return res.sendStatus(404);
  emitNotification(req.session.user.id);
  res.json({ success: true });
}));
app.get('/api/notifications/stream', requireLogin, (req, res) => {
  res.status(200).set({ 'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive',
    'X-Accel-Buffering':'no' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const id = req.session.user.id;
  if (!notificationStreams.has(id)) notificationStreams.set(id, new Set());
  notificationStreams.get(id).add(res);
  const ping = setInterval(() => { if (!res.destroyed) res.write(': keep-alive\n\n'); }, 25000);
  res.on('close', () => {
    clearInterval(ping);
    const streams = notificationStreams.get(id);
    if (streams) { streams.delete(res); if (!streams.size) notificationStreams.delete(id); }
  });
});


app.get('/login.html', (req, res) => req.session.user ? res.redirect('/') : res.type('html').send(fs.readFileSync(path.join(ROOT, 'views', 'login.html'), 'utf8').replaceAll('__CSRF_TOKEN__', req.session.csrfToken)));
app.get('/api/csrf', (req, res) => res.json({ token: req.session.csrfToken }));

app.post('/register', limitAttempts('register', 12), withErrors(async (req, res) => {
  const username = clean(req.body.username), email = clean(req.body.email).toLowerCase();
  const password = req.body.password, confirm = req.body.confirmPassword;
  if (!/^[\p{L}\p{N}_.-]{3,30}$/u.test(username)) return res.status(400).json({ success: false, message: 'Usuário: 3 a 30 letras, números, pontos, traços ou _. ' });
  if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Informe um e-mail válido.' });
  if (!validPassword(password)) return res.status(400).json({ success: false, message: 'A senha deve ter de 8 a 128 caracteres.' });
  if (password !== confirm) return res.status(400).json({ success: false, message: 'As senhas não coincidem.' });
  const taken = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE', [email, username]);
  if (taken) return res.status(409).json({ success: false, message: 'Usuário ou e-mail já está cadastrado.' });
  try {
    await run('INSERT INTO users(username,email,password) VALUES(?,?,?)', [username, email, await bcrypt.hash(password, 10)]);
  } catch (e) { if (e.code === 'SQLITE_CONSTRAINT' || e.code === '23505') return res.status(409).json({ success: false, message: 'Usuário ou e-mail já está cadastrado.' }); throw e; }
  return res.status(201).json({ success: true, message: 'Conta criada. Faça seu login.' });
}));

app.post('/login', limitAttempts('login', 20), withErrors(async (req, res, next) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email]);
  const good = user && await bcrypt.compare(String(req.body.password || ''), user.password);
  if (!good) return res.status(401).redirect('/login.html?erro=credenciais');
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.user = { id: user.id, username: user.username, email: user.email };
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.save(err => err ? next(err) : res.redirect('/'));
  });
}));
app.post('/logout', requireLogin, (req, res, next) => req.session.destroy(err => err ? next(err) : (res.clearCookie('echonet.sid'), res.redirect('/login.html'))));

app.get('/', requireLogin, withErrors(async (req, res) => {
  const posts = await listPosts(req.session.user.id, 'WHERE p.archived = 0 ORDER BY p.id DESC LIMIT 80');
  res.render('index', { username: req.session.user.username, myAvatar: await userAvatar(req.session.user.id), posts, currentPage: 'home', safeDate });
}));
app.get('/post/:id', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).send('Publicação não encontrada.');
  const posts = await listPosts(req.session.user.id, 'WHERE p.id=? AND p.archived=0', [req.params.id]);
  if (!posts.length) return res.status(404).send('Publicação não encontrada.');
  res.render('index', { username: req.session.user.username, myAvatar: await userAvatar(req.session.user.id), posts, currentPage: 'home', safeDate });
}));

async function renderProfile(req, res, name) {
  const owner = await get('SELECT id,username,display_name,bio,avatar FROM users WHERE username = ? COLLATE NOCASE', [name]);
  if (!owner) return res.status(404).send('Perfil não encontrado.');
  const me = owner.id === req.session.user.id;
  const posts = await listPosts(req.session.user.id, 'WHERE p.usuario=? AND p.archived=0 ORDER BY p.id DESC LIMIT 100', [owner.username]);
  // PostgreSQL não possui s.rowid; ordenar pelo ID da publicação.
  const savedPosts = me
    ? await listPosts(
        req.session.user.id,
        'INNER JOIN saved_posts s ON s.post_id=p.id AND s.user_id=? WHERE p.archived=0 ORDER BY p.id DESC LIMIT 100',
        [req.session.user.id]
      )
    : [];
  const archivedPosts = me ? await listPosts(req.session.user.id, 'WHERE p.usuario=? AND p.archived=1 ORDER BY p.id DESC LIMIT 100', [owner.username]) : [];
  const follows = await get('SELECT (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers, (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following, EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=?) AS isFollowing', [owner.id, owner.id, req.session.user.id, owner.id]);
  // O anel colorido só aparece se houver Story não expirado do dono do perfil.
  const storyState = await get("SELECT COUNT(*) AS total FROM stories WHERE user_id=? AND expires_at>datetime('now')", [owner.id]);
  const hasActiveStory = Number(storyState?.total || 0) > 0;
  res.render('perfil', { username: owner.username, owner, myAvatar: await userAvatar(req.session.user.id), viewer: req.session.user.username, isMine: me, posts, savedPosts, archivedPosts, follows, hasActiveStory, currentPage: 'perfil' });
}
// Configurações são sempre consultadas pelo ID autenticado, nunca por e-mail enviado pelo navegador.
app.get('/configuracoes', requireLogin, withErrors(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const account = await get('SELECT id,username,email,display_name,avatar FROM users WHERE id=?', [req.session.user.id]);
  if (!account) return res.status(401).send('Sessão inválida. Faça login novamente.');
  res.render('configuracoes', {
    username: account.username,
    account,
    myAvatar: account.avatar || '/img/default-avatar.svg',
    currentPage: 'settings'
  });
}));

// Protegido por sessão, token CSRF, limite de tentativas e confirmação da senha anterior.
app.post('/api/conta/alterar-senha', requireLogin, limitAttempts('account-password', 12), withErrors(async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const currentPassword = req.body.senhaAtual;
  const newPassword = req.body.novaSenha;
  const confirmation = req.body.confirmarSenha;
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
    return res.status(400).json({ success: false, message: 'Informe sua senha atual.' });
  }
  if (!validPassword(newPassword)) {
    return res.status(400).json({ success: false, message: 'A nova senha deve ter entre 8 e 128 caracteres.' });
  }
  if (newPassword !== confirmation) {
    return res.status(400).json({ success: false, message: 'A confirmação da nova senha não confere.' });
  }
  const account = await get('SELECT id,username,email,password FROM users WHERE id=?', [req.session.user.id]);
  if (!account || !await bcrypt.compare(currentPassword, account.password)) {
    return res.status(400).json({ success: false, message: 'Senha atual incorreta.' });
  }
  if (await bcrypt.compare(newPassword, account.password)) {
    return res.status(400).json({ success: false, message: 'Escolha uma senha diferente da atual.' });
  }
  const newHash = await bcrypt.hash(newPassword, 12);
  await run('UPDATE users SET password=? WHERE id=?', [newHash, account.id]);
  await run('DELETE FROM password_resets WHERE email=?', [account.email]);
  // Renova a sessão e o CSRF para esta conta após uma alteração sensível.
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.user = { id: account.id, username: account.username, email: account.email };
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.save(error => error ? next(error) : res.json({ success: true, message: 'Senha alterada com sucesso!' }));
  });
}));

app.get('/perfil', requireLogin, withErrors((req, res) => renderProfile(req, res, req.session.user.username)));
app.get('/perfil/:username', requireLogin, withErrors((req, res) => renderProfile(req, res, req.params.username)));
app.post('/api/perfil', requireLogin, withErrors(async (req, res) => {
  const displayName = clean(req.body.display_name), bio = clean(req.body.bio);
  if (displayName.length > 60 || bio.length > 300) return res.status(400).json({ success: false, message: 'Nome (máx. 60) ou bio (máx. 300) muito longo.' });
  await run('UPDATE users SET display_name=?, bio=? WHERE id=?', [displayName, bio, req.session.user.id]);
  res.json({ success: true, display_name: displayName, bio });
}));

const storage = multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || ''}`) });
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 }, fileFilter: (req, file, cb) => ({ 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 })[file.mimetype] ? cb(null, true) : cb(new Error('Envie apenas JPG, PNG, WebP ou GIF.')) });
// Fotos de perfil são mantidas em diretório separado para não misturar com posts.
// O servidor controla o nome do arquivo e valida o conteúdo antes de gravar no banco.
const avatarStorage = multer.diskStorage({
  destination: AVATAR_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || ''}`)
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 3 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => ({ 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 })[file.mimetype] ? cb(null, true) : cb(new Error('Envie apenas JPG, PNG, WebP ou GIF.')) });
const safeDeleteAvatar = avatar => removeMedia(avatar, 'avatars');
function isRealImage(filepath, type) {
  const b = Buffer.alloc(16); const fd = fs.openSync(filepath, 'r');
  try { fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6));
  if (type === 'image/webp') return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
// Stories: fotos por 24 horas. Arquivos gerados pelo servidor, sem nome enviado pelo usuário.
const storyStorage = multer.diskStorage({
  destination: STORY_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || ''}`)
});
const uploadStory = multer({ storage: storyStorage, limits: { fileSize: 5*1024*1024, files: 1, fields: 2 },
  fileFilter: (req, file, cb) => ({ 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 })[file.mimetype]
    ? cb(null, true) : cb(new Error('Envie apenas JPG, PNG, WebP ou GIF.')) });
app.get('/api/stories', requireLogin, withErrors(async (req, res) => {
  await purgeExpiredStories();
  res.setHeader('Cache-Control','no-store');
  const stories = await all(`SELECT s.id,s.image_path,s.caption,s.created_at,s.expires_at,
    u.username,u.avatar,s.user_id,
    EXISTS(SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.user_id=?) AS seen,
    (SELECT COUNT(*) FROM story_views v WHERE v.story_id=s.id) AS views
    FROM stories s JOIN users u ON u.id=s.user_id
    WHERE s.expires_at>datetime('now')
    ORDER BY s.id DESC LIMIT 150`, [req.session.user.id]);
  res.json({ success: true, stories: stories.map(s => ({ ...s, own: s.user_id === req.session.user.id, views: s.user_id === req.session.user.id ? s.views : undefined })) });
}));
app.post('/api/stories', requireLogin,
  (req, res, next) => uploadStory.single('imagem')(req,res,err => err ? next(err) : next()),
  withErrors(async (req, res) => {
    const caption = clean(req.body.legenda);
    const file = req.file;
    const fail = async (status, message) => {
      if (file) await fs.promises.unlink(file.path).catch(() => {});
      return res.status(status).json({ success: false, message });
    };
    if (!file) return fail(400, 'Escolha uma foto para seu Story.');
    if (caption.length > 200) return fail(400, 'Legenda deve ter até 200 caracteres.');
    if (!isRealImage(file.path,file.mimetype)) return fail(400,'Imagem inválida.');
    const count = await get("SELECT COUNT(*) AS count FROM stories WHERE user_id=? AND expires_at>datetime('now')", [req.session.user.id]);
    if (count.count >= 20) return fail(429,'Limite de 20 Stories ativos por usuário.');
    try {
      const imagePath = await saveMedia(file, 'stories');
      try {
        const result = await run("INSERT INTO stories(user_id,image_path,caption,expires_at) VALUES(?,?,?,datetime('now','+24 hours'))",
          [req.session.user.id,imagePath,caption]);
        res.status(201).json({ success: true, id: result.lastID, message: 'Story publicado por 24 horas!' });
      } catch (dbError) { await removeMedia(imagePath, 'stories'); throw dbError; }
    } catch (error) { await fs.promises.unlink(file.path).catch(() => {}); throw error; }
  }));
app.post('/api/stories/:id/view', requireLogin, withErrors(async (req,res) => {
  if (!validId(req.params.id)) return res.sendStatus(404);
  const story = await get("SELECT id,user_id FROM stories WHERE id=? AND expires_at>datetime('now')", [req.params.id]);
  if (!story) return res.sendStatus(404);
  if (story.user_id !== req.session.user.id) await run('INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(?,?)',[story.id,req.session.user.id]);
  res.json({ success: true });
}));
app.delete('/api/stories/:id', requireLogin, withErrors(async (req,res) => {
  if (!validId(req.params.id)) return res.sendStatus(404);
  const story = await get('SELECT image_path FROM stories WHERE id=? AND user_id=?',[req.params.id,req.session.user.id]);
  if (!story) return res.sendStatus(404);
  await run('DELETE FROM stories WHERE id=?',[req.params.id]);
  await removeMedia(story.image_path, 'stories');
  res.json({ success: true });
}));

app.post('/api/perfil/avatar', requireLogin,
  (req, res, next) => uploadAvatar.single('avatar')(req, res, err => err ? next(err) : next()),
  withErrors(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Escolha uma foto de perfil.' });
    if (!isRealImage(req.file.path, req.file.mimetype)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'O arquivo não é uma imagem válida.' });
    }
    try {
      const old = await get('SELECT avatar FROM users WHERE id=?', [req.session.user.id]);
      const newImage = await saveMedia(req.file, 'avatars');
      try { await run('UPDATE users SET avatar=? WHERE id=?', [newImage, req.session.user.id]); }
      catch (dbError) { await removeMedia(newImage, 'avatars'); throw dbError; }
      await safeDeleteAvatar(old?.avatar);
      res.json({ success: true, avatar: newImage, message: 'Foto de perfil atualizada!' });
    } catch (e) { await fs.promises.unlink(req.file.path).catch(() => {}); throw e; }
  })
);
app.post('/api/perfil/avatar/remover', requireLogin, withErrors(async (req, res) => {
  const old = await get('SELECT avatar FROM users WHERE id=?', [req.session.user.id]);
  await run('UPDATE users SET avatar=NULL WHERE id=?', [req.session.user.id]);
  await safeDeleteAvatar(old?.avatar);
  res.json({ success: true, avatar: '/img/default-avatar.svg', message: 'Foto removida.' });
}));

app.post('/postar', requireLogin, (req, res, next) => upload.single('imagem')(req, res, err => err ? next(err) : next()), withErrors(async (req, res) => {
  const legenda = clean(req.body.legenda);
  const pathname = req.file?.path;
  const fail = (status, message) => { if (pathname) fs.promises.unlink(pathname).catch(() => {}); return res.status(status).json({ success: false, message }); };
  if (!req.file || !legenda || legenda.length > 2000) return fail(400, 'Selecione uma imagem e uma legenda (até 2.000 caracteres).');
  if (!isRealImage(pathname, req.file.mimetype)) return fail(400, 'O arquivo não é uma imagem válida.');
  try {
    const imagePath = await saveMedia(req.file, 'posts');
    try { await run('INSERT INTO posts(imagem,legenda,usuario) VALUES(?,?,?)', [imagePath, legenda, req.session.user.username]); }
    catch (dbError) { await removeMedia(imagePath, 'posts'); throw dbError; }
  } catch (e) { await fs.promises.unlink(pathname).catch(() => {}); throw e; }
  res.json({ success: true, message: 'Publicação criada.' });
}));
app.post('/deletar-post/:id', requireLogin, withErrors(async (req, res) => {
  const post = validId(req.params.id) && await get('SELECT * FROM posts WHERE id=? AND usuario=?', [req.params.id, req.session.user.username]);
  if (!post) return res.status(404).send('Publicação não encontrada ou não autorizada.');
  await run('DELETE FROM posts WHERE id=?', [post.id]);
  await removeMedia(post.imagem, 'posts');
  res.redirect('/perfil');
}));
app.post('/api/posts/:id/archive', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id)) return res.sendStatus(404);
  const p = await get('SELECT id,archived FROM posts WHERE id=? AND usuario=?', [req.params.id, req.session.user.username]);
  if (!p) return res.sendStatus(404);
  await run('UPDATE posts SET archived=? WHERE id=?', [p.archived ? 0 : 1, p.id]);
  res.json({ success: true, archived: !p.archived });
}));

app.post('/api/posts/:id/like', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id) || !await get('SELECT 1 FROM posts WHERE id=? AND archived=0', [req.params.id])) return res.sendStatus(404);
  const params = [req.session.user.id, req.params.id];
  const previous = await get('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?', params);
  if (previous) await run('DELETE FROM post_likes WHERE user_id=? AND post_id=?', params);
  else await run('INSERT INTO post_likes(user_id,post_id) VALUES(?,?)', params);
  if (!previous) {
    const post = await get('SELECT u.id FROM posts p JOIN users u ON u.username=p.usuario COLLATE NOCASE WHERE p.id=?',[req.params.id]);
    await notify(post?.id,req.session.user,'like','curtiu sua publicação.',`/post/${req.params.id}`);
  }
  const count = await get('SELECT COUNT(*) AS count FROM post_likes WHERE post_id=?', [req.params.id]);
  res.json({ success: true, liked: !previous, count: count.count });
}));
app.post('/api/posts/:id/save', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id) || !await get('SELECT 1 FROM posts WHERE id=? AND archived=0', [req.params.id])) return res.sendStatus(404);
  const params = [req.session.user.id, req.params.id];
  const previous = await get('SELECT 1 FROM saved_posts WHERE user_id=? AND post_id=?', params);
  if (previous) await run('DELETE FROM saved_posts WHERE user_id=? AND post_id=?', params);
  else await run('INSERT INTO saved_posts(user_id,post_id) VALUES(?,?)', params);
  res.json({ success: true, saved: !previous });
}));
app.get('/api/posts/:id/comments', requireLogin, withErrors(async (req, res) => {
  if (!validId(req.params.id) || !await get('SELECT 1 FROM posts WHERE id=? AND archived=0', [req.params.id])) return res.sendStatus(404);
  const comments = await all('SELECT c.id,c.conteudo,c.criado_em,u.username,u.avatar FROM comments c INNER JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id ASC LIMIT 100', [req.params.id]);
  res.json({ success: true, comments });
}));
app.post('/api/posts/:id/comments', requireLogin, withErrors(async (req, res) => {
  const content = clean(req.body.conteudo);
  if (!content || content.length > 1000) return res.status(400).json({ success: false, message: 'Comentário: 1 a 1.000 caracteres.' });
  if (!validId(req.params.id) || !await get('SELECT 1 FROM posts WHERE id=? AND archived=0', [req.params.id])) return res.sendStatus(404);
  await run('INSERT INTO comments(post_id,user_id,conteudo) VALUES(?,?,?)', [req.params.id, req.session.user.id, content]);
  const post = await get('SELECT u.id FROM posts p JOIN users u ON u.username=p.usuario COLLATE NOCASE WHERE p.id=?',[req.params.id]);
  await notify(post?.id,req.session.user,'comment','comentou sua publicação.',`/post/${req.params.id}`);
  const count = await get('SELECT COUNT(*) AS count FROM comments WHERE post_id=?', [req.params.id]);
  res.status(201).json({ success: true, count: count.count });
}));
app.post('/api/follow/:username', requireLogin, withErrors(async (req, res) => {
  const other = await get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [req.params.username]);
  if (!other || other.id === req.session.user.id) return res.status(400).json({ success: false, message: 'Não é possível seguir este usuário.' });
  const ids = [req.session.user.id, other.id];
  const previous = await get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?', ids);
  if (previous) await run('DELETE FROM follows WHERE follower_id=? AND following_id=?', ids);
  else await run('INSERT INTO follows(follower_id, following_id) VALUES(?,?)', ids);
  if (!previous) await notify(other.id,req.session.user,'follow','começou a seguir você.',`/perfil/${encodeURIComponent(req.session.user.username)}`);
  const count = await get('SELECT COUNT(*) AS count FROM follows WHERE following_id=?', [other.id]);
  res.json({ success: true, following: !previous, followers: count.count });
}));

const CONTACTS_QUERY = `SELECT t.contato,u.avatar FROM (SELECT DISTINCT CASE WHEN remetente=? THEN destinatario ELSE remetente END AS contato FROM messages WHERE remetente=? OR destinatario=?) t LEFT JOIN users u ON u.username=t.contato COLLATE NOCASE ORDER BY t.contato`;
const MESSAGES_QUERY = `SELECT id,remetente,destinatario,conteudo,enviado_em FROM messages WHERE (remetente=? AND destinatario=?) OR (remetente=? AND destinatario=?) ORDER BY id DESC LIMIT 150`;
async function contactsFor(username) { return all(CONTACTS_QUERY, [username,username,username]); }
async function messagesFor(username, other) { return (await all(MESSAGES_QUERY, [username,other,other,username])).reverse(); }
app.get('/mensagens', requireLogin, withErrors(async (req, res) => res.render('mensagens', { mensagens: [], usuarioLogado: req.session.user.username, myAvatar: await userAvatar(req.session.user.id), destinatario: null, destinatarioAvatar: null, contatos: await contactsFor(req.session.user.username), currentPage: 'mensagens' })));
app.get('/mensagens/:destinatario', requireLogin, withErrors(async (req, res) => {
  const name = req.params.destinatario, current = req.session.user.username;
  if (name.toLowerCase() === current.toLowerCase()) return res.redirect('/mensagens');
  const user = await get('SELECT username,avatar FROM users WHERE username=? COLLATE NOCASE', [name]);
  if (!user) return res.status(404).send('Usuário não encontrado.');
  res.render('mensagens', { mensagens: await messagesFor(current,user.username), usuarioLogado: current, myAvatar: await userAvatar(req.session.user.id), destinatario: user.username, destinatarioAvatar: user.avatar || '/img/default-avatar.svg', contatos: await contactsFor(current), currentPage: 'mensagens' });
}));
app.get('/api/mensagens/:destinatario', requireLogin, withErrors(async (req, res) => {
  const name = req.params.destinatario, current = req.session.user.username;
  const user = await get('SELECT username FROM users WHERE username=? COLLATE NOCASE', [name]);
  if (!user || name.toLowerCase() === current.toLowerCase()) return res.sendStatus(404);
  res.json({ success: true, mensagens: await messagesFor(current,user.username) });
}));
app.post('/mensagens', requireLogin, withErrors(async (req, res) => {
  const name = clean(req.body.destinatario), content = clean(req.body.conteudo);
  if (!content || content.length > 2000) return res.status(400).json({ success: false, message: 'Mensagem deve ter de 1 a 2.000 caracteres.' });
  const user = await get('SELECT id,username FROM users WHERE username=? COLLATE NOCASE', [name]);
  if (!user || user.username.toLowerCase() === req.session.user.username.toLowerCase()) return res.status(400).json({ success: false, message: 'Destinatário inválido.' });
  await run('INSERT INTO messages(remetente,destinatario,conteudo) VALUES(?,?,?)', [req.session.user.username,user.username,content]);
  await notify(user.id,req.session.user,'message','enviou uma mensagem.',`/mensagens/${encodeURIComponent(req.session.user.username)}`);
  if (isJsonRequest(req)) return res.status(201).json({ success: true });
  res.redirect('/mensagens/' + encodeURIComponent(user.username));
}));
app.post('/atualizar-ativo', requireLogin, withErrors(async (req, res) => { await run("UPDATE users SET ultimo_ativo=datetime('now') WHERE id=?", [req.session.user.id]); res.json({ success: true }); }));
app.get('/online-users', requireLogin, withErrors(async (req, res) => {
  const rows = await all(`SELECT u.username,u.avatar,CASE WHEN u.ultimo_ativo >= datetime('now','-1 minute') THEN 'online' WHEN u.ultimo_ativo >= datetime('now','-5 minutes') THEN 'away' ELSE 'offline' END AS status,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) AS following FROM users u WHERE u.id<>? ORDER BY CASE WHEN u.ultimo_ativo >= datetime('now','-1 minute') THEN 0 ELSE 1 END,u.username LIMIT 30`, [req.session.user.id,req.session.user.id]);
  res.json(rows);
}));
app.get('/conversas', requireLogin, withErrors(async (req, res) => res.json(await contactsFor(req.session.user.username))));

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
app.post('/recuperar-senha', limitAttempts('recovery', 8), withErrors(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Informe um e-mail válido.' });
  if (IN_PRODUCTION) return res.status(503).json({ success: false, message: 'Recuperação por e-mail ainda precisa ser configurada no servidor.' });
  const user = await get('SELECT id FROM users WHERE email=? COLLATE NOCASE', [email]);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await run('DELETE FROM password_resets WHERE email=?', [email]);
    await run('INSERT INTO password_resets(email,token,expires_at) VALUES(?,?,?)', [email,tokenHash(token),new Date(Date.now() + 30*60*1000).toISOString()]);
    console.log(`[DESENVOLVIMENTO] Link de recuperação: http://localhost:${PORT}/resetar-senha?token=${token}`);
  }
  res.json({ success: true, message: 'Se a conta existir, o link foi exibido no terminal do servidor (modo de desenvolvimento).' });
}));
app.get('/resetar-senha', withErrors(async (req, res) => {
  const token = clean(req.query.token);
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).send('Link inválido.');
  const row = await get('SELECT id FROM password_resets WHERE token=? AND expires_at>?', [tokenHash(token),new Date().toISOString()]);
  if (!row) return res.status(400).send('Link inválido ou expirado.');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.render('resetar-senha', { token });
}));
app.post('/resetar-senha', withErrors(async (req, res) => {
  const token = clean(req.body.token), password = req.body.password;
  if (!validPassword(password)) return res.status(400).json({ success: false, message: 'Senha: 8 a 128 caracteres.' });
  if (password !== req.body.confirmPassword) return res.status(400).json({ success: false, message: 'As senhas não coincidem.' });
  const row = /^[a-f0-9]{64}$/.test(token) && await get('SELECT * FROM password_resets WHERE token=? AND expires_at>?', [tokenHash(token),new Date().toISOString()]);
  if (!row) return res.status(400).json({ success: false, message: 'Link inválido ou expirado.' });
  await run('UPDATE users SET password=? WHERE email=?', [await bcrypt.hash(password,10),row.email]);
  await run('DELETE FROM password_resets WHERE email=?', [row.email]);
  res.json({ success: true, message: 'Senha atualizada com sucesso.' });
}));

app.use((err, req, res, next) => {
  if (!(err instanceof multer.MulterError) && !err.message?.startsWith('Envie apenas')) console.error('Erro EchoNet:', err);
  if (err instanceof multer.MulterError || (err.message && err.message.startsWith('Envie apenas'))) return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? (req.path === '/api/perfil/avatar' ? 'Foto de perfil deve ter no máximo 3 MB.' : 'Imagem deve ter no máximo 5 MB.') : (err.message || 'Erro ao enviar imagem.') });
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Dados muito grandes.' });
  res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
});

if (require.main === module) initialize().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EchoNet em http://localhost:${PORT}`);
    const storyCleanupTimer = setInterval(() => purgeExpiredStories().catch(e => console.error('Erro ao limpar Stories:',e)), 60*60*1000);
    storyCleanupTimer.unref();
    for (const list of Object.values(os.networkInterfaces())) for (const iface of list || []) if (iface.family === 'IPv4' && !iface.internal) console.log(`Rede local: http://${iface.address}:${PORT}`);
    if (!IN_PRODUCTION) console.log('Modo desenvolvimento. Configure SESSION_SECRET antes de publicar.');
  });
}).catch(err => { console.error('Erro ao inicializar banco:', err); process.exitCode = 1; });
module.exports = { app, initialize, db };
