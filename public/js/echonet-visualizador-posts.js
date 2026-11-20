/* EchoNet — Visualizador de publicacoes estilo feed: foto, comentarios e menu contextual.
   Usa somente endpoints autenticados existentes. Sem dependencias externas. */
'use strict';
(() => {
  const profile = document.querySelector('.perfil-page');
  if (!profile || !profile.querySelector('.perfil-grid')) return;
  if (document.getElementById('ecpv-dialog')) return;
  const validId = id => /^[1-9]\d*$/.test(String(id || ''));
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  const dialog = document.createElement('dialog');
  dialog.id = 'ecpv-dialog';
  dialog.className = 'ecpv-dialog';
  dialog.setAttribute('aria-label', 'Publicação do EchoNet');
  dialog.innerHTML = `
    <div class="ecpv-layout">
      <div class="ecpv-photo-pane">
        <button type="button" class="ecpv-arrow ecpv-prev" data-ecpv="prev" aria-label="Publicação anterior">&#10094;</button>
        <img class="ecpv-photo" alt="Foto da publicação">
        <button type="button" class="ecpv-arrow ecpv-next" data-ecpv="next" aria-label="Próxima publicação">&#10095;</button>
      </div>
      <section class="ecpv-panel" aria-label="Detalhes da publicação">
        <header class="ecpv-heading">
          <a class="ecpv-author-link" href="#"><img class="ecpv-avatar" alt=""><strong class="ecpv-author"></strong></a>
          <div class="ecpv-header-actions">
            <button type="button" class="ecpv-icon-btn ecpv-options-trigger" data-ecpv="menu" aria-haspopup="true" aria-expanded="false" aria-label="Mais opções">&#8226;&#8226;&#8226;</button>
            <button type="button" class="ecpv-icon-btn ecpv-close" data-ecpv="close" aria-label="Fechar">&times;</button>
          </div>
          <div class="ecpv-menu" hidden>
            <button type="button" data-ecpv="copy">Copiar link</button>
            <button type="button" data-ecpv="share">Compartilhar publicação</button>
            <button type="button" data-ecpv="archive" hidden>Arquivar publicação</button>
            <button type="button" data-ecpv="delete" class="ecpv-menu-danger" hidden>Excluir publicação</button>
          </div>
        </header>
        <div class="ecpv-comments-area" role="region" aria-label="Comentários">
          <div class="ecpv-caption-row"><img class="ecpv-caption-avatar" alt=""><p><strong class="ecpv-caption-author"></strong> <span class="ecpv-caption-text"></span></p></div>
          <div class="ecpv-comments" aria-live="polite"><p class="ecpv-muted">Carregando comentários...</p></div>
        </div>
        <div class="ecpv-footer">
          <div class="ecpv-social-actions">
            <button type="button" data-ecpv="like" class="ecpv-social-btn ecpv-like" aria-label="Curtir publicação" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg></button>
            <button type="button" data-ecpv="focus-comment" class="ecpv-social-btn" aria-label="Comentar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z"/></svg></button>
            <button type="button" data-ecpv="share" class="ecpv-social-btn" aria-label="Compartilhar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4.6-8.4L2 9l20-7ZM10.4 13.6 22 2"/></svg></button>
            <button type="button" data-ecpv="save" class="ecpv-social-btn ecpv-save" aria-label="Salvar publicação" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-7-5-7 5V3Z"/></svg></button>
          </div>
          <p class="ecpv-like-count"></p>
          <p class="ecpv-status" role="status" aria-live="polite"></p>
          <form class="ecpv-comment-form"><input class="ecpv-comment-input" aria-label="Escreva um comentário" placeholder="Adicione um comentário..." maxlength="1000" autocomplete="off" required><button class="ecpv-send" type="submit">Publicar</button></form>
        </div>
      </section>
    </div>
    <div class="ecpv-confirm" hidden role="alertdialog" aria-modal="true" aria-label="Confirmar exclusão">
      <div class="ecpv-confirm-box">
        <h3>Excluir esta publicação?</h3>
        <p>A imagem, as curtidas e os comentários serão excluídos permanentemente.</p>
        <div class="ecpv-confirm-actions">
          <button type="button" data-ecpv="cancel-delete">Cancelar</button>
          <button type="button" class="ecpv-confirm-delete" data-ecpv="confirm-delete">Excluir publicação</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  const $ = selector => dialog.querySelector(selector);
  const photo = $('.ecpv-photo');
  const comments = $('.ecpv-comments');
  const status = $('.ecpv-status');
  const menu = $('.ecpv-menu');
  const menuTrigger = $('[data-ecpv="menu"]');
  const confirmBox = $('.ecpv-confirm');
  const commentForm = $('.ecpv-comment-form');
  const input = $('.ecpv-comment-input');
  let current = null, oldFocus = null, oldOverflow = '', requestSequence = 0;
  const ownerControls = item => !!item?.querySelector('form[action^="/deletar-post/"] input[name="_csrf"]');
  const archived = item => !!item?.closest('#tab-archive');
  function postId(item) {
    const explicit = item?.dataset.postId;
    if (validId(explicit)) return explicit;
    const href = item?.querySelector('a[href^="/post/"]')?.getAttribute('href') || '';
    return href.match(/^\/post\/(\d+)(?:[?#].*)?$/)?.[1] || null;
  }
  function activeItems() {
    const panel = document.querySelector('.perfil-grid-panel:not([hidden])');
    return [...(panel?.querySelectorAll('.perfil-grid .grid-item') || [])].filter(el => validId(postId(el)) && el.querySelector('img'));
  }
  function updateArrows() {
    const list = activeItems(); const idx = list.indexOf(current);
    $('[data-ecpv="prev"]').disabled = idx < 1;
    $('[data-ecpv="next"]').disabled = idx < 0 || idx >= list.length - 1;
  }
  function url() { return new URL('/post/' + postId(current), location.origin).href; }
  function closeMenu() { menu.hidden = true; menuTrigger.setAttribute('aria-expanded', 'false'); }
  function message(msg = '') { status.textContent = msg; }
  function textElement(tag, cls, value) { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = value; return n; }
  function setCounts() {
    const likes = Number(current?.dataset.likes) || 0;
    $('.ecpv-like-count').textContent = `${likes} ${likes === 1 ? 'curtida' : 'curtidas'}`;
    const liked = current?.dataset.liked === 'true';
    $('.ecpv-like').classList.toggle('is-liked', liked);
    $('.ecpv-like').setAttribute('aria-pressed', String(liked));
    $('.ecpv-like').setAttribute('aria-label', liked ? 'Descurtir publicação' : 'Curtir publicação');
    const saved = current?.dataset.saved === 'true';
    $('.ecpv-save').classList.toggle('is-saved', saved);
    $('.ecpv-save').setAttribute('aria-pressed', String(saved));
    $('.ecpv-save').setAttribute('aria-label', saved ? 'Remover dos salvos' : 'Salvar publicação');
  }
  function renderComments(items) {
    comments.replaceChildren();
    if (!items.length) { comments.append(textElement('p', 'ecpv-muted', 'Ainda não há comentários. Seja o primeiro a comentar!')); return; }
    for (const c of items) {
      const row = textElement('div', 'ecpv-comment', '');
      const avatar = document.createElement('img'); avatar.src = c.avatar || '/img/default-avatar.svg'; avatar.alt = '';
      const body = document.createElement('div'); body.className = 'ecpv-comment-body';
      const name = textElement('strong', '', c.username || 'Usuário');
      const content = textElement('span', '', c.conteudo || '');
      body.append(name, ' ', content); row.append(avatar, body); comments.append(row);
    }
  }
  async function loadComments() {
    const item = current, id = postId(item), seq = ++requestSequence;
    comments.replaceChildren(textElement('p', 'ecpv-muted', 'Carregando comentários...'));
    if (archived(item)) { comments.replaceChildren(textElement('p', 'ecpv-muted', 'Restaure esta publicação para ver os comentários.')); return; }
    try {
      const response = await fetch(`/api/posts/${id}/comments`, { credentials:'same-origin', cache:'no-store', headers:{'Accept':'application/json'} });
      if (!response.ok) throw new Error('Não foi possível carregar os comentários.');
      const data = await response.json();
      if (seq !== requestSequence || item !== current) return;
      renderComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (err) {
      if (seq === requestSequence && item === current) comments.replaceChildren(textElement('p', 'ecpv-muted', err.message));
    }
  }
  function configure(item) {
    const image = item.querySelector('img'); if (!image) return;
    current = item; ++requestSequence; closeMenu(); confirmBox.hidden = true; message();
    photo.src = image.currentSrc || image.src;
    photo.alt = image.alt || 'Publicação ampliada';
    const author = item.dataset.author || profile.querySelector('.perfil-username')?.textContent.trim() || 'Usuário';
    const avatar = item.dataset.avatar || profile.querySelector('.perfil-avatar')?.src || '/img/default-avatar.svg';
    $('.ecpv-author').textContent = author;
    $('.ecpv-author-link').href = `/perfil/${encodeURIComponent(author)}`;
    $('.ecpv-avatar').src = avatar;
    $('.ecpv-caption-avatar').src = avatar;
    $('.ecpv-caption-author').textContent = author;
    $('.ecpv-caption-text').textContent = item.dataset.caption || '';
    $('.ecpv-caption-row').hidden = !item.dataset.caption;
    const own = ownerControls(item), isArchived = archived(item);
    $('[data-ecpv="delete"]').hidden = !own;
    $('[data-ecpv="archive"]').hidden = !own;
    $('[data-ecpv="archive"]').textContent = isArchived ? 'Restaurar publicação' : 'Arquivar publicação';
    $('[data-ecpv="share"]').disabled = isArchived;
    $('[data-ecpv="save"]').disabled = isArchived;
    $('[data-ecpv="like"]').disabled = isArchived;
    commentForm.hidden = isArchived;
    $('.ecpv-options-trigger').hidden = false;
    input.value = '';
    setCounts(); updateArrows(); loadComments();
  }
  function show(item) {
    if (!dialog.open) { oldFocus = document.activeElement; oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    configure(item);
    if (!dialog.open) dialog.showModal();
    $('.ecpv-close').focus();
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    ++requestSequence; document.body.style.overflow = oldOverflow; current = null;
    confirmBox.hidden = true; closeMenu(); photo.removeAttribute('src');
    if (oldFocus?.isConnected) oldFocus.focus({ preventScroll: true });
  });
  // Intercepta somente fotos da grade, nao avatar ou foto de Story.
  document.addEventListener('click', e => {
    const image = e.target.closest?.('.perfil-page .perfil-grid-panel .grid-item img');
    if (!image) return;
    const item = image.closest('.grid-item'); if (!validId(postId(item))) return;
    e.preventDefault(); show(item);
  });
  // Acessibilidade: abrir pelo link ao pressionar Enter tambem.
  document.addEventListener('click', e => {
    const link = e.target.closest?.('.perfil-page .perfil-grid-panel .grid-item > a[href^="/post/"]');
    if (!link || e.target.closest('img')) return;
    const item = link.closest('.grid-item'); if (!validId(postId(item))) return;
    e.preventDefault(); show(item);
  });
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
    if (!e.target.closest('.ecpv-menu,.ecpv-options-trigger')) closeMenu();
  });
  function switchPost(delta) { const arr = activeItems(); const next = arr[arr.indexOf(current) + delta]; if (next) configure(next); }
  async function copyUrl() {
    const link = url();
    try { await navigator.clipboard.writeText(link); message('Link copiado!'); }
    catch { window.prompt('Copie o link desta publicação:', link); }
  }
  async function request(endpoint, body) {
    if (!csrf) throw new Error('Token de segurança ausente. Atualize a página.');
    const response = await fetch(endpoint, { method:'POST', credentials:'same-origin', headers:{ 'Accept':'application/json','Content-Type':'application/json','X-CSRF-Token':csrf }, body: JSON.stringify(body || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || `Erro ${response.status}`);
    return data;
  }
  dialog.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-ecpv]'); if (!btn || btn.disabled) return;
    const action = btn.dataset.ecpv;
    if (action === 'close') return close();
    if (action === 'prev') return switchPost(-1);
    if (action === 'next') return switchPost(1);
    if (action === 'menu') { menu.hidden = !menu.hidden; menuTrigger.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (action === 'cancel-delete') { confirmBox.hidden = true; menuTrigger.focus(); return; }
    if (action === 'delete') { if (!ownerControls(current)) return; closeMenu(); confirmBox.hidden = false; $('[data-ecpv="cancel-delete"]').focus(); return; }
    if (action === 'confirm-delete') {
      const form = current?.querySelector('form[action^="/deletar-post/"]');
      const id = postId(current), token = form?.querySelector('input[name="_csrf"]')?.value;
      if (!form || !validId(id) || !token || new URL(form.action).pathname !== `/deletar-post/${id}`) { confirmBox.hidden = true; message('Não foi possível validar a exclusão. Atualize a página.'); return; }
      btn.disabled = true; btn.textContent = 'Excluindo...';
      HTMLFormElement.prototype.submit.call(form); return;
    }
    if (action === 'archive') {
      const control = current?.querySelector('.btn-archive');
      if (ownerControls(current) && control) { close(); control.click(); }
      return;
    }
    if (action === 'copy') { closeMenu(); return copyUrl(); }
    if (action === 'share') {
      closeMenu(); const link = url();
      if (navigator.share) { try { await navigator.share({ title:'Publicação no EchoNet', url: link }); } catch (err) { if (err.name !== 'AbortError') await copyUrl(); } }
      else await copyUrl();
      return;
    }
    if (action === 'focus-comment') return input.focus();
    if (action === 'like' || action === 'save') {
      if (archived(current)) return;
      const item = current, id = postId(item); btn.disabled = true; message();
      try {
        const data = await request(`/api/posts/${id}/${action}`, {});
        if (current !== item) return;
        if (action === 'like') { item.dataset.liked = String(data.liked); item.dataset.likes = String(data.count); }
        else item.dataset.saved = String(data.saved);
        setCounts();
      } catch (err) { message(err.message); }
      finally { btn.disabled = false; }
    }
  });
  commentForm.addEventListener('submit', async e => {
    e.preventDefault(); if (!current || archived(current)) return;
    const content = input.value.trim(); if (!content || content.length > 1000) return;
    const btn = $('.ecpv-send'), item = current, id = postId(item);
    btn.disabled = true; message('');
    try { await request(`/api/posts/${id}/comments`, { conteudo: content });
      if (item !== current) return;
      input.value = ''; await loadComments();
    } catch (err) { message(err.message); }
    finally { btn.disabled = false; }
  });
  dialog.addEventListener('cancel', e => {
    if (!confirmBox.hidden) { e.preventDefault(); confirmBox.hidden = true; menuTrigger.focus(); }
    else if (!menu.hidden) { e.preventDefault(); closeMenu(); menuTrigger.focus(); }
  });
  document.addEventListener('keydown', e => {
    if (!dialog.open || !confirmBox.hidden || document.activeElement === input) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); switchPost(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); switchPost(1); }
  });
  document.documentElement.classList.add('ecpv-ready');
})();
