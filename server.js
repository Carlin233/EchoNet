'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');

const app = express();
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const IN_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (IN_PRODUCTION ? '' : 'DEV_ONLY_CHANGE_THIS_ECHONET_SECRET');
if (!SESSION_SECRET || (IN_PRODUCTION && SESSION_SECRET.length < 32)) {
  throw new Error('Configure SESSION_SECRET com pelo menos 32 caracteres para produção.');
}
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'database.sqlite');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const db = new sqlite3.Database(DB_PATH);
db.configure('busyTimeout', 5000);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function initialize() {
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA foreign_keys = ON');
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
const safeDate = str => str ? new Date(String(str).replace(' ', 'T') + (String(str).includes('Z') ? '' : 'Z')).toLocaleDateString('pt-BR') : '';
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
  } catch (e) { if (e.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ success: false, message: 'Usuário ou e-mail já está cadastrado.' }); throw e; }
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
  const savedPosts = me ? await listPosts(req.session.user.id, 'INNER JOIN saved_posts s ON s.post_id=p.id AND s.user_id=? WHERE p.archived=0 ORDER BY s.rowid DESC LIMIT 100', [req.session.user.id]) : [];
  const archivedPosts = me ? await listPosts(req.session.user.id, 'WHERE p.usuario=? AND p.archived=1 ORDER BY p.id DESC LIMIT 100', [owner.username]) : [];
  const follows = await get('SELECT (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers, (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following, EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=?) AS isFollowing', [owner.id, owner.id, req.session.user.id, owner.id]);
  res.render('perfil', { username: owner.username, owner, myAvatar: await userAvatar(req.session.user.id), viewer: req.session.user.username, isMine: me, posts, savedPosts, archivedPosts, follows, currentPage: 'perfil' });
}
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
const safeDeleteAvatar = avatar => {
  // Nunca remove arquivos de publicações, caminhos arbitrários ou avatar padrão.
  if (typeof avatar !== 'string' || !/^\/uploads\/avatars\/[a-zA-Z0-9_-]+\.(jpg|png|webp|gif)$/.test(avatar)) return Promise.resolve();
  return fs.promises.unlink(path.join(AVATAR_DIR, path.basename(avatar))).catch(() => {});
};
function isRealImage(filepath, type) {
  const b = Buffer.alloc(16); const fd = fs.openSync(filepath, 'r');
  try { fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6));
  if (type === 'image/webp') return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
app.post('/api/perfil/avatar', requireLogin,
  (req, res, next) => uploadAvatar.single('avatar')(req, res, err => err ? next(err) : next()),
  withErrors(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Escolha uma foto de perfil.' });
    const newImage = `/uploads/avatars/${req.file.filename}`;
    if (!isRealImage(req.file.path, req.file.mimetype)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'O arquivo não é uma imagem válida.' });
    }
    try {
      const old = await get('SELECT avatar FROM users WHERE id=?', [req.session.user.id]);
      await run('UPDATE users SET avatar=? WHERE id=?', [newImage, req.session.user.id]);
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
    await run('INSERT INTO posts(imagem,legenda,usuario) VALUES(?,?,?)', [`/uploads/${req.file.filename}`, legenda, req.session.user.username]);
  } catch (e) { await fs.promises.unlink(pathname).catch(() => {}); throw e; }
  res.json({ success: true, message: 'Publicação criada.' });
}));
app.post('/deletar-post/:id', requireLogin, withErrors(async (req, res) => {
  const post = validId(req.params.id) && await get('SELECT * FROM posts WHERE id=? AND usuario=?', [req.params.id, req.session.user.username]);
  if (!post) return res.status(404).send('Publicação não encontrada ou não autorizada.');
  await run('DELETE FROM posts WHERE id=?', [post.id]);
  const filename = path.basename(post.imagem || '');
  if (filename && post.imagem.startsWith('/uploads/')) await fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
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
  const user = await get('SELECT username FROM users WHERE username=? COLLATE NOCASE', [name]);
  if (!user || user.username.toLowerCase() === req.session.user.username.toLowerCase()) return res.status(400).json({ success: false, message: 'Destinatário inválido.' });
  await run('INSERT INTO messages(remetente,destinatario,conteudo) VALUES(?,?,?)', [req.session.user.username,user.username,content]);
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
  console.error('Erro EchoNet:', err);
  if (err instanceof multer.MulterError || (err.message && err.message.startsWith('Envie apenas'))) return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? (req.path === '/api/perfil/avatar' ? 'Foto de perfil deve ter no máximo 3 MB.' : 'Imagem deve ter no máximo 5 MB.') : (err.message || 'Erro ao enviar imagem.') });
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Dados muito grandes.' });
  res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
});

if (require.main === module) initialize().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EchoNet em http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces())) for (const iface of list || []) if (iface.family === 'IPv4' && !iface.internal) console.log(`Rede local: http://${iface.address}:${PORT}`);
    if (!IN_PRODUCTION) console.log('Modo desenvolvimento. Configure SESSION_SECRET antes de publicar.');
  });
}).catch(err => { console.error('Erro ao inicializar banco:', err); process.exitCode = 1; });
module.exports = { app, initialize, db };
