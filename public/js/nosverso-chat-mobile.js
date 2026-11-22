/* Ajuste exclusivo do viewport do chat no celular. Não altera envio nem leitura de mensagens. */
(() => {
  'use strict';
  if (!document.body.classList.contains('chat-layout')) return;
  const root = document.documentElement;
  const box = document.getElementById('chatBox');
  const form = document.getElementById('formMensagem');
  const query = window.matchMedia('(max-width: 760px)');
  let frame = 0;
  function syncViewport() {
    frame = 0;
    if (!query.matches || !document.body.classList.contains('chat-conversation')) {
      root.style.removeProperty('--nv-chat-visible-top');
      root.style.removeProperty('--nv-chat-visible-height');
      return;
    }
    const vv = window.visualViewport;
    const h = Math.round(vv ? vv.height : window.innerHeight);
    const top = Math.round(vv ? vv.offsetTop : 0);
    if (h > 190 && h < 3000) {
      root.style.setProperty('--nv-chat-visible-height', `${h}px`);
      root.style.setProperty('--nv-chat-visible-top', `${Math.max(0, Math.min(150, top))}px`);
    }
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(syncViewport);
  }
  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', schedule, { passive: true });
    viewport.addEventListener('scroll', schedule, { passive: true });
  }
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  query.addEventListener?.('change', schedule);
  const input = form?.elements?.conteudo;
  if (input) {
    input.addEventListener('focus', () => {
      schedule();
      // Manter a conversa perto do fim após a abertura do teclado.
      setTimeout(() => {
        schedule();
        if (box) box.scrollTop = box.scrollHeight;
      }, 220);
    });
    input.addEventListener('blur', schedule);
  }
  schedule();
})();
