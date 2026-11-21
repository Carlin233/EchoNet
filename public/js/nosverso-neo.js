/* Nósverso Neo Space — apresentação apenas. Não faz requisições nem altera a autenticação. */
(() => {
  'use strict';
  const mark = '/img/nosverso/mark.svg';
  function brandify(element, compact = false) {
    if (!element || element.dataset.nvBrandReady === '1') return;
    const img = document.createElement('img');
    img.src = mark;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = 'nv-brand-mark';
    const label = document.createElement('span');
    label.textContent = 'Nósverso';
    label.className = 'nv-brand-label';
    element.replaceChildren(img, label);
    element.dataset.nvBrandReady = '1';
    if (element.tagName === 'A') {
      element.setAttribute('aria-label', compact ? 'Nósverso, voltar ao início' : 'Nósverso');
      element.setAttribute('title', 'Nósverso');
    }
  }
  function updateStaticBrand(selector) {
    document.querySelectorAll(selector).forEach(element => {
      if (!element.dataset.nvCopyReady && element.textContent.includes('EchoNet')) {
        element.textContent = element.textContent.replace(/EchoNet/g, 'Nósverso');
        element.dataset.nvCopyReady = '1';
      }
    });
  }
  function init() {
    document.documentElement.classList.add('nv-space');
    document.querySelectorAll('.sidebar-brand').forEach(el => brandify(el));
    document.querySelectorAll('.mobile-header-logo').forEach(el => brandify(el, true));
    document.querySelectorAll('.natal-brand').forEach(el => brandify(el));
    document.querySelectorAll('.form-logo').forEach(el => brandify(el));
    updateStaticBrand('.natal-login-card h2 .gradient-word, .natal-enter-button span:first-child, .natal-phone-logo strong, .login-footer, .settings-footer span');
    if (document.title.includes('EchoNet')) document.title = document.title.replace(/EchoNet/g, 'Nósverso');
    // Renomeia os atalhos visíveis, sem modificar as URLs ou os eventos do EchoNet.
    const destinations = [
      ['.sidebar-nav a[href="/"] span', 'Órbita'],
      ['.sidebar-nav a[href="/perfil"] span', 'Meu mundo'],
      ['.sidebar-nav a[href="/mensagens"] span', 'Conversas'],
    ];
    for (const [selector, text] of destinations) {
      document.querySelectorAll(selector).forEach(el => { if (el.textContent.trim()) el.textContent = text; });
    }
    const deck = document.querySelector('.nv-deck');
    if (deck) {
      const target = document.querySelector('#abrirModal, #newPostButton, #abrirModalPerfil');
      const button = deck.querySelector('[data-nv-create]');
      if (button) {
        if (!target) button.hidden = true;
        else button.addEventListener('click', () => target.click());
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
