'use strict';
// Nósverso — Sinais 2.0. Endpoints isolados, sem alterar o envio legado.
const EMOJIS = Object.freeze(['❤️', '😂', '😮', '😢', '👏', '🔥']);
function register({ app, run, get, all, requireLogin, withErrors, clean, validId, notify, usingPostgres, postgresPool }) {
  const activity = new Map(); // Indicador efêmero por instância; expira automaticamente.
  const validMessageId = value => validId(value) && Number.isSafeInteger(Number(value));
  const pair = (a, b) => [a, b, b, a];
  const sameConversation = '(remetente=? AND destinatario=?) OR (remetente=? AND destinatario=?)';
  async function peerFor(req) {
    const name = String(req.params.destinatario || '');
    if (name.length > 80) return null;
    const user = await get('SELECT id,username FROM users WHERE username=? COLLATE NOCASE', [name]);
    if (!user || String(user.username).toLowerCase() === String(req.session.user.username).toLowerCase()) return null;
    return user;
  }
  async function initialize() {
    if (usingPostgres) {
      await postgresPool.query(`
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES public.messages(id) ON DELETE SET NULL;
        CREATE TABLE IF NOT EXISTS public.message_reactions (
          message_id INTEGER NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          PRIMARY KEY (message_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sinais_reactions_message ON public.message_reactions(message_id);
        ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
      `);
    } else {
      const fields = await all('PRAGMA table_info(messages)');
      if (!fields.some(f => f.name === 'reply_to_id')) {
        await run('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL');
      }
      await run(`CREATE TABLE IF NOT EXISTS message_reactions (
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      )`);
      await run('CREATE INDEX IF NOT EXISTS idx_sinais_reactions_message ON message_reactions(message_id)');
    }
  }
  app.get('/api/sinais/:destinatario', requireLogin, withErrors(async (req, res) => {
    const peer = await peerFor(req);
    if (!peer) return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
    res.setHeader('Cache-Control', 'no-store');
    const current = req.session.user.username;
    const rows = await all(`SELECT m.id,m.remetente,m.destinatario,m.conteudo,m.enviado_em,
      m.reply_to_id,p.conteudo AS reply_conteudo,p.remetente AS reply_remetente
      FROM messages m LEFT JOIN messages p ON p.id=m.reply_to_id AND
      ((p.remetente=m.remetente AND p.destinatario=m.destinatario) OR
       (p.remetente=m.destinatario AND p.destinatario=m.remetente))
      WHERE ${sameConversation.replace(/\bremetente\b/g, 'm.remetente').replace(/\bdestinatario\b/g, 'm.destinatario')}
      ORDER BY m.id DESC LIMIT 150`, pair(current, peer.username));
    rows.reverse();
    const ids = rows.map(r => Number(r.id));
    const reactions = ids.length ? await all(
      `SELECT r.message_id,r.user_id,r.emoji FROM message_reactions r WHERE r.message_id IN (${ids.map(() => '?').join(',')})`, ids
    ) : [];
    const byMessage = new Map();
    for (const r of reactions) {
      if (!EMOJIS.includes(r.emoji)) continue;
      let stats = byMessage.get(Number(r.message_id));
      if (!stats) { stats = new Map(); byMessage.set(Number(r.message_id), stats); }
      const rec = stats.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      rec.count++;
      if (Number(r.user_id) === Number(req.session.user.id)) rec.mine = true;
      stats.set(r.emoji, rec);
    }
    const messages = rows.map(r => ({ ...r, reactions: Array.from(byMessage.get(Number(r.id))?.values() || []) }));
    const key = `${peer.id}:${req.session.user.id}`;
    const expiry = activity.get(key) || 0;
    if (expiry && expiry <= Date.now()) activity.delete(key);
    res.json({ success: true, mensagens: messages, digitando: expiry > Date.now() });
  }));
  app.post('/api/sinais/:destinatario/mensagem', requireLogin, withErrors(async (req, res) => {
    const peer = await peerFor(req);
    if (!peer) return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
    const conteudo = clean(req.body?.conteudo);
    if (!conteudo || conteudo.length > 2000) return res.status(400).json({ success: false, message: 'Mensagem deve ter de 1 a 2.000 caracteres.' });
    const raw = req.body?.reply_to_id;
    let parentId = null;
    if (raw !== undefined && raw !== null && raw !== '') {
      if (!validMessageId(raw)) return res.status(400).json({ success: false, message: 'Resposta inválida.' });
      parentId = Number(raw);
      const original = await get(`SELECT id FROM messages WHERE id=? AND (${sameConversation})`, [parentId, ...pair(req.session.user.username, peer.username)]);
      if (!original) return res.status(400).json({ success: false, message: 'Mensagem de resposta não pertence a esta conversa.' });
    }
    const result = await run('INSERT INTO messages(remetente,destinatario,conteudo,reply_to_id) VALUES(?,?,?,?)',
      [req.session.user.username, peer.username, conteudo, parentId]);
    activity.delete(`${req.session.user.id}:${peer.id}`);
    await notify(peer.id, req.session.user, 'message', 'enviou uma mensagem.', `/mensagens/${encodeURIComponent(req.session.user.username)}`);
    res.status(201).json({ success: true, id: result.lastID });
  }));
  app.post('/api/sinais/:destinatario/reacao', requireLogin, withErrors(async (req, res) => {
    const peer = await peerFor(req);
    if (!peer) return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
    const raw = req.body?.message_id;
    const emoji = req.body?.emoji;
    if (!validMessageId(raw) || !EMOJIS.includes(emoji)) return res.status(400).json({ success: false, message: 'Reação inválida.' });
    const id = Number(raw);
    const original = await get(`SELECT id FROM messages WHERE id=? AND (${sameConversation})`, [id, ...pair(req.session.user.username, peer.username)]);
    if (!original) return res.status(404).json({ success: false, message: 'Mensagem não encontrada.' });
    const old = await get('SELECT emoji FROM message_reactions WHERE message_id=? AND user_id=?', [id, req.session.user.id]);
    if (old?.emoji === emoji) {
      await run('DELETE FROM message_reactions WHERE message_id=? AND user_id=?', [id, req.session.user.id]);
    } else if (old) {
      await run('UPDATE message_reactions SET emoji=? WHERE message_id=? AND user_id=?', [emoji, id, req.session.user.id]);
    } else {
      // Mantém uma reação por pessoa e mensagem; evita duplicação em cliques concorrentes.
      await run('INSERT OR IGNORE INTO message_reactions(message_id,user_id,emoji) VALUES(?,?,?)', [id, req.session.user.id, emoji]);
      await run('UPDATE message_reactions SET emoji=? WHERE message_id=? AND user_id=?', [emoji, id, req.session.user.id]);
    }
    res.json({ success: true, reacted: old?.emoji !== emoji });
  }));
  app.post('/api/sinais/:destinatario/digitando', requireLogin, withErrors(async (req, res) => {
    const peer = await peerFor(req);
    if (!peer) return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
    const key = `${req.session.user.id}:${peer.id}`;
    if (req.body?.digitando === true) activity.set(key, Date.now() + 6500);
    else activity.delete(key);
    if (activity.size > 4000) for (const [k, expires] of activity) if (expires <= Date.now()) activity.delete(k);
    res.json({ success: true });
  }));
  return { initialize };
}
module.exports = { register };
