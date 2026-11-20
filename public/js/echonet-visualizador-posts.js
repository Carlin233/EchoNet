/* EchoNet — Visualizador de publicações do perfil (2.2)
 * Não modifica o avatar/Stories, não lê credenciais e reutiliza os formulários de exclusão existentes.
 */
'use strict';
(() => {
  if (!document.querySelector('.perfil-page .perfil-grid')) return;
  if (document.getElementById('ecpv-dialog')) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'ecpv-dialog';
  dialog.className = 'ecpv-dialog';
  dialog.setAttribute('aria-label', 'Visualizar publicação do EchoNet');
  dialog.innerHTML = `
    <div class="ecpv-layout">
      <div class="ecpv-photo-pane">
        <button class="ecpv-top-close" type="button" data-ecpv="close" aria-label="Fechar visualização">&times;</button>
        <button class="ecpv-arrow ecpv-prev" type="button" data-ecpv="prev" aria-label="Foto anterior">&#10094;</button>
        <img class="ecpv-photo" alt="Publicação ampliada">
        <button class="ecpv-arrow ecpv-next" type="button" data-ecpv="next" aria-label="Próxima foto">&#10095;</button>
      </div>
      <aside class="ecpv-panel">
        <div class="ecpv-heading"><div class="ecpv-brand">Echo<span>Net</span> <span class="ecpv-badge">FOTO</span></div><button class="ecpv-desktop-close" type="button" data-ecpv="close" aria-label="Fechar">&times;</button></div>
        <h2 class="ecpv-title">Publicação</h2>
        <p class="ecpv-subtitle">Veja o momento em destaque.</p>
        <div class="ecpv-actions">
          <button type="button" class="ecpv-action ecpv-primary" data-ecpv="share">↗ <span>Compartilhar</span></button>
          <button type="button" class="ecpv-action" data-ecpv="copy">▣ <span>Copiar link</span></button>
          <button type="button" class="ecpv-action" data-ecpv="open">◉ <span>Ver publicação</span></button>
          <button type="button" class="ecpv-action" data-ecpv="archive" hidden>▤ <span>Arquivar</span></button>
          <button type="button" class="ecpv-action ecpv-danger" data-ecpv="delete" hidden>⌫ <span>Excluir publicação</span></button>
        </div>
        <p class="ecpv-message" role="status" aria-live="polite"></p>
        <div class="ecpv-footnote">Use as setas para navegar entre as fotos.</div>
      </aside>
    </div>
    <div class="ecpv-confirm" hidden>
      <div class="ecpv-confirm-box">
        <div class="ecpv-warning-symbol" aria-hidden="true">!</div>
        <h3>Excluir esta publicação?</h3>
        <p>Essa ação é permanente. A foto, os comentários e as curtidas dessa publicação serão removidos.</p>
        <div class="ecpv-confirm-actions">
          <button type="button" data-ecpv="cancel-delete">Cancelar</button>
          <button type="button" class="ecpv-confirm-delete" data-ecpv="confirm-delete">Excluir definitivamente</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  const $ = selector => dialog.querySelector(selector);
  const photo = $('.ecpv-photo');
  const share = $('[data-ecpv="share"]');
  const copy = $('[data-ecpv="copy"]');
  const openPost = $('[data-ecpv="open"]');
  const archive = $('[data-ecpv="archive"]');
  const remove = $('[data-ecpv="delete"]');
  const confirmBox = $('.ecpv-confirm');
  const message = $('.ecpv-message');
  let current = null;
  let returnFocus = null;
  let originalOverflow = '';

  const isArchived = item => !!item?.closest('#tab-archive');
  const validId = value => /^\d+$/.test(String(value || ''));
  function getPostId(item) {
    const explicit = item?.dataset.postId;
    if (validId(explicit)) return explicit;
    const href = item?.querySelector('a[href^="/post/"]')?.getAttribute('href') || '';
    const found = href.match(/^\/post\/(\d+)(?:\?.*)?$/);
    return found ? found[1] : null;
  }
  function visiblePosts() {
    const tab = document.querySelector('.perfil-grid-panel:not([hidden])');
    return [...(tab?.querySelectorAll('.perfil-grid .grid-item') || [])]
      .filter(item => !!item.querySelector('img') && validId(getPostId(item)));
  }
  function updateArrows() {
    const items = visiblePosts();
    const index = items.indexOf(current);
    $('[data-ecpv="prev"]').disabled = index <= 0;
    $('[data-ecpv="next"]').disabled = index < 0 || index >= items.length - 1;
  }
  function postUrl() { return new URL(`/post/${getPostId(current)}`, location.origin).href; }
  function hasOwnerControls(item) {
    // A UI só mostra opções de proprietário quando a página veio do servidor com um formulário
    // de exclusão para esse post. A rota /deletar-post/:id valida sessão e propriedade novamente.
    return !!item?.querySelector('form[action^="/deletar-post/"] input[name="_csrf"]');
  }
  function configure(item) {
    const image = item.querySelector('img');
    if (!image || !validId(getPostId(item))) return;
    current = item;
    const archived = isArchived(item);
    const owned = hasOwnerControls(item);
    photo.src = image.currentSrc || image.src;
    photo.alt = image.alt || 'Publicação ampliada';
    $('.ecpv-title').textContent = (image.alt && image.alt !== 'Publicação') ? image.alt : 'Publicação do perfil';
    $('.ecpv-subtitle').textContent = archived ? 'Publicação arquivada — visível somente para você.' : 'Uma foto compartilhada no EchoNet.';
    remove.hidden = !owned;
    archive.hidden = !owned || !item.querySelector('.btn-archive');
    archive.querySelector('span').textContent = archived ? 'Restaurar publicação' : 'Arquivar publicação';
    openPost.hidden = archived;
    share.hidden = archived;
    copy.hidden = archived;
    confirmBox.hidden = true;
    message.textContent = '';
    updateArrows();
  }
  function show(item) {
    if (!dialog.open) {
      returnFocus = document.activeElement;
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    configure(item);
    if (!dialog.open) dialog.showModal();
    $('[data-ecpv="close"]').focus();
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => {
    document.body.style.overflow = originalOverflow;
    current = null;
    confirmBox.hidden = true;
    photo.removeAttribute('src');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  // A miniatura abre a imagem; botões já existentes (arquivar/excluir) continuam funcionando.
  document.addEventListener('click', event => {
    const image = event.target.closest?.('.perfil-page .perfil-grid-panel .grid-item img');
    if (!image) return;
    const item = image.closest('.grid-item');
    if (!item || !validId(getPostId(item))) return;
    event.preventDefault();
    show(item);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  function switchPhoto(step) {
    const items = visiblePosts();
    const next = items[items.indexOf(current) + step];
    if (next) configure(next);
  }
  async function copyLink() {
    const url = postUrl();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('not-supported');
      await navigator.clipboard.writeText(url);
      message.textContent = 'Link copiado! Você já pode compartilhar.';
    } catch (_) {
      // Alternativa sem precisar de acesso a informações privadas.
      window.prompt('Copie o link da publicação:', url);
      message.textContent = '';
    }
  }
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button[data-ecpv]');
    if (!button || button.disabled) return;
    const action = button.dataset.ecpv;
    if (action === 'close') return close();
    if (action === 'prev') return switchPhoto(-1);
    if (action === 'next') return switchPhoto(1);
    if (action === 'cancel-delete') { confirmBox.hidden = true; remove.focus(); return; }
    if (action === 'copy') return copyLink();
    if (action === 'share') {
      const url = postUrl();
      if (navigator.share) {
        try { await navigator.share({ title: 'Publicação no EchoNet', url }); }
        catch (error) { if (error.name !== 'AbortError') await copyLink(); }
      } else await copyLink();
      return;
    }
    if (action === 'open') { location.assign(postUrl()); return; }
    if (action === 'archive') {
      const original = current?.querySelector('.btn-archive');
      if (original && hasOwnerControls(current)) { close(); original.click(); }
      return;
    }
    if (action === 'delete') {
      if (!hasOwnerControls(current)) return;
      confirmBox.hidden = false;
      $('[data-ecpv="cancel-delete"]').focus();
      return;
    }
    if (action === 'confirm-delete') {
      const form = current?.querySelector('form[action^="/deletar-post/"]');
      const id = getPostId(current);
      const token = form?.querySelector('input[name="_csrf"]')?.value;
      if (!form || !validId(id) || !token || new URL(form.action).pathname !== `/deletar-post/${id}`) {
        confirmBox.hidden = true;
        message.textContent = 'Não foi possível validar a exclusão. Atualize a página e tente novamente.';
        return;
      }
      // Usa o formulário já gerado pelo servidor, com CSRF e POST. Evita a segunda
      // caixa confirm() do HTML original porque o diálogo acima já confirmou a exclusão.
      button.disabled = true;
      button.textContent = 'Excluindo...';
      HTMLFormElement.prototype.submit.call(form);
    }
  });
  dialog.addEventListener('cancel', event => {
    if (!confirmBox.hidden) {
      event.preventDefault();
      confirmBox.hidden = true;
      remove.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (!dialog.open || !confirmBox.hidden) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); switchPhoto(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); switchPhoto(1); }
  });
  // Gestos horizontais nas fotos do perfil (não interferem na barra mobile).
  let touchStartX = null;
  photo.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchStartX = event.touches[0].clientX;
  }, { passive: true });
  photo.addEventListener('touchend', event => {
    if (touchStartX == null || !confirmBox.hidden) return;
    const delta = event.changedTouches[0]?.clientX - touchStartX;
    if (Math.abs(delta || 0) > 70) switchPhoto(delta < 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });
})();
