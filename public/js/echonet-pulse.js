/* EchoNet Pulse — melhoria progressiva, sem modificar eventos do aplicativo. */
(() => {
  'use strict';
  const setup = () => {
    document.documentElement.classList.add('echonet-pulse');
    // O novo atalho usa a janela de criação JÁ existente. Nenhum formulário duplicado.
    document.querySelectorAll('[data-pulse-create]').forEach((button) => {
      button.addEventListener('click', () => {
        const existing = document.getElementById('abrirModal') ||
                         document.getElementById('abrirModalPerfil') ||
                         document.getElementById('newPostButton');
        if (existing) existing.click();
      });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
