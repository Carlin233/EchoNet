/* Somente efeitos visuais no login; sem chamadas ao servidor e sem dependências. */
(() => {
  'use strict';
  const input = document.getElementById('login-password');
  const toggle = document.getElementById('toggleLoginPassword');
  if (input && toggle) {
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
      toggle.title = visible ? 'Ocultar senha' : 'Mostrar senha';
    });
  }

  // Poucas partículas e só com animação liberada para evitar custo em celulares.
  const snow = document.getElementById('natalSnow');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (snow && !reduceMotion) {
    const count = window.matchMedia('(max-width: 720px)').matches ? 18 : 31;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const flake = document.createElement('i');
      flake.className = 'natal-snowflake';
      flake.setAttribute('aria-hidden', 'true');
      // Valores pseudoaleatórios estáveis: evitar repintura ou recalculo continuo via JS.
      const v = n => (Math.sin((i + 1) * n) * 10000) % 1;
      const r = n => Math.abs(v(n));
      flake.style.setProperty('--left', `${(r(12.9898) * 100).toFixed(1)}%`);
      flake.style.setProperty('--size', `${(2 + r(8.742) * 3.5).toFixed(1)}px`);
      flake.style.setProperty('--opacity', `${(.32 + r(5.438) * .6).toFixed(2)}`);
      flake.style.setProperty('--duration', `${(11 + r(9.123) * 13).toFixed(2)}s`);
      flake.style.setProperty('--delay', `${(-r(2.487) * 24).toFixed(2)}s`);
      flake.style.setProperty('--drift', `${((r(13.29)-.5) * 80).toFixed(1)}px`);
      fragment.appendChild(flake);
    }
    snow.appendChild(fragment);
  }

  // Acessibilidade: fechar modais com ESC, preservando os eventos existentes.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['modalCadastro','modalRecuperacao'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal && modal.style.display === 'flex') modal.style.display = 'none';
    });
  });
})();
