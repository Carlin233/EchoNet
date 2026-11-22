/* Nósverso Login Cósmico: apenas UX visual; autenticação continua no HTML existente. */
(() => {
  'use strict';
  const password = document.getElementById('nv-password');
  const button = document.getElementById('toggleLoginPassword');
  if (password && button) {
    button.addEventListener('click', () => {
      const visible = password.type === 'password';
      password.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
      button.setAttribute('title', visible ? 'Ocultar senha' : 'Mostrar senha');
      button.setAttribute('aria-pressed', String(visible));
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    ['modalCadastro', 'modalRecuperacao'].forEach(id => {
      const dialog = document.getElementById(id);
      if (dialog && dialog.style.display === 'flex') dialog.style.display = 'none';
    });
  });
  // Não usa scrolling, requisições, persistência ou animações em loop no JS.
  // Celular: movimento do telefone implementado em CSS e desligado no modo de redução de movimento.
})();
