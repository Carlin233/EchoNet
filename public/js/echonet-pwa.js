/* EchoNet: instalacao PWA no Android, iOS e computador. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.warn('[EchoNet PWA] Registro indisponivel:', error));
  });

  const alreadyInstalled = () => window.matchMedia('(display-mode: standalone)').matches ||
    Boolean(navigator.standalone);
  if (alreadyInstalled()) return;

  let deferredInstallPrompt = null;
  let promptElement = null;
  const dismissKey = 'echonet-pwa-install-dismissed-v1';
  const dismissed = () => { try { return sessionStorage.getItem(dismissKey) === '1'; } catch (_) { return false; } };
  const rememberDismissal = () => { try { sessionStorage.setItem(dismissKey, '1'); } catch (_) {} };

  function hidePrompt() {
    if (promptElement) promptElement.remove();
    promptElement = null;
  }

  function showIOSInstructions() {
    hidePrompt();
    const overlay = document.createElement('div');
    overlay.className = 'echonet-pwa-overlay';
    overlay.setAttribute('role', 'presentation');
    const dialog = document.createElement('section');
    dialog.className = 'echonet-pwa-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Instalar EchoNet no iPhone');
    dialog.innerHTML = '<h2>EchoNet na tela inicial</h2><p>Para instalar no iPhone ou iPad:</p><ol><li>Abra o EchoNet no Safari.</li><li>Toque em <strong>Compartilhar</strong>.</li><li>Selecione <strong>Adicionar à Tela de Início</strong> e confirme.</li></ol>';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Entendi';
    close.addEventListener('click', () => { overlay.remove(); rememberDismissal(); });
    dialog.appendChild(close);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) { overlay.remove(); rememberDismissal(); }
    });
    document.body.appendChild(overlay);
    close.focus();
  }

  function showInstallPrompt(isIOS) {
    if (dismissed() || alreadyInstalled() || promptElement || !document.body) return;
    const banner = document.createElement('aside');
    banner.className = 'echonet-pwa-prompt';
    banner.setAttribute('aria-label', 'Instalar aplicativo EchoNet');
    const icon = document.createElement('img');
    icon.src = '/img/pwa/icon-192.png';
    icon.alt = '';
    const copy = document.createElement('div');
    copy.className = 'pwa-copy';
    const title = document.createElement('strong');
    title.textContent = 'Leve o EchoNet com você';
    const caption = document.createElement('span');
    caption.textContent = isIOS ? 'Adicione à tela inicial do iPhone' : 'Instale e abra como aplicativo';
    copy.append(title, caption);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'pwa-action';
    action.textContent = 'Instalar';
    action.addEventListener('click', async () => {
      if (isIOS) { showIOSInstructions(); return; }
      const event = deferredInstallPrompt;
      if (!event) return;
      deferredInstallPrompt = null;
      hidePrompt();
      await event.prompt();
      await event.userChoice.catch(() => {});
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pwa-dismiss';
    close.setAttribute('aria-label', 'Fechar aviso de instalação');
    close.textContent = '×';
    close.addEventListener('click', () => { rememberDismissal(); hidePrompt(); });
    banner.append(icon, copy, action, close);
    document.body.appendChild(banner);
    promptElement = banner;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => showInstallPrompt(false), { once: true });
    } else {
      showInstallPrompt(false);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hidePrompt();
  });

  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => showInstallPrompt(true), { once: true });
    } else {
      showInstallPrompt(true);
    }
  }
})();
