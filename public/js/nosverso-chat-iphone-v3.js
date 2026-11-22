/* Nósverso Sinais v3: corrige posicionamento da conversa no teclado do iPhone.
   Não envia, consulta, apaga ou modifica mensagens. O chat.js original permanece responsável por isso. */
(() => {
  'use strict';
  const body = document.body;
  if (!body?.classList.contains('chat-conversation') || !body.classList.contains('chat-layout')) return;
  const root = document.documentElement;
  const input = document.querySelector('#formMensagem input[name="conteudo"]');
  const form = document.getElementById('formMensagem');
  const box = document.getElementById('chatBox');
  const mobile = window.matchMedia('(max-width: 760px)');
  let raf = 0;
  let focusTimer = 0;
  let lastHeight = 0;
  const vv = window.visualViewport;

  function update() {
    raf = 0;
    if (!mobile.matches) {
      root.style.removeProperty('--nv3-view-top');
      root.style.removeProperty('--nv3-view-height');
      root.style.removeProperty('--nv3-safe-bottom');
      body.classList.remove('nv3-keyboard-open');
      return;
    }
    // O VisualViewport representa a área realmente visível acima do teclado.
    // Usar 100vh ou subtrair o teclado uma segunda vez gera o grande espaço vazio.
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (!(height > 180 && height < 5000)) return;
    const h = Math.round(height * 10) / 10;
    const t = Math.round(Math.max(0, top) * 10) / 10;
    root.style.setProperty('--nv3-view-height', `${h}px`);
    root.style.setProperty('--nv3-view-top', `${t}px`);
    const keyboardVisible = Boolean(input && document.activeElement === input && (
      (lastHeight > 0 && h < lastHeight - 100) ||
      (window.innerHeight > 0 && h < window.innerHeight - 140)
    ));
    body.classList.toggle('nv3-keyboard-open', keyboardVisible);
    root.style.setProperty('--nv3-safe-bottom', keyboardVisible ? '0px' : 'env(safe-area-inset-bottom,0px)');
    if (!input || document.activeElement !== input) lastHeight = Math.max(lastHeight, h);
  }

  function schedule() {
    if (!raf) raf = window.requestAnimationFrame(update);
  }
  function afterFocus() {
    schedule();
    // iOS dispara resize em momentos diferentes da animação do teclado.
    for (const delay of [80, 220, 450]) window.setTimeout(schedule, delay);
    if (focusTimer) window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      if (box) box.scrollTop = box.scrollHeight;
    }, 280);
  }
  input?.addEventListener('focus', afterFocus, { passive: true });
  input?.addEventListener('blur', () => {
    schedule();
    window.setTimeout(schedule, 250);
  }, { passive: true });
  vv?.addEventListener('resize', schedule, { passive: true });
  vv?.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', () => {
    lastHeight = 0;
    schedule();
    window.setTimeout(schedule, 320);
  }, { passive: true });
  if (mobile.addEventListener) mobile.addEventListener('change', schedule);
  form?.addEventListener('submit', () => window.setTimeout(schedule, 100));
  schedule();
})();
