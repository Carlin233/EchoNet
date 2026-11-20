/* EchoNet 2.0: push opt-in, splash animado e transicoes discretas. */
(() => {
  'use strict';
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn();
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function launchSplash() {
    if (!isStandalone() || !document.body || document.querySelector('.echonet-splash')) return;
    const splash = document.createElement('div');
    splash.className = 'echonet-splash';
    splash.setAttribute('aria-hidden', 'true');
    splash.innerHTML = '<div class="echonet-splash-content"><div class="echonet-splash-logo"><img src="/img/pwa/icon-192.png" alt="" width="92" height="92"></div><strong>Echo<span>Net</span></strong><small>Conectando pessoas</small></div>';
    document.body.prepend(splash);
    requestAnimationFrame(() => splash.classList.add('echonet-splash-show'));
    window.setTimeout(() => {
      splash.classList.add('echonet-splash-hide');
      window.setTimeout(() => splash.remove(), reduceMotion() ? 80 : 440);
    }, reduceMotion() ? 160 : 1050);
  }

  function navigationTransitions() {
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduceMotion()) return;
      const a = event.target.closest?.('a[href]');
      if (!a || a.hasAttribute('download') || a.target && a.target !== '_self' || a.getAttribute('rel')?.includes('external')) return;
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
      let url;
      try { url = new URL(a.href); } catch (_) { return; }
      if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search && url.hash) return;
      // Evita afetar botoes modais e links com comportamento especial.
      if (a.closest('[data-no-transition]') || a.hasAttribute('data-no-transition')) return;
      event.preventDefault();
      document.body.classList.add('echonet-route-out');
      window.setTimeout(() => location.assign(url.href), 140);
    }, false);
  }

  async function getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_csrf"]')?.value;
    if (token) return token;
    const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Nao foi possivel confirmar sua sessao.');
    return (await response.json()).token;
  }

  async function postJson(path, data) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': await getCsrfToken() },
      body: JSON.stringify(data)
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload.success === false) throw new Error(payload.message || 'Nao foi possivel concluir.');
    return payload;
  }

  function decodePublicKey(key) {
    const padding = '='.repeat((4 - key.length % 4) % 4);
    const raw = atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function getSubscription() {
    const registration = await navigator.serviceWorker.ready;
    return { registration, subscription: await registration.pushManager.getSubscription() };
  }

  async function getKey() {
    const response = await fetch('/api/push/public-key', { credentials: 'same-origin', cache: 'no-store' });
    let info = {};
    try { info = await response.json(); } catch (_) {}
    if (!response.ok || !info.publicKey) throw new Error(info.message || 'Notificacoes indisponiveis no momento.');
    return info.publicKey;
  }

  function pushControlCard() {
    if (!document.querySelector('.settings-grid') || document.getElementById('echonet-push-settings')) return;
    const card = document.createElement('section');
    card.id = 'echonet-push-settings';
    card.className = 'settings-card echonet-push-card';
    card.innerHTML = `
      <div class="settings-card-heading"><span class="settings-icon" aria-hidden="true">🔔</span>
      <div><h2>Notificações no celular</h2><p>Mensagens, curtidas, comentários e seguidores</p></div></div>
      <p class="echonet-push-note">Receba avisos mesmo quando o EchoNet não estiver aberto. Você escolhe se deseja ativar.</p>
      <div class="echonet-push-actions"><button id="echonet-push-toggle" type="button">Verificando...</button>
      <span class="echonet-push-state" role="status" aria-live="polite"></span></div>
      <small class="echonet-push-footnote">É possível alterar esta permissão nas configurações de notificações do aparelho.</small>`;
    document.querySelector('.settings-grid').appendChild(card);
    const button = card.querySelector('#echonet-push-toggle');
    const status = card.querySelector('.echonet-push-state');
    const feedback = (msg, error = false) => { status.textContent = msg; status.classList.toggle('is-error', error); };

    async function refresh() {
      if (!pushSupported()) { button.disabled = true; button.textContent = 'Não disponível'; feedback('Este navegador não oferece notificações push.'); return; }
      if (Notification.permission === 'denied') { button.disabled = true; button.textContent = 'Permissão bloqueada'; feedback('Libere as notificações nas configurações do navegador ou aparelho.'); return; }
      try {
        await getKey();
        const { subscription } = await getSubscription();
        button.disabled = false;
        button.textContent = subscription && Notification.permission === 'granted' ? 'Desativar neste aparelho' : 'Ativar notificações';
        feedback(subscription && Notification.permission === 'granted' ? 'Notificações ativadas neste aparelho.' : 'Ative quando quiser receber avisos.');
      } catch (error) {
        button.disabled = true;
        button.textContent = 'Indisponível';
        feedback(error.message, true);
      }
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      feedback('Atualizando...');
      try {
        const { registration, subscription } = await getSubscription();
        if (subscription && Notification.permission === 'granted') {
          await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint });
          await subscription.unsubscribe();
          feedback('Notificações desativadas neste aparelho.');
        } else {
          // A solicitação acontece diretamente após o clique do usuario.
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') throw new Error('Permissão não concedida. Você poderá ativar depois.');
          const key = await getKey();
          const current = subscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePublicKey(key) });
          await postJson('/api/push/subscribe', { subscription: current.toJSON() });
          feedback('Notificações ativadas!');
        }
      } catch (error) { feedback(error.message || 'Não foi possível atualizar.', true); }
      await refresh();
    });
    refresh();
  }

  // Reassocia uma inscricao preexistente a conta atualmente autenticada,
  // sem abrir pedido de permissao automaticamente.
  async function restoreExistingSubscription() {
    if (!pushSupported() || Notification.permission !== 'granted' || !document.querySelector('.app-layout')) return;
    try {
      const response = await fetch('/api/push/public-key', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      const info = await response.json();
      const key = 'echonet-push-synced-v2-' + String(info.userId);
      const last = Number(sessionStorage.getItem(key) || '0');
      if (Date.now() - last < 10 * 60 * 1000) return;
      const { subscription } = await getSubscription();
      if (subscription) {
        await postJson('/api/push/subscribe', { subscription: subscription.toJSON() });
        sessionStorage.setItem(key, String(Date.now()));
      }
    } catch (_) { /* nunca interrompe a navegacao */ }
  }

  function cleanOnLogout() {
    document.addEventListener('submit', async event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const url = new URL(form.action || location.href);
      if (url.origin !== location.origin || url.pathname !== '/logout' || form.dataset.pushLogoutHandled) return;
      form.dataset.pushLogoutHandled = '1';
      try {
        Object.keys(sessionStorage).filter(key => key.startsWith('echonet-push-synced-v2-'))
          .forEach(key => sessionStorage.removeItem(key));
      } catch (_) {}
      if (!pushSupported()) return;
      event.preventDefault();
      try {
        await Promise.race([
          (async () => {
            const { subscription } = await getSubscription();
            if (!subscription) return;
            await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint });
            await subscription.unsubscribe();
          })(),
          new Promise(resolve => setTimeout(resolve, 1100))
        ]);
      } catch (_) {}
      HTMLFormElement.prototype.submit.call(form);
    }, true);
  }

  ready(() => {
    launchSplash();
    navigationTransitions();
    pushControlCard();
    cleanOnLogout();
    restoreExistingSubscription();
  });
})();
