'use strict';
(() => {
  const panel = document.getElementById('notificationsPanel');
  const backdrop = document.getElementById('notificationsBackdrop');
  const list = document.getElementById('notificationsItems');
  const triggers = [...document.querySelectorAll('.notification-trigger')];
  if (!panel || !list || !triggers.length) return;
  let busy = false;
  const icons = { like: 'fa-heart', comment: 'fa-comment', follow: 'fa-user-plus', message: 'fa-paper-plane' };
  const node = (tag, cls, content) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (content !== undefined) element.textContent = String(content);
    return element;
  };
  function setCount(count) {
    triggers.forEach(button => {
      const badge = button.querySelector('.notification-badge');
      if (!badge) return;
      badge.hidden = count < 1;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count ? `Notificações: ${count} não lidas` : 'Abrir notificações');
    });
  }
  function safeUrl(url) {
    return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') ? url : '/';
  }
  function render(notifications) {
    list.replaceChildren();
    if (!notifications.length) {
      list.append(node('p','notifications-empty','Você ainda não recebeu notificações.'));
      return;
    }
    notifications.forEach(item => {
      const link = node('a', 'notification-row' + (item.read_at ? '' : ' is-unread'));
      link.href = safeUrl(item.target_url);
      const avatar = node('img','notification-avatar');
      avatar.src = item.actor_avatar || '/img/default-avatar.svg';
      avatar.alt = '';
      const text = node('span','notification-text');
      const message = node('span','notification-message', item.message);
      const when = node('small','notification-date');
      const date = item.created_at ? new Date(String(item.created_at).replace(' ','T') + 'Z') : null;
      when.textContent = date && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '';
      const badge = node('i',`fa-solid ${icons[item.kind] || 'fa-bell'} notification-kind`);
      badge.setAttribute('aria-hidden','true');
      text.append(message,when);
      link.append(avatar,text,badge);
      link.addEventListener('click', async event => {
        event.preventDefault();
        if (!item.read_at) {
          try { await window.echoRequest(`/api/notifications/${item.id}/read`, { method:'POST' }); }
          catch (error) { console.warn('Falha ao marcar notificação como lida:',error.message); }
        }
        window.location.assign(link.href);
      });
      list.append(link);
    });
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const data = await window.echoRequest('/api/notifications');
      setCount(data.unread);
      if (!panel.hidden) render(data.notifications);
    } catch (error) {
      if (!panel.hidden) list.replaceChildren(node('p','notifications-empty','Não foi possível carregar as notificações.'));
      console.warn('Notificações:',error.message);
    } finally { busy = false; }
  }
  function close() {
    panel.hidden = true;
    backdrop.hidden = true;
    triggers.forEach(t => t.setAttribute('aria-expanded','false'));
  }
  function open() {
    panel.hidden = false;
    backdrop.hidden = false;
    triggers.forEach(t => t.setAttribute('aria-expanded','true'));
    refresh();
    document.getElementById('notificationsClose')?.focus();
  }
  triggers.forEach(t => t.addEventListener('click', () => panel.hidden ? open() : close()));
  document.getElementById('notificationsClose')?.addEventListener('click',close);
  backdrop?.addEventListener('click',close);
  document.getElementById('notificationsReadAll')?.addEventListener('click',async event => {
    event.currentTarget.disabled = true;
    try { await window.echoRequest('/api/notifications/read-all',{method:'POST'}); await refresh(); }
    catch (error) { alert(error.message); }
    finally { event.currentTarget.disabled = false; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
  refresh();
  // EventSource reconecta automaticamente quando a conexão SSE cai.
  if ('EventSource' in window) {
    const stream = new EventSource('/api/notifications/stream');
    stream.addEventListener('notifications', () => {
      refresh();
      window.dispatchEvent(new Event('echonet:new-notification'));
    });
    window.addEventListener('pagehide', () => stream.close(), { once:true });
  }
  // Alternativa caso SSE seja bloqueado por um proxy; também recupera eventos perdidos.
  setInterval(() => { if (!document.hidden) refresh(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
