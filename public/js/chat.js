'use strict';
(() => {
  const chatBox = document.getElementById('chatBox');
  const form = document.getElementById('formMensagem');
  if (!chatBox || !form) return;
  const other = form.elements.destinatario.value;
  let lastMessage = 0;
  let fetching = false;
  function atEnd() { return chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 90; }
  async function refresh(force = false) {
    if (fetching || (document.hidden && !force)) return;
    fetching = true;
    try {
      const data = await window.echoRequest('/api/mensagens/' + encodeURIComponent(other));
      const messages = data.mensagens;
      const end = messages.length ? messages[messages.length - 1].id : 0;
      if (!force && lastMessage === end) return;
      const shouldScroll = force || atEnd();
      const frag = document.createDocumentFragment();
      if (!messages.length) {
        const empty = document.createElement('p'); empty.className = 'chat-empty'; empty.textContent = 'Nenhuma mensagem ainda. Diga olá! 👋'; frag.appendChild(empty);
      }
      messages.forEach(m => {
        const message = document.createElement('div');
        message.className = 'msg ' + (m.remetente === other ? 'outro' : 'eu');
        message.textContent = m.conteudo;
        const date = m.enviado_em ? new Date(String(m.enviado_em).replace(' ', 'T') + (String(m.enviado_em).includes('Z') ? '' : 'Z')) : new Date();
        message.dataset.time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        frag.appendChild(message);
      });
      chatBox.replaceChildren(frag);
      lastMessage = end;
      if (shouldScroll) chatBox.scrollTop = chatBox.scrollHeight;
    } catch (e) { console.warn('Falha ao atualizar conversa:', e.message); }
    finally { fetching = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = form.elements.conteudo, content = input.value.trim();
    if (!content) return;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await window.echoRequest('/mensagens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinatario: other, conteudo: content }) });
      input.value = '';
      await refresh(true);
    } catch (e) { alert(e.message); } finally { button.disabled = false; input.focus(); }
  });
  chatBox.scrollTop = chatBox.scrollHeight;
  refresh(true);
  setInterval(() => refresh(false), 5000);
})();
