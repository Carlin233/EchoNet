'use strict';
(() => {
  const panel = document.getElementById('notificationsPanel');
  const backdrop = document.getElementById('notificationsBackdrop');
  const list = document.getElementById('notificationsItems');
  const toastHost = document.getElementById('notificationToasts');
  const soundToggle = document.getElementById('notificationsSoundToggle');
  const triggers = [...document.querySelectorAll('.notification-trigger')];
  if (!panel || !list || !triggers.length) return;

  const icons = { like: 'fa-heart', comment: 'fa-comment', follow: 'fa-user-plus', message: 'fa-paper-plane' };
  const node = (tag, cls, content) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  const safeUrl = url => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') ? url : '/';
  let fetching = false;
  let refreshPending = false;
  let initialLoadComplete = false;
  let maxSeenId = 0;
  let soundOn = true;
  let audioContext;
  try { soundOn = localStorage.getItem('echonet-notification-sound') !== 'off'; } catch { /* storage indisponível */ }

  function syncSoundToggle() {
    if (!soundToggle) return;
    soundToggle.textContent = soundOn ? '🔊 Som ligado' : '🔇 Som desligado';
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.title = 'Ativar ou silenciar o som de novas notificações';
  }
  function unlockSound() {
    if (!soundOn) return;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    try {
      if (!audioContext) audioContext = new AudioContextType();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* Navegadores podem bloquear som antes de uma interação. */ }
  }
  // Navegadores exigem interação do usuário para liberar áudio.
  window.addEventListener('pointerdown', unlockSound, { passive: true });
  window.addEventListener('keydown', unlockSound);
  function playSound() {
    if (!soundOn || !audioContext || audioContext.state !== 'running') return;
    try {
      const now = audioContext.currentTime;
      // Dois tons originais e discretos, gerados localmente; nenhum arquivo externo.
      [0, 0.13].forEach((offset, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(index ? 880 : 659.25, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.045, now + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.23);
      });
    } catch (error) { console.warn('Som da notificação indisponível:', error.message); }
  }
  syncSoundToggle();
  soundToggle?.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('echonet-notification-sound', soundOn ? 'on' : 'off'); } catch {}
    syncSoundToggle();
    if (soundOn) unlockSound();
  });

  function setCount(count) {
    const unread = Number(count) || 0;
    triggers.forEach(button => {
      const badge = button.querySelector('.notification-badge');
      if (!badge) return;
      badge.hidden = unread < 1;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      button.setAttribute('aria-label', unread ? `Notificações: ${unread} não lidas` : 'Abrir notificações');
    });
  }
  async function navigateToNotification(item, link) {
    if (!item.read_at) {
      try { await window.echoRequest(`/api/notifications/${item.id}/read`, { method: 'POST' }); }
      catch (error) { console.warn('Falha ao marcar notificação como lida:', error.message); }
    }
    window.location.assign(link);
  }
  function render(notifications) {
    list.replaceChildren();
    if (!notifications.length) {
      list.append(node('p', 'notifications-empty', 'Você ainda não recebeu notificações.'));
      return;
    }
    notifications.forEach(item => {
      const link = node('a', 'notification-row' + (item.read_at ? '' : ' is-unread'));
      link.href = safeUrl(item.target_url);
      const avatar = node('img', 'notification-avatar');
      avatar.src = item.actor_avatar || '/img/default-avatar.svg';
      avatar.alt = '';
      const text = node('span', 'notification-text');
      const message = node('span', 'notification-message', item.message);
      const when = node('small', 'notification-date');
      const rawDate = String(item.created_at || '');
      const date = rawDate ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(rawDate) ? rawDate : rawDate.replace(' ', 'T') + 'Z') : null;
      when.textContent = date && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const badge = node('i', `fa-solid ${icons[item.kind] || 'fa-bell'} notification-kind`);
      badge.setAttribute('aria-hidden', 'true');
      text.append(message, when);
      link.append(avatar, text, badge);
      link.addEventListener('click', async event => {
        event.preventDefault();
        await navigateToNotification(item, link.href);
      });
      list.append(link);
    });
  }
  function showToast(item) {
    if (!toastHost) return;
    const toast = node('div', 'notification-toast');
    const avatar = node('img', 'notification-toast-avatar');
    avatar.src = item.actor_avatar || '/img/default-avatar.svg';
    avatar.alt = '';
    const body = node('div', 'notification-toast-body');
    const heading = node('strong', 'notification-toast-heading', 'Nova notificação');
    const message = node('span', 'notification-toast-message', item.message);
    body.append(heading, message);
    const open = node('a', 'notification-toast-open', 'Ver');
    open.href = safeUrl(item.target_url);
    open.addEventListener('click', async event => {
      event.preventDefault();
      await navigateToNotification(item, open.href);
    });
    const close = node('button', 'notification-toast-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dispensar notificação');
    close.addEventListener('click', () => toast.remove());
    toast.append(avatar, body, open, close);
    toastHost.prepend(toast);
    while (toastHost.children.length > 3) toastHost.lastElementChild.remove();
    setTimeout(() => toast.remove(), 7000);
  }
  async function refresh() {
    if (fetching) { refreshPending = true; return; }
    fetching = true;
    try {
      const data = await window.echoRequest('/api/notifications');
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      setCount(data.unread);
      if (!panel.hidden) render(notifications);
      const highest = notifications.reduce((n, item) => Math.max(n, Number(item.id) || 0), maxSeenId);
      if (initialLoadComplete) {
        // Não notifica itens antigos na primeira abertura ou eventos de "marcar como lida".
        const fresh = notifications.filter(item => !item.read_at && Number(item.id) > maxSeenId);
        if (fresh.length && !document.hidden) {
          // Mostra as duas notificações mais recentes para evitar uma enxurrada de pop-ups.
          fresh.slice(0, 2).reverse().forEach(showToast);
          playSound();
        }
      }
      maxSeenId = highest;
      initialLoadComplete = true;
    } catch (error) {
      if (!panel.hidden) list.replaceChildren(node('p', 'notifications-empty', 'Não foi possível carregar as notificações.'));
      console.warn('Notificações:', error.message);
    } finally {
      fetching = false;
      if (refreshPending) {
        refreshPending = false;
        refresh();
      }
    }
  }
  function closePanel() {
    panel.hidden = true;
    backdrop.hidden = true;
    triggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
  }
  function openPanel() {
    panel.hidden = false;
    backdrop.hidden = false;
    triggers.forEach(t => t.setAttribute('aria-expanded', 'true'));
    refresh();
    document.getElementById('notificationsClose')?.focus();
  }
  triggers.forEach(t => t.addEventListener('click', () => panel.hidden ? openPanel() : closePanel()));
  document.getElementById('notificationsClose')?.addEventListener('click', closePanel);
  backdrop?.addEventListener('click', closePanel);
  document.getElementById('notificationsReadAll')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await window.echoRequest('/api/notifications/read-all', { method: 'POST' }); await refresh(); }
    catch (error) { alert(error.message); }
    finally { event.currentTarget.disabled = false; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  refresh();
  // A conexão SSE já existente avisa quando há novos eventos.
  if ('EventSource' in window) {
    const stream = new EventSource('/api/notifications/stream');
    stream.addEventListener('notifications', () => {
      refresh();
      window.dispatchEvent(new Event('echonet:new-notification'));
    });
    window.addEventListener('pagehide', () => stream.close(), { once: true });
  }
  // Se o SSE cair, consulta periódica garante atualização da sineta e do pop-up.
  setInterval(() => { if (!document.hidden) refresh(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
