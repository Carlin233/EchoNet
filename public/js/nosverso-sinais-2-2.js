'use strict';
// Nósverso Sinais 2.2 — substitui APENAS o JS do chat 2.0 (não roda junto com ele).
(() => {
  const chat = document.getElementById('chatBox');
  const form = document.getElementById('formMensagem');
  if (!chat || !form || !window.echoRequest || !document.getElementById('sinais22Attach')) return;
  const peer = form.elements.destinatario.value;
  const base = '/api/sinais22/' + encodeURIComponent(peer);
  const oldBase = '/api/sinais/' + encodeURIComponent(peer);
  const input = form.elements.conteudo;
  const submit = form.querySelector('button[type="submit"]');
  const fileInput = document.getElementById('sinais22File');
  const attach = document.getElementById('sinais22Attach');
  const record = document.getElementById('sinais22Record');
  const preview = document.getElementById('sinais22Preview');
  const previewText = document.getElementById('sinais22PreviewText');
  const previewMedia = document.getElementById('sinais22PreviewMedia');
  const cancelFile = document.getElementById('sinais22CancelFile');
  const alertLine = document.getElementById('sinais22Status');
  const replyBar = document.getElementById('sinaisReplyBar');
  const replyText = document.getElementById('sinaisReplyText');
  const typingLine = document.getElementById('sinaisTyping');
  const emojis = ['❤️','😂','😮','😢','👏','🔥'];
  let replyId = null, selectedFile = null, audioDuration = null, previewObjectUrl = null;
  let recorder = null, stream = null, recordingSince = 0, recordTimeout = null;
  let sending = false, busy = false, typingSent = false, lastTyping = 0;
  let latestMarked = 0;
  const button = (label, action, name = '') => { const b = document.createElement('button'); b.type='button'; b.className=name; b.textContent=label; b.setAttribute('aria-label',label); b.addEventListener('click',action); return b; };
  const post = (url, data) => window.echoRequest(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const cut = (s,n=100) => String(s || '').length>n ? String(s).slice(0,n)+'…' : String(s || '');
  const isMine = m => String(m.destinatario).toLowerCase() === peer.toLowerCase();
  const nearBottom = () => chat.scrollHeight-chat.scrollTop-chat.clientHeight<110;
  const say = message => { alertLine.textContent = message || ''; alertLine.hidden = !message; };
  const mediaDesc = m => ({audio:'Áudio',imagem:'Foto',video:'Vídeo'}[m.media_tipo] || m.conteudo || 'Mensagem');
  const dateToTime = raw => {
    if(!raw)return '';
    const d = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(raw)) ? raw : String(raw).replace(' ','T')+'Z');
    return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
  };
  function clearReply() { replyId=null;replyText.textContent='';replyBar.hidden=true; }
  function chooseReply(m) { replyId=Number(m.id);replyText.textContent=`${m.remetente}: ${cut(m.conteudo || mediaDesc(m))}`;replyBar.hidden=false;input.focus(); }
  function clearMedia(){ selectedFile=null;audioDuration=null;fileInput.value='';preview.hidden=true;previewText.textContent='';previewMedia.replaceChildren();if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null;} }
  function selected(file, duration = null) {
    if(!file)return clearMedia();
    const image=file.type.startsWith('image/'), video=file.type.startsWith('video/'), audio=file.type.startsWith('audio/');
    const limit=video?18*1024*1024:8*1024*1024;
    if(!(image||video||audio)||file.size>limit){say(`Arquivo não aceito. Limite: ${video?'18':'8'} MB.`);return clearMedia();}
    previewMedia.replaceChildren();if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null;}
    selectedFile=file;audioDuration=duration;
    if (image || video || audio) {
      previewObjectUrl=URL.createObjectURL(file);
      const element=document.createElement(image?'img':video?'video':'audio');
      element.src=previewObjectUrl;
      if(image)element.alt='Pré-visualização da foto';
      else {element.controls=true;element.preload='metadata';if(video){element.playsInline=true;element.muted=true;}}
      previewMedia.appendChild(element);
    }
    previewText.textContent=`${audio?'🎙️':image?'📷':'🎬'} ${cut(file.name || 'Gravação',55)} · ${(file.size/(1024*1024)).toFixed(1)} MB`;
    preview.hidden=false;say('');
  }
  async function react(id,emoji) { try {await post(oldBase+'/reacao',{message_id:id,emoji});await refresh(true);} catch(e){say(e.message);} }
  function buildMessage(m){
    const node=document.createElement('div');node.className='msg '+(isMine(m)?'eu':'outro');node.dataset.id=String(m.id);
    node.dataset.time=dateToTime(m.enviado_em);
    if(m.reply_to_id){
      const quote=button('',()=>{const target=[...chat.querySelectorAll('.msg')].find(n=>n.dataset.id===String(m.reply_to_id));if(target){target.scrollIntoView({block:'center',behavior:'smooth'});target.classList.add('sinais-highlight');window.setTimeout(()=>target.classList.remove('sinais-highlight'),1400);}},'sinais-quote');
      const who=document.createElement('strong');who.textContent=m.reply_remetente || 'Mensagem';
      const excerpt=document.createElement('span');excerpt.textContent=cut(m.reply_conteudo||({audio:'🎙️ Áudio',imagem:'📷 Foto',video:'🎬 Vídeo'}[m.reply_media_tipo]||'Mensagem original indisponível'),120);
      quote.append(who,excerpt);node.appendChild(quote);
    }
    if(m.media_url && ['audio','imagem','video'].includes(m.media_tipo)){
      const frame=document.createElement('div');frame.className='sinais22-media';
      if(m.media_tipo==='imagem'){
        const a=document.createElement('a');a.href=m.media_url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Abrir foto em tamanho original');
        const img=document.createElement('img');img.src=m.media_url;img.alt='Foto enviada na conversa';img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img);frame.append(a);
      } else if(m.media_tipo==='video'){
        const v=document.createElement('video');v.controls=true;v.preload='metadata';v.playsInline=true;v.src=m.media_url;v.setAttribute('aria-label','Vídeo recebido');frame.append(v);
      } else {
        const label=document.createElement('span');label.className='sinais22-audio-label';label.textContent='🎙️ Mensagem de voz'+(m.duracao_segundos?` · ${m.duracao_segundos}s`:'');
        const a=document.createElement('audio');a.controls=true;a.preload='none';a.src=m.media_url;a.setAttribute('aria-label','Reproduzir mensagem de áudio');frame.append(label,a);
      }
      node.appendChild(frame);
    }
    if(m.conteudo){const content=document.createElement('div');content.className='sinais-content';content.textContent=m.conteudo;node.append(content);}
    const reactions=document.createElement('div');reactions.className='sinais-reactions';
    for(const r of m.reactions || []) reactions.appendChild(button(`${r.emoji} ${r.count}`,()=>react(m.id,r.emoji),'sinais-reaction-chip'+(r.mine?' is-mine':'')));
    if(reactions.children.length)node.append(reactions);
    const actions=document.createElement('div');actions.className='sinais-actions';
    actions.appendChild(button('↩ Responder',()=>chooseReply(m),'sinais-action'));
    const picker=document.createElement('div');picker.className='sinais-picker';picker.hidden=true;
    actions.appendChild(button('☺ Reagir',()=>picker.hidden=!picker.hidden,'sinais-action'));
    for(const emoji of emojis)picker.appendChild(button(emoji,()=>{picker.hidden=true;void react(m.id,emoji);},'sinais-emoji'));
    actions.append(picker);node.append(actions);
    if(isMine(m)){
      const receipt=document.createElement('span');receipt.className='sinais22-receipt';receipt.setAttribute('role','status');node.append(receipt);
    }
    updateReceipt(node,m);
    return node;
  }
  function updateReceipt(node,m){
    const r=node.querySelector('.sinais22-receipt');if(!r)return;
    const label=m.lido_em?'✓✓ Lida':m.entregue_em?'✓✓ Entregue':'✓ Enviada';
    r.textContent=label;r.classList.toggle('is-read',Boolean(m.lido_em));r.setAttribute('aria-label',label);
  }
  async function markRead(messages) {
    if(document.hidden)return;
    const last=messages.filter(m=>!isMine(m)).at(-1);
    if(!last||Number(last.id)<=latestMarked)return;
    try {await post(base+'/ler',{ate_id:last.id});latestMarked=Number(last.id);} catch(e){console.warn('Leitura indisponível:',e.message);}
  }
  async function refresh(force=false){
    if(busy||(document.hidden&&!force))return;
    busy=true;
    try {
      const result=await window.echoRequest(base);
      const messages=result.mensagens||[];
      const bottom=force||nearBottom();
      const oldTop=chat.scrollTop;
      const nodes=new Map([...chat.querySelectorAll(':scope > .msg[data-id]')].map(n=>[n.dataset.id,n]));
      const wanted=new Set(messages.map(m=>String(m.id)));
      for(const [id,node] of nodes)if(!wanted.has(id)){node.remove();nodes.delete(id);}
      if(!messages.length){chat.replaceChildren();const p=document.createElement('p');p.className='chat-empty';p.textContent='Nenhuma mensagem ainda. Diga olá! 👋';chat.append(p);}
      else {
        chat.querySelector('.chat-empty')?.remove();
        let after=null;
        for(const m of messages){
          const id=String(m.id), serialized=JSON.stringify({reply:m.reply_to_id,quote:m.reply_conteudo,quoteWho:m.reply_remetente,content:m.conteudo,kind:m.media_tipo,url:m.media_url,duration:m.duracao_segundos,reactions:m.reactions});
          let node=nodes.get(id);
          if(!node||node.dataset.version!==serialized){const replacement=buildMessage(m);replacement.dataset.version=serialized;if(node)node.replaceWith(replacement);node=replacement;nodes.set(id,node);}
          else updateReceipt(node,m);
          // Não desmonta elementos <audio>/<video> se os dados não mudaram.
          if(after){if(node.previousElementSibling!==after)after.after(node);}else if(chat.firstElementChild!==node)chat.prepend(node);
          after=node;
        }
      }
      chat.scrollTop=bottom?chat.scrollHeight:oldTop;
      void markRead(messages);
      // Mantém o indicador de digitação existente do Sinais 2.0.
      try { const typing = await window.echoRequest(oldBase);typingLine.hidden=!typing.digitando;typingLine.textContent=typing.digitando?`${peer} está digitando…`:''; }catch{typingLine.hidden=true;}
    }catch(e){console.warn('Sinais 2.2:',e.message);say('Não foi possível atualizar a conversa.');}
    finally{busy=false;}
  }
  async function signalTyping(active){
    if(active&&Date.now()-lastTyping<2700)return;
    if(!active&&!typingSent)return;
    lastTyping=Date.now();typingSent=active;
    try{await post(oldBase+'/digitando',{digitando:active});}catch{}
  }
  async function send(){
    if(sending || recorder?.state==='recording')return;
    const content=input.value.trim();
    if(!content&&!selectedFile)return;
    sending=true;submit.disabled=true;attach.disabled=true;record.disabled=true;say('');
    try {
      if(selectedFile){
        const data=new FormData();data.append('arquivo',selectedFile,selectedFile.name||'gravacao.webm');data.append('conteudo',content);
        if(replyId)data.append('reply_to_id',String(replyId));
        if(audioDuration!=null)data.append('duracao_segundos',String(audioDuration));
        await window.echoRequest(base+'/arquivo',{method:'POST',body:data});clearMedia();
      }else await post(oldBase+'/mensagem',{conteudo:content,reply_to_id:replyId});
      input.value='';clearReply();void signalTyping(false);await refresh(true);
    }catch(e){say(e.message||'Não foi possível enviar.');}
    finally{sending=false;submit.disabled=false;attach.disabled=false;record.disabled=false;}
  }
  async function toggleRecord(){
    if(recorder?.state==='recording'){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){say('Gravação indisponível neste navegador.');return;}
    if(sending)return;
    try {
      clearMedia();
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const preferred=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'];
      const mime=preferred.find(m=>MediaRecorder.isTypeSupported?.(m));
      recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      const chunks=[];recordingSince=Date.now();
      recorder.addEventListener('dataavailable',e=>{if(e.data.size)chunks.push(e.data);});
      recorder.addEventListener('stop',()=>{
        clearTimeout(recordTimeout);stream?.getTracks().forEach(t=>t.stop());stream=null;
        record.classList.remove('is-recording');record.setAttribute('aria-pressed','false');record.textContent='🎙️';
        const seconds=Math.min(90,Math.ceil((Date.now()-recordingSince)/1000));
        const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]||'audio/webm'});
        if(blob.size){selected(new File([blob],`audio-${Date.now()}.${blob.type==='audio/mp4'?'m4a':blob.type==='audio/ogg'?'ogg':'webm'}`,{type:blob.type}),seconds);}else say('Não foi possível gravar o áudio.');
        recorder=null;
      },{once:true});
      recorder.start(1000);record.textContent='⏹️';record.classList.add('is-recording');record.setAttribute('aria-pressed','true');
      say('Gravando… toque em ⏹ para parar (máximo 90 segundos).');
      recordTimeout=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},90_000);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;say('Permissão do microfone negada ou indisponível.');}
  }
  form.addEventListener('submit',e=>{e.preventDefault();void send();});
  attach.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',()=>selected(fileInput.files?.[0]));
  cancelFile.addEventListener('click',clearMedia);
  record.addEventListener('click',()=>void toggleRecord());
  document.getElementById('sinaisCancelReply')?.addEventListener('click',clearReply);
  input.addEventListener('input',()=>void signalTyping(Boolean(input.value.trim())));
  input.addEventListener('blur',()=>void signalTyping(false));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);else void signalTyping(false);});
  window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);if(typingSent)void signalTyping(false);});
  window.setInterval(()=>{if(!document.hidden)void refresh();},3500);
  window.setInterval(()=>{if(!document.hidden&&document.activeElement===input&&input.value.trim())void signalTyping(true);},3000);
  chat.scrollTop=chat.scrollHeight;void refresh(true);
})();
