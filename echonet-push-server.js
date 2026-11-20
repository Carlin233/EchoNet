'use strict';
/* EchoNet 2.0 — Web Push seguro para PostgreSQL (Supabase), SQLite e libSQL.
   O arquivo nao contem chaves; use variaveis privadas no Render. */

let webpush = null;
try { webpush = require('web-push'); } catch (_) { /* instalacao pendente */ }

const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = (process.env.VAPID_SUBJECT || '').trim();
let configured = false;
if (webpush && PUBLIC_KEY && PRIVATE_KEY && /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(SUBJECT)) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (error) {
    console.warn('[EchoNet Push] VAPID invalido; notificacoes push desativadas.');
  }
}

function allowedEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || endpoint.length < 15) return false;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash) return false;
    const host = u.hostname.toLowerCase();
    // Lista restrita de gateways Push para evitar que o servidor acesse URLs arbitrarias.
    return host === 'fcm.googleapis.com' || host === 'android.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com');
  } catch (_) { return false; }
}

function safeInternalUrl(url) {
  return typeof url === 'string' && url.length <= 400 &&
    url.startsWith('/') && !url.startsWith('//') && !/[\\\u0000-\u001f]/.test(url) ? url : '/';
}

function validSubscription(subscription) {
  return subscription && typeof subscription === 'object' && allowedEndpoint(subscription.endpoint) &&
    subscription.keys && typeof subscription.keys === 'object' &&
    typeof subscription.keys.p256dh === 'string' && /^[A-Za-z0-9_-]{80,140}$/.test(subscription.keys.p256dh) &&
    typeof subscription.keys.auth === 'string' && /^[A-Za-z0-9_-]{16,50}$/.test(subscription.keys.auth);
}

function register({ app, run, all, requireLogin, withErrors, limitAttempts }) {
  let tablesPromise;
  async function ensureTables() {
    if (!tablesPromise) {
      tablesPromise = (async () => {
        await run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await run('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
      })().catch(err => { tablesPromise = undefined; throw err; });
    }
    return tablesPromise;
  }

  function noStore(req, res, next) { res.setHeader('Cache-Control', 'no-store'); next(); }

  app.get('/api/push/public-key', requireLogin, noStore, (req, res) => {
    if (!configured) return res.status(503).json({ success: false, message: 'Notificacoes push ainda nao configuradas no servidor.' });
    return res.json({ success: true, publicKey: PUBLIC_KEY, userId: req.session.user.id });
  });

  app.post('/api/push/subscribe', requireLogin, limitAttempts('push-subscribe', 25), noStore, withErrors(async (req, res) => {
    if (!configured) return res.status(503).json({ success: false, message: 'Ative as chaves VAPID no Render.' });
    const subscription = req.body?.subscription;
    if (!validSubscription(subscription)) return res.status(400).json({ success: false, message: 'Inscricao de notificacoes invalida.' });
    await ensureTables();
    await run(`INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth)
      VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET
      user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, created_at=CURRENT_TIMESTAMP`, [
      subscription.endpoint, req.session.user.id, subscription.keys.p256dh, subscription.keys.auth
    ]);
    // Evita proliferacao de inscricoes antigas por conta. Ate 8 dispositivos.
    const devices = await all('SELECT endpoint FROM push_subscriptions WHERE user_id=? ORDER BY created_at DESC', [req.session.user.id]);
    for (const old of devices.slice(8)) {
      await run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.session.user.id, old.endpoint]);
    }
    return res.json({ success: true, message: 'Notificacoes ativadas.' });
  }));

  app.post('/api/push/unsubscribe', requireLogin, noStore, withErrors(async (req, res) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return res.status(400).json({ success: false, message: 'Inscricao invalida.' });
    await ensureTables();
    await run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.session.user.id, endpoint]);
    return res.json({ success: true, message: 'Notificacoes desativadas neste aparelho.' });
  }));

  async function send(recipientId, notification) {
    if (!configured || !recipientId) return;
    await ensureTables();
    const rows = await all('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? LIMIT 8', [recipientId]);
    const payload = JSON.stringify({
      title: 'EchoNet',
      body: String(notification?.body || 'Voce tem uma nova notificacao.').slice(0, 180),
      url: safeInternalUrl(notification?.url),
      tag: `echonet-${String(notification?.kind || 'activity').slice(0, 25)}-${String(notification?.id || Date.now()).slice(0, 24)}`
    });
    const results = await Promise.allSettled(rows.map(async row => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
          TTL: 3600, urgency: 'normal'
        });
      } catch (error) {
        if ([404, 410].includes(Number(error?.statusCode))) {
          await run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [recipientId, row.endpoint]);
        } else {
          console.warn('[EchoNet Push] Falha de entrega. Codigo:', Number(error?.statusCode) || 'indisponivel');
        }
      }
    }));
    return results.length;
  }
  return { send, ensureTables, enabled: configured };
}

module.exports = { register, allowedEndpoint, validSubscription, safeInternalUrl };
