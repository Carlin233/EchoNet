'use strict';
// Chat Sinais 2.0: integra a API do projeto, preserva a correção iPhone V3.
(() => {
  const chatBox = document.getElementById('chatBox');
  const form = document.getElementById('formMensagem');
  if (!chatBox || !form || !window.echoRequest) return;
  const input = form.elements.conteudo;
  const submit = form.querySelector('button[type="submit"]');
  const peer = form.elements.destinatario.value;
  const base = '/api/sinais/' + encodeURIComponent(peer);
  const replyBox = document.getElementById('sinaisReplyBar');
  const replyText = document.getElementById('sinaisReplyText');
  const typingLine = document.getElementById('sinaisTyping');
  const emojis = ['❤️', '😂', '😮', '😢', '👏', '🔥'];
  let replyId = null, signature = null, busy = false, sending = false;
  let lastTyping = 0, typingSent = false;
  const atBottom = () => chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 100;
  const request = (url, data) => window.echoRequest(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const cut = (s, length = 105) => String(s || '').length > length ? String(s).slice(0, length) + '…' : String(s || '');
  function resetReply() {
    replyId = null;
    replyBox.hidden = true;
    replyText.textContent = '';
  }
  function startReply(m) {
    replyId = Number(m.id);
    replyText.textContent = `${m.remetente}: ${cut(m.conteudo)}`;
    replyBox.hidden = false;
    input.focus();
  }
  function button(label, action, className = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = className;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', action);
    return b;
  }
  function renderMessage(m) {
    const node = document.createElement('div');
    node.className = 'msg ' + (String(m.remetente).toLowerCase() === peer.toLowerCase() ? 'outro' : 'eu');
    node.dataset.id = m.id;
    const raw = String(m.enviado_em || '');
    const date = raw ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z') : new Date();
    node.dataset.time = Number.isFinite(date.getTime()) ? date.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '';
    if (m.reply_to_id) {
      const quote = document.createElement('button');
      quote.type = 'button'; quote.className = 'sinais-quote';
      const who = document.createElement('strong'); who.textContent = m.reply_remetente || 'Mensagem';
      const text = document.createElement('span'); text.textContent = m.reply_conteudo ? cut(m.reply_conteudo, 120) : 'Mensagem original indisponível';
      quote.append(who, text);
      quote.addEventListener('click', () => {
        const target = [...chatBox.querySelectorAll('.msg[data-id]')].find(e => e.dataset.id === String(m.reply_to_id));
        if (target) { target.scrollIntoView({block: 'center', behavior: 'smooth'}); target.classList.add('sinais-highlight'); setTimeout(() => target.classList.remove('sinais-highlight'), 1400); }
      });
      node.appendChild(quote);
    }
    const content = document.createElement('div'); content.className = 'sinais-content'; content.textContent = m.conteudo;
    node.appendChild(content);
    const stats = document.createElement('div'); stats.className = 'sinais-reactions';
    for (const r of (m.reactions || [])) {
      stats.appendChild(button(`${r.emoji} ${r.count}`, () => react(m.id, r.emoji), 'sinais-reaction-chip' + (r.mine ? ' is-mine' : '')));
    }
    if (stats.childElementCount) node.appendChild(stats);
    const actions = document.createElement('div'); actions.className = 'sinais-actions';
    actions.appendChild(button('↩ Responder', () => startReply(m), 'sinais-action'));
    const trigger = button('☺ Reagir', () => { picker.hidden = !picker.hidden; }, 'sinais-action');
    actions.appendChild(trigger);
    const picker = document.createElement('div'); picker.className = 'sinais-picker'; picker.hidden = true;
    for (const emoji of emojis) picker.appendChild(button(emoji, () => { picker.hidden = true; react(m.id, emoji); }, 'sinais-emoji'));
    actions.appendChild(picker);
    node.appendChild(actions);
    return node;
  }
  async function refresh(force = false) {
    if (busy || (document.hidden && !force)) return;
    busy = true;
    try {
      const data = await window.echoRequest(base);
      const current = JSON.stringify(data.mensagens);
      typingLine.hidden = !data.digitando;
      typingLine.textContent = data.digitando ? `${peer} está digitando…` : '';
      if (!force && current === signature) return;
      const shouldScroll = force || atBottom();
      const oldScroll = chatBox.scrollTop;
      const fragment = document.createDocumentFragment();
      if (!data.mensagens.length) {
        const empty = document.createElement('p'); empty.className = 'chat-empty'; empty.textContent = 'Nenhuma mensagem ainda. Diga olá! 👋'; fragment.appendChild(empty);
      } else data.mensagens.forEach(m => fragment.appendChild(renderMessage(m)));
      chatBox.replaceChildren(fragment);
      signature = current;
      chatBox.scrollTop = shouldScroll ? chatBox.scrollHeight : oldScroll;
    } catch (e) { console.warn('Sinais 2.0: falha ao atualizar a conversa:', e.message); }
    finally { busy = false; }
  }
  async function react(id, emoji) {
    try { await request(base + '/reacao', { message_id: id, emoji }); signature = null; await refresh(); }
    catch (e) { alert(e.message); }
  }
  async function signalTyping(active) {
    if (active && (Date.now() - lastTyping < 2700)) return;
    if (!active && !typingSent) return;
    lastTyping = Date.now(); typingSent = active;
    try { await request(base + '/digitando', { digitando: active }); } catch { /* efêmero */ }
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending) return;
    const conteudo = input.value.trim();
    if (!conteudo) return;
    sending = true; submit.disabled = true;
    try {
      await request(base + '/mensagem', { conteudo, reply_to_id: replyId });
      input.value = ''; resetReply();
      void signalTyping(false);
      await refresh(true);
    } catch (err) { alert(err.message); }
    finally { sending = false; submit.disabled = false; input.focus(); }
  });
  input.addEventListener('input', () => { void signalTyping(Boolean(input.value.trim())); });
  input.addEventListener('blur', () => void signalTyping(false));
  document.getElementById('sinaisCancelReply')?.addEventListener('click', resetReply);
  setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
  setInterval(() => { if (!document.hidden && document.activeElement === input && input.value.trim()) void signalTyping(true); }, 3000);
  window.addEventListener('pagehide', () => { if (typingSent) void signalTyping(false); });
  chatBox.scrollTop = chatBox.scrollHeight;
  void refresh(true);
})();
