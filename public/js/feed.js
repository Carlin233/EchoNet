'use strict';
(() => {
  async function copyLink(card) {
    const url = new URL('/post/' + card.dataset.postId, location.origin).href;
    if (navigator.share) {
      try { await navigator.share({ title: 'Publicação no EchoNet', url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      alert('Link copiado!');
    } else window.prompt('Copie o link:', url);
  }
  function element(tag, cssClass, text) {
    const el = document.createElement(tag);
    if (cssClass) el.className = cssClass;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  async function showComments(card, force = false) {
    const wrap = card.querySelector('.comments-panel');
    if (!wrap) return;
    if (!force && !wrap.hidden) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const list = wrap.querySelector('.comments-list');
    list.replaceChildren(element('p', 'comments-loading', 'Carregando comentários...'));
    try {
      const { comments } = await window.echoRequest(`/api/posts/${card.dataset.postId}/comments`);
      list.replaceChildren();
      if (!comments.length) list.appendChild(element('p', 'comments-loading', 'Seja o primeiro a comentar.'));
      comments.forEach(comment => {
        const p = element('div', 'comment-item');
        const avatarLink = element('a', 'comment-avatar-link');
        avatarLink.href = '/perfil/' + encodeURIComponent(comment.username);
        const avatar = element('img', 'comment-avatar');
        avatar.src = comment.avatar || '/img/default-avatar.svg'; avatar.alt = '';
        avatarLink.append(avatar);
        const content = element('p', 'comment-content');
        const author = element('a', 'comment-author', comment.username);
        author.href = avatarLink.href;
        content.append(author, document.createTextNode(' ' + comment.conteudo));
        p.append(avatarLink, content);
        list.appendChild(p);
      });
    } catch (error) { list.replaceChildren(element('p', 'error-message', error.message)); }
  }
  document.querySelectorAll('.post-card').forEach(card => {
    const id = card.dataset.postId;
    const like = card.querySelector('.btn-like');
    const save = card.querySelector('.action-save');
    const count = card.querySelector('.like-count');
    function setIcon(button, active, iconName, activeClass) {
      button.classList.toggle(activeClass, active);
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('i').className = `${active ? 'fa-solid' : 'fa-regular'} fa-${iconName}`;
    }
    like?.addEventListener('click', async () => {
      like.disabled = true;
      try { const result = await window.echoRequest(`/api/posts/${id}/like`, { method: 'POST' }); setIcon(like, result.liked, 'heart', 'liked'); count.textContent = result.count; }
      catch (e) { alert(e.message); } finally { like.disabled = false; }
    });
    save?.addEventListener('click', async () => {
      save.disabled = true;
      try { const result = await window.echoRequest(`/api/posts/${id}/save`, { method: 'POST' }); setIcon(save, result.saved, 'bookmark', 'saved'); save.title = result.saved ? 'Remover dos salvos' : 'Salvar'; }
      catch (e) { alert(e.message); } finally { save.disabled = false; }
    });
    card.querySelectorAll('.btn-comment, .post-comments-link').forEach(btn => btn.addEventListener('click', () => showComments(card)));
    card.querySelectorAll('.btn-share, .post-more').forEach(btn => btn.addEventListener('click', () => copyLink(card).catch(e => alert(e.message))));
    card.querySelector('.comment-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, input = form.elements.conteudo;
      const content = input.value.trim(); if (!content) return;
      const button = form.querySelector('button'); button.disabled = true;
      try { const result = await window.echoRequest(`/api/posts/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conteudo: content }) }); input.value = ''; card.querySelector('.comments-count').textContent = result.count; await showComments(card, true); }
      catch (e) { alert(e.message); } finally { button.disabled = false; }
    });
  });
  const list = document.getElementById('usuariosOnline');
  const loadOnline = async () => {
    if (!list) return;
    try {
      const users = await window.echoRequest('/online-users');
      list.replaceChildren();
      if (!users.length) { list.appendChild(element('li', 'empty-suggestion', 'Nenhuma sugestão no momento.')); return; }
      users.slice(0, 8).forEach(user => {
        const li = element('li', 'user-row');
        const link = element('a', 'suggestion-user'); link.href = '/perfil/' + encodeURIComponent(user.username);
        const avatar = document.createElement('img'); avatar.src = user.avatar || '/img/default-avatar.svg'; avatar.alt = '';
        const info = element('div', 'user-info'), name = element('span', 'name', user.username);
        const status = element('span', 'sub', user.status === 'online' ? '● Online' : user.status === 'away' ? '● Ausente' : '● Offline');
        info.append(name, status); link.append(avatar, info);
        const follow = element('button', 'follow-btn', user.following ? 'Seguindo' : 'Seguir');
        follow.type = 'button';
        follow.addEventListener('click', async () => {
          follow.disabled = true;
          try { const result = await window.echoRequest('/api/follow/' + encodeURIComponent(user.username), { method: 'POST' }); follow.textContent = result.following ? 'Seguindo' : 'Seguir'; }
          catch (e) { alert(e.message); } finally { follow.disabled = false; }
        });
        li.append(link, follow); list.append(li);
      });
    } catch (e) { list.replaceChildren(element('li', 'empty-suggestion', 'Não foi possível carregar as sugestões.')); }
  };
  loadOnline();
  if (list) setInterval(() => { if (!document.hidden) loadOnline(); }, 30000);

})();
