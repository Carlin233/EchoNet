/* EchoNet 2.1: melhorias progressivas do editor e visualização de Stories no perfil.
   Não modifica autenticação, rotas, banco de dados ou notificações push. */
'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const limitBytes = 5 * 1024 * 1024;
  const acceptable = (file) => !!file && imageTypes.has(file.type) && file.size <= limitBytes;
  const issue = 'Use JPG, PNG, WebP ou GIF com até 5 MB.';

  function buildPostEditor() {
    const modal = $('#modalCriar');
    const form = $('#formPostagem');
    if (!modal || !form || modal.dataset.ecEnhanced) return;
    modal.dataset.ecEnhanced = '1';
    modal.classList.add('ec-compose-overlay');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Criar publicação no feed');
    const panel = $('.modal-conteudo', modal);
    panel?.classList.add('ec-compose-card');
    const header = $('.modal-header-bar', modal);
    const title = $('h3', header);
    if (title) title.textContent = 'Nova publicação';
    $('#fecharModal')?.setAttribute('aria-label', 'Fechar criação de publicação');
    const body = $('.modal-body', modal);
    if (body) {
      const intro = make('div', 'ec-compose-intro');
      const mark = make('span', 'ec-compose-mark', '✦');
      const copy = make('div', 'ec-compose-intro-text');
      copy.append(make('strong', '', 'Compartilhe um momento'), make('span', '', 'Escolha uma foto, escreva sua legenda e publique no feed.'));
      intro.append(mark, copy);
      body.insertBefore(intro, form);
    }
    const upload = $('.upload-area', form);
    const fileInput = $('#uploadInput', form);
    const preview = $('#previewImagem', form);
    const textarea = $('textarea[name="legenda"]', form);
    const submit = $('button[type="submit"]', form);
    upload?.classList.add('ec-post-picker');
    const uploadText = $('.upload-text', form);
    if (uploadText) {
      uploadText.replaceChildren();
      const emoji = make('span', 'ec-picker-symbol', '▧');
      const headline = make('strong', '', 'Arraste sua imagem aqui');
      const small = make('span', '', 'ou toque para escolher do celular');
      const hint = make('em', '', 'JPG, PNG, WebP ou GIF · até 5 MB');
      uploadText.append(emoji, headline, small, hint);
    }
    const fileActions = make('div', 'ec-file-actions');
    const fileInfo = make('span', 'ec-file-info', 'Nenhuma imagem selecionada');
    const clear = make('button', 'ec-clear-file', 'Remover imagem');
    clear.type = 'button';
    clear.hidden = true;
    fileActions.append(fileInfo, clear);
    upload?.insertAdjacentElement('afterend', fileActions);
    const status = make('p', 'ec-compose-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    fileActions.insertAdjacentElement('afterend', status);
    const captionRow = make('div', 'ec-caption-row');
    captionRow.append(make('label', '', 'Legenda'), make('span', 'ec-caption-count', '0/2000'));
    if (textarea) {
      textarea.id = textarea.id || 'ecPostCaption';
      $('label', captionRow).setAttribute('for', textarea.id);
      textarea.placeholder = 'O que você quer compartilhar hoje?';
      textarea.insertAdjacentElement('beforebegin', captionRow);
      textarea.addEventListener('input', () => { $('.ec-caption-count', captionRow).textContent = textarea.value.length + '/2000'; });
    }
    if (submit) { submit.textContent = 'Compartilhar no feed'; submit.classList.add('ec-compose-submit'); }
    const storyModal = $('#storyCreateModal');
    if (storyModal && header) {
      const tabs = make('div', 'ec-compose-tabs');
      const postTab = make('button', 'ec-compose-tab active', '◉ Publicação');
      const storyTab = make('button', 'ec-compose-tab', '◷ Story de 24h');
      postTab.type = storyTab.type = 'button';
      postTab.setAttribute('aria-current', 'page');
      storyTab.addEventListener('click', () => {
        modal.style.display = 'none';
        openStoryCreate();
      });
      tabs.append(postTab, storyTab);
      header.insertAdjacentElement('afterend', tabs);
    }
    function resetFile() {
      if (fileInput) fileInput.value = '';
      if (preview) { preview.src = ''; preview.style.display = 'none'; }
      if (uploadText) uploadText.style.display = 'flex';
      fileInfo.textContent = 'Nenhuma imagem selecionada';
      clear.hidden = true;
      upload?.classList.remove('ec-has-image');
      status.textContent = '';
    }
    function syncFile() {
      const file = fileInput?.files?.[0];
      if (!file) { resetFile(); return; }
      if (!acceptable(file)) {
        resetFile(); status.textContent = issue; status.classList.add('ec-error'); return;
      }
      status.classList.remove('ec-error');
      fileInfo.textContent = file.name;
      clear.hidden = false;
      upload?.classList.add('ec-has-image');
    }
    fileInput?.addEventListener('change', syncFile, true);
    clear.addEventListener('click', resetFile);
    upload?.addEventListener('dragover', e => { e.preventDefault(); upload.classList.add('ec-dragging'); });
    upload?.addEventListener('dragleave', () => upload.classList.remove('ec-dragging'));
    upload?.addEventListener('drop', e => {
      e.preventDefault(); upload.classList.remove('ec-dragging');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!acceptable(file)) { resetFile(); status.textContent = issue; status.classList.add('ec-error'); return; }
      try {
        const transfer = new DataTransfer(); transfer.items.add(file);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) { status.textContent = 'Toque em selecionar imagem para escolher a foto.'; }
    });
    $('#abrirModal')?.addEventListener('click', () => {
      form.reset(); resetFile();
      if (textarea) $('.ec-caption-count', captionRow).textContent = '0/2000';
    });
    form.addEventListener('submit', e => {
      if (!acceptable(fileInput?.files?.[0])) {
        e.preventDefault(); e.stopImmediatePropagation();
        status.textContent = 'Escolha uma imagem válida antes de publicar.';
        status.classList.add('ec-error');
        fileInput?.focus();
        return;
      }
      if (!textarea?.value.trim()) {
        e.preventDefault(); e.stopImmediatePropagation();
        status.textContent = 'Escreva uma legenda antes de publicar.';
        status.classList.add('ec-error');
        textarea?.focus();
      }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
        $('#abrirModal')?.focus();
      }
    });
  }

  function openStoryCreate() {
    const modal = $('#storyCreateModal');
    if (!modal) return;
    const form = $('#storyCreateForm');
    form?.reset();
    const preview = $('#storyPreview');
    if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
    const message = $('#storyCreateStatus');
    if (message) message.textContent = 'Seu Story ficará disponível por 24 horas.';
    modal.hidden = false;
    $('#storyImage')?.focus();
  }
  function buildStoryEditor() {
    const modal = $('#storyCreateModal');
    const form = $('#storyCreateForm');
    if (!modal || !form || modal.dataset.ecEnhanced) return;
    modal.dataset.ecEnhanced = '1';
    modal.classList.add('ec-story-compose-overlay');
    $('.story-create-box', modal)?.classList.add('ec-story-compose-card');
    const header = $('.story-create-header', modal);
    if ($('h2', header)) $('h2', header).textContent = 'Criar Story';
    if (header) {
      const tagline = make('p', 'ec-story-tagline', 'Uma imagem, um momento. Disponível por 24 horas.');
      header.insertAdjacentElement('afterend', tagline);
    }
    const input = $('#storyImage');
    const info = $('label[for="storyImage"]', form);
    if (info) info.textContent = 'Imagem do Story';
    const picker = make('div', 'ec-story-picker');
    picker.tabIndex = 0;
    picker.setAttribute('role', 'button');
    picker.setAttribute('aria-label', 'Escolher imagem do Story');
    picker.append(make('span', 'ec-picker-symbol', '▧'), make('strong', '', 'Selecionar imagem'), make('span', '', 'JPG, PNG, WebP ou GIF · até 5 MB'));
    input?.insertAdjacentElement('beforebegin', picker);
    input?.classList.add('ec-story-file-input');
    const choose = () => input?.click();
    picker.addEventListener('click', choose);
    picker.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
    const preview = $('#storyPreview');
    const fileLabel = make('p', 'ec-selected-name', 'Nenhuma imagem selecionada');
    picker.insertAdjacentElement('afterend', fileLabel);
    const status = $('#storyCreateStatus');
    if (status) status.classList.add('ec-story-hint');
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file && !acceptable(file)) {
        input.value = '';
        if (preview) preview.hidden = true;
        if (status) status.textContent = issue;
        fileLabel.textContent = 'Nenhuma imagem selecionada';
      } else fileLabel.textContent = file ? file.name : 'Nenhuma imagem selecionada';
    }, true);
    const caption = $('#storyCaption');
    if (caption) {
      const row = make('div', 'ec-caption-row');
      row.append(make('span', '', 'Legenda opcional'), make('span', 'ec-story-count', '0/200'));
      caption.insertAdjacentElement('beforebegin', row);
      caption.placeholder = 'Escreva algo sobre este momento...';
      caption.addEventListener('input', () => { $('.ec-story-count', row).textContent = caption.value.length + '/200'; });
    }
    form.querySelector('button[type=submit]')?.classList.add('ec-story-publish');
    form.addEventListener('submit', e => {
      if (acceptable(input?.files?.[0])) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (status) status.textContent = 'Escolha uma imagem válida antes de publicar.';
      input?.focus();
    }, true);
    picker.addEventListener('dragover', e => { e.preventDefault(); picker.classList.add('ec-dragging'); });
    picker.addEventListener('dragleave', () => picker.classList.remove('ec-dragging'));
    picker.addEventListener('drop', e => {
      e.preventDefault(); picker.classList.remove('ec-dragging');
      const file = e.dataTransfer?.files?.[0];
      if (!acceptable(file)) { if (status) status.textContent = issue; return; }
      try { const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
      catch (_) { if (status) status.textContent = 'Toque em selecionar imagem para escolher a foto.'; }
    });
    // O feed antigo também abria o modal de postagens ao tocar em "Seu Story +".
    // Interceptar apenas esse controle mantém os demais eventos originais intactos.
    document.addEventListener('click', e => {
      if (!e.target.closest('#abrirModalStory')) return;
      e.preventDefault(); e.stopPropagation();
      $('#modalCriar') && ($('#modalCriar').style.display = 'none');
      openStoryCreate();
    }, true);
  }

  function profileStoryViewer() {
    const root = $('.perfil-header');
    const nameNode = $('.perfil-username', root || document);
    if (!root || !nameNode) return;
    const username = nameNode.textContent.trim();
    if (!username) return;
    const targets = Array.from(root.querySelectorAll('.perfil-avatar-trigger, .perfil-avatar-ring'))
      .filter(node => !node.closest('.perfil-avatar-trigger') || node.classList.contains('perfil-avatar-trigger'));
    if (!targets.length) return;
    targets.forEach(node => {
      node.classList.add('ec-profile-photo-target');
      const ring = node.matches('.perfil-avatar-ring') ? node : $('.perfil-avatar-ring', node);
      const active = !!ring?.classList.contains('has-story');
      node.setAttribute('aria-label', active ? `Ver Story de ${username}` : `Ampliar foto de ${username}`);
      node.title = active ? 'Ver Story' : 'Ver foto de perfil';
      if (node.tagName !== 'BUTTON') {
        node.setAttribute('role', 'button'); node.tabIndex = 0;
        node.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.click(); }
        });
      }
    });
    // Uma janela independente para o perfil: o visualizador antigo existe apenas no feed.
    const overlay = make('div', 'ec-profile-viewer');
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Visualizador do perfil');
    overlay.innerHTML = `
      <div class="ec-viewer-backdrop" data-ec-close></div>
      <div class="ec-viewer-card">
        <header class="ec-viewer-header">
          <img class="ec-viewer-avatar" alt="">
          <div class="ec-viewer-title"><strong></strong><span></span></div>
          <button type="button" class="ec-viewer-close" data-ec-close aria-label="Fechar">×</button>
        </header>
        <div class="ec-viewer-progress"><span></span></div>
        <div class="ec-viewer-media"><img alt=""></div>
        <p class="ec-viewer-caption"></p>
        <footer class="ec-viewer-controls">
          <button type="button" class="ec-viewer-prev" aria-label="Story anterior">‹</button>
          <span class="ec-viewer-position"></span>
          <button type="button" class="ec-viewer-next" aria-label="Próximo Story">›</button>
        </footer>
        <p class="ec-viewer-error" role="status" aria-live="polite"></p>
      </div>`;
    document.body.append(overlay);
    const visual = $('.ec-viewer-media img', overlay);
    const avatar = $('.ec-viewer-avatar', overlay);
    const title = $('.ec-viewer-title strong', overlay);
    const subtitle = $('.ec-viewer-title span', overlay);
    const caption = $('.ec-viewer-caption', overlay);
    const progress = $('.ec-viewer-progress span', overlay);
    const prev = $('.ec-viewer-prev', overlay);
    const next = $('.ec-viewer-next', overlay);
    const position = $('.ec-viewer-position', overlay);
    const problem = $('.ec-viewer-error', overlay);
    let current = [], idx = 0, timer = null, returnFocus = null, lastWasPhoto = false, requestId = 0;
    const stop = () => { clearTimeout(timer); progress.style.animation = 'none'; };
    function close() {
      requestId++;
      stop(); overlay.hidden = true;
      visual.removeAttribute('src');
      if (returnFocus?.isConnected) returnFocus.focus();
    }
    function showPhoto() {
      stop(); lastWasPhoto = true;
      const photo = $('.perfil-avatar', root);
      if (!photo) return;
      visual.src = photo.currentSrc || photo.src;
      visual.alt = `Foto de perfil de ${username}`;
      avatar.src = visual.src;
      title.textContent = username;
      subtitle.textContent = 'Foto de perfil';
      caption.textContent = '';
      progress.style.display = 'none';
      $('.ec-viewer-controls', overlay).hidden = true;
      problem.textContent = '';
    }
    function show() {
      const story = current[idx];
      if (!story) { close(); return; }
      stop(); lastWasPhoto = false;
      visual.src = story.image_path;
      visual.alt = `Story de ${story.username}`;
      avatar.src = story.avatar || '/img/default-avatar.svg';
      title.textContent = story.username;
      subtitle.textContent = 'Story · disponível por 24 horas';
      caption.textContent = story.caption || '';
      progress.style.display = 'block';
      $('.ec-viewer-controls', overlay).hidden = false;
      position.textContent = `${idx + 1} de ${current.length}`;
      prev.disabled = idx === 0;
      next.textContent = idx === current.length - 1 ? '×' : '›';
      next.setAttribute('aria-label', idx === current.length - 1 ? 'Fechar Story' : 'Próximo Story');
      if (!story.own && !story.seen && typeof window.echoRequest === 'function') {
        story.seen = true;
        window.echoRequest(`/api/stories/${story.id}/view`, { method: 'POST' }).catch(() => {});
      }
      progress.style.animation = 'none';
      void progress.offsetWidth;
      progress.style.animation = 'ec-progress 6s linear forwards';
      timer = setTimeout(forward, 6000);
    }
    function forward() { if (idx >= current.length - 1) close(); else { idx++; show(); } }
    function backward() { if (idx > 0) { idx--; show(); } }
    async function open(source, hasStory) {
      const token = ++requestId;
      returnFocus = source.closest('.perfil-avatar-trigger') || source;
      overlay.hidden = false;
      problem.textContent = '';
      visual.removeAttribute('src');
      // A API confirma em tempo real se existem Stories; o aro pode estar desatualizado.
      stop();
      title.textContent = username;
      subtitle.textContent = 'Carregando Story...';
      caption.textContent = '';
      progress.style.display = 'none';
      $('.ec-viewer-controls', overlay).hidden = true;
      try {
        const response = typeof window.echoRequest === 'function'
          ? await window.echoRequest('/api/stories')
          : await fetch('/api/stories', { credentials: 'same-origin', cache: 'no-store' }).then(r => { if (!r.ok) throw Error('Não foi possível carregar Stories.'); return r.json(); });
        if (token !== requestId || overlay.hidden) return;
        current = (response.stories || []).filter(s => s.username?.toLocaleLowerCase('pt-BR') === username.toLocaleLowerCase('pt-BR'));
        current.sort((a,b) => Number(a.id) - Number(b.id));
        if (!current.length) {
          showPhoto();
          if (hasStory) problem.textContent = 'Este usuário não tem mais Stories ativos.';
          return;
        }
        idx = Math.max(0, current.findIndex(s => !s.seen && !s.own));
        show();
      } catch (_) {
        if (token !== requestId || overlay.hidden) return;
        showPhoto();
        problem.textContent = 'Não foi possível abrir o Story. Tente novamente.';
      }
      $('.ec-viewer-close', overlay)?.focus();
    }
    // Captura o toque antes da ação antiga `.open-edit` (editar perfil).
    // Tocar no pequeno ícone de câmera continua editando a foto.
    document.addEventListener('click', e => {
      const target = e.target.closest('.perfil-avatar-trigger, .perfil-avatar-ring');
      if (!target || !root.contains(target)) return;
      if (e.target.closest('.perfil-avatar-camera')) return;
      e.preventDefault();
      e.stopPropagation();
      const ring = target.matches('.perfil-avatar-ring') ? target : $('.perfil-avatar-ring', target);
      open(target, !!ring?.classList.contains('has-story'));
    }, true);
    overlay.querySelectorAll('[data-ec-close]').forEach(btn => btn.addEventListener('click', close));
    prev.addEventListener('click', backward);
    next.addEventListener('click', forward);
    document.addEventListener('keydown', e => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (!lastWasPhoto && e.key === 'ArrowLeft') backward();
      if (!lastWasPhoto && e.key === 'ArrowRight') forward();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && !overlay.hidden) close(); });
  }

  buildPostEditor();
  buildStoryEditor();
  profileStoryViewer();
})();
