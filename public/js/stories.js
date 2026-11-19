'use strict';
(() => {
  const list = document.getElementById('storiesList');
  const createModal = document.getElementById('storyCreateModal');
  const viewerModal = document.getElementById('storyViewerModal');
  if (!list || !createModal || !viewerModal) return;
  const createForm = document.getElementById('storyCreateForm');
  const fileInput = document.getElementById('storyImage');
  const preview = document.getElementById('storyPreview');
  const status = document.getElementById('storyCreateStatus');
  const currentUser = document.querySelector('.stories-bar')?.dataset.currentUser;
  const el = (tag, css, text) => {
    const item = document.createElement(tag);
    if (css) item.className = css;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  let groups = [];
  let groupIndex = -1;
  let storyIndex = 0;
  let storyTimer;
  let imageUrl;
  let focusReturn;
  const currentStory = () => groups[groupIndex]?.stories[storyIndex];
  const stopTimer = () => { clearTimeout(storyTimer); document.getElementById('storyProgressFill').style.animation = 'none'; };
  const closeViewer = () => { stopTimer(); viewerModal.hidden = true; if (focusReturn?.isConnected) focusReturn.focus(); };
  const closeCreate = () => {
    createModal.hidden = true;
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    if (focusReturn?.isConnected) focusReturn.focus();
  };
  const openCreate = () => {
    focusReturn = document.activeElement;
    status.textContent = 'Seu Story ficará visível por 24 horas.';
    createForm.reset(); preview.hidden = true;
    createModal.hidden = false;
    fileInput.focus();
  };
  async function loadStories() {
    try {
      const data = await window.echoRequest('/api/stories');
      const grouped = new Map();
      data.stories.forEach(story => {
        if (!grouped.has(story.username)) grouped.set(story.username,{username:story.username,avatar:story.avatar,stories:[]});
        grouped.get(story.username).stories.unshift(story);
      });
      groups = [...grouped.values()].sort((a,b) => {
        if (a.username === currentUser) return -1;
        if (b.username === currentUser) return 1;
        return b.stories.at(-1).id - a.stories.at(-1).id;
      });
      list.querySelectorAll('.story-person,.stories-loading').forEach(item => item.remove());
      if (!groups.length) list.append(el('span','stories-loading','Nenhum Story ativo. Crie o primeiro!'));
      groups.forEach((group,i) => {
        const button = el('button','story-item story-person');
        button.type = 'button';
        button.setAttribute('aria-label', `Ver Stories de ${group.username}`);
        const ring = el('span','story-ring');
        const seen = group.stories.every(story => story.seen || story.own);
        if (seen) ring.classList.add('seen');
        const img = el('img'); img.src=group.avatar || '/img/default-avatar.svg'; img.alt='';
        ring.append(img);
        button.append(ring,el('span','story-name',group.username === currentUser ? 'Meus Stories' : group.username));
        button.addEventListener('click', () => openGroup(i,button));
        list.append(button);
      });
    } catch (error) {
      list.querySelectorAll('.stories-loading').forEach(item => item.remove());
      list.append(el('span','stories-loading','Stories indisponíveis. Atualize a página.'));
      console.warn('Stories:',error.message);
    }
  }
  function showStory() {
    const story = currentStory();
    if (!story) { closeViewer(); return; }
    stopTimer();
    document.getElementById('storyViewerAvatar').src = story.avatar || '/img/default-avatar.svg';
    const author = document.getElementById('storyViewerAuthor');
    author.textContent=story.username;
    author.href='/perfil/' + encodeURIComponent(story.username);
    document.getElementById('storyViewerCounter').textContent = `${storyIndex+1} de ${groups[groupIndex].stories.length}${story.own ? ' · ' + story.views + ' visualizações' : ''}`;
    const img=document.getElementById('storyViewerImage'); img.src=story.image_path; img.alt=`Story de ${story.username}`;
    document.getElementById('storyViewerCaption').textContent=story.caption || '';
    document.getElementById('storyDelete').hidden = !story.own;
    document.getElementById('storyPrevious').disabled = storyIndex === 0;
    document.getElementById('storyNext').setAttribute('aria-label',storyIndex+1>=groups[groupIndex].stories.length?'Fechar Stories':'Próximo Story');
    // Um usuário só registra uma visualização por Story, independentemente de reaberturas.
    if (!story.own && !story.seen) {
      story.seen = 1;
      window.echoRequest(`/api/stories/${story.id}/view`, { method:'POST' }).catch(e => console.warn('Visualização:', e.message));
    }
    const progress=document.getElementById('storyProgressFill');
    progress.style.animation='none'; void progress.offsetWidth;
    progress.style.animation='story-progress 6s linear forwards';
    storyTimer = setTimeout(nextStory, 6000);
  }
  function openGroup(index,button) {
    groupIndex=index;
    storyIndex = Math.max(0,groups[index].stories.findIndex(s => !s.seen && !s.own));
    focusReturn=button;
    viewerModal.hidden=false;
    showStory();
    document.getElementById('storyNext').focus();
  }
  function nextStory() {
    if (storyIndex+1 >= (groups[groupIndex]?.stories.length || 0)) {
      closeViewer(); loadStories(); return;
    }
    storyIndex++; showStory();
  }
  function previousStory() { if (storyIndex > 0) { storyIndex--; showStory(); } }
  document.getElementById('abrirModalStory')?.addEventListener('click',openCreate);
  document.querySelectorAll('[data-story-close]').forEach(x=>x.addEventListener('click',closeCreate));
  document.querySelectorAll('[data-view-close]').forEach(x=>x.addEventListener('click', () => { closeViewer(); loadStories(); }));
  document.getElementById('storyNext').addEventListener('click',nextStory);
  document.getElementById('storyPrevious').addEventListener('click',previousStory);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!createModal.hidden) closeCreate(); else if (!viewerModal.hidden) { closeViewer(); loadStories(); } }
    if (!viewerModal.hidden && e.key === 'ArrowRight') nextStory();
    if (!viewerModal.hidden && e.key === 'ArrowLeft') previousStory();
  });
  document.addEventListener('visibilitychange',()=> { if (document.hidden && !viewerModal.hidden) { closeViewer(); loadStories(); } });
  fileInput.addEventListener('change',()=> {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const file = fileInput.files?.[0];
    preview.hidden=true;
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 5*1024*1024) {
      status.textContent='Selecione uma imagem JPG, PNG, WebP ou GIF com até 5 MB.';
      fileInput.value='';
      return;
    }
    imageUrl=URL.createObjectURL(file);
    preview.src=imageUrl;
    preview.hidden=false;
    status.textContent='Seu Story ficará visível por 24 horas.';
  });
  createForm.addEventListener('submit',async event => {
    event.preventDefault();
    const button=createForm.querySelector('button[type=submit]');
    button.disabled=true;
    status.textContent='Publicando Story...';
    try {
      await window.echoRequest('/api/stories',{method:'POST',body:new FormData(createForm)});
      closeCreate();
      await loadStories();
    } catch(error) { status.textContent=error.message; }
    finally { button.disabled=false; }
  });
  document.getElementById('storyDelete').addEventListener('click',async e => {
    const story=currentStory();
    if (!story?.own || !confirm('Excluir este Story?')) return;
    e.currentTarget.disabled=true;
    try {
      await window.echoRequest(`/api/stories/${story.id}`,{method:'DELETE'});
      closeViewer();
      await loadStories();
    } catch(error) { alert(error.message); }
    finally { e.currentTarget.disabled=false; }
  });
  loadStories();
  setInterval(()=> { if (!document.hidden && viewerModal.hidden && createModal.hidden) loadStories(); },60000);
})();
