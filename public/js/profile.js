'use strict';
(() => {
  function tab(name) {
    document.querySelectorAll('.perfil-grid-panel').forEach(p => p.hidden = p.id !== 'tab-' + name);
    document.querySelectorAll('.perfil-tab').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }
  document.querySelectorAll('.perfil-tab').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  document.querySelectorAll('.open-archive').forEach(b => b.addEventListener('click', () => tab('archive')));
  document.querySelectorAll('.btn-follow').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const result = await window.echoRequest('/api/follow/' + encodeURIComponent(b.dataset.username), { method: 'POST' }); document.querySelectorAll('.btn-follow').forEach(x => x.textContent = result.following ? 'Seguindo' : 'Seguir'); document.querySelectorAll('.follower-count').forEach(x => x.textContent = result.followers); }
    catch (e) { alert(e.message); } finally { b.disabled = false; }
  }));
  document.querySelectorAll('.btn-archive').forEach(b => b.addEventListener('click', async () => {
    const post = b.closest('[data-post-id]');
    b.disabled = true;
    try { await window.echoRequest(`/api/posts/${post.dataset.postId}/archive`, { method: 'POST' }); location.reload(); }
    catch (e) { alert(e.message); b.disabled = false; }
  }));
  const modal = document.getElementById('editModal');
  if (modal) {
    document.querySelectorAll('.open-edit').forEach(b => b.addEventListener('click', () => { modal.style.display = 'flex'; }));
    document.getElementById('closeEdit').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    const avatarForm = document.getElementById('avatarUploadForm');
    const avatarInput = document.getElementById('avatarFile');
    const avatarPreview = document.getElementById('avatarPreview');
    const avatarStatus = document.getElementById('avatarStatus');
    const avatarFileName = document.getElementById('avatarFileName');
    const validAvatarTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    let previewUrl;
    avatarInput?.addEventListener('change', () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const file = avatarInput.files?.[0];
      avatarStatus.textContent = '';
      avatarFileName.textContent = file?.name || '';
      if (!file) return;
      if (!validAvatarTypes.includes(file.type) || file.size > 3 * 1024 * 1024) {
        avatarStatus.textContent = 'Escolha JPG, PNG, WebP ou GIF com até 3 MB.';
        avatarInput.value = '';
        avatarFileName.textContent = '';
        return;
      }
      previewUrl = URL.createObjectURL(file);
      avatarPreview.src = previewUrl;
    });
    avatarForm?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!avatarInput.files?.length) { avatarStatus.textContent = 'Escolha uma foto para continuar.'; return; }
      const button = avatarForm.querySelector('[type="submit"]');
      button.disabled = true;
      avatarStatus.textContent = 'Enviando foto...';
      try {
        await window.echoRequest('/api/perfil/avatar', { method: 'POST', body: new FormData(avatarForm) });
        avatarStatus.textContent = 'Foto atualizada!';
        location.reload();
      } catch (error) { avatarStatus.textContent = error.message; button.disabled = false; }
    });
    document.getElementById('removeAvatar')?.addEventListener('click', async e => {
      const button = e.currentTarget;
      if (!confirm('Remover sua foto de perfil e voltar à imagem padrão?')) return;
      button.disabled = true;
      avatarStatus.textContent = 'Removendo foto...';
      try {
        await window.echoRequest('/api/perfil/avatar/remover', { method: 'POST' });
        location.reload();
      } catch (error) { avatarStatus.textContent = error.message; button.disabled = false; }
    });
    document.getElementById('editProfileForm').addEventListener('submit', async e => {
      e.preventDefault();
      const status = document.getElementById('editStatus');
      const form = e.currentTarget, button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try { await window.echoRequest('/api/perfil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) }); location.reload(); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    });
  }
  document.getElementById('abrirModalPerfil')?.addEventListener('click', () => document.getElementById('abrirModal')?.click());
  document.getElementById('newPostButton')?.addEventListener('click', () => document.getElementById('abrirModal')?.click());
})();
