/* NÓSVERSO COSMIC MOTION
 * Renomeia APENAS rótulos de navegação, sem modificar links/eventos.
 * Canvas decorativo do fundo: desliga em telas pequenas, aba oculta e movimento reduzido.
 */
(() => {
  'use strict';
  const onReady = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  onReady(() => {
    if (!document.documentElement.classList.contains('cosmos-active')) return;
    // Os href e IDs originais são preservados para não interferir nas rotas.
    const map = [
      ['a.sidebar-link[href="/"]', 'Órbita', 'Órbita — início'],
      ['a.sidebar-link.sidebar-create', 'Lançar', 'Lançar — criar publicação'],
      ['a.sidebar-link[href="/mensagens"]', 'Sinais', 'Sinais — mensagens'],
      ['a.sidebar-link[href="/perfil"]', 'Constelação', 'Constelação — perfil'],
      ['a.sidebar-link[href="/configuracoes"]', 'Comando', 'Comando — configurações'],
      ['a.sidebar-link[href="/notificacoes"]', 'Pulsos', 'Pulsos — notificações'],
      ['a.sidebar-link[href="/explorar"]', 'Horizontes', 'Horizontes — explorar']
    ];
    for (const [selector, label, accessible] of map) {
      document.querySelectorAll(selector).forEach((a) => {
        const span = a.querySelector('span');
        if (span) span.textContent = label;
        a.title = accessible;
        a.setAttribute('aria-label', accessible);
      });
    }
    // Descoberta espacial: reaproveita a lista real e os botões seguir do feed.js.
    // Não substituímos #usuariosOnline, para preservar atualizações e eventos da API.
    const friendsAside = document.querySelector('aside.barra-online');
    const friendList = friendsAside?.querySelector('#usuariosOnline');
    const friendTitle = friendsAside?.querySelector(':scope > h3');
    if (friendsAside && friendList && friendTitle && !friendsAside.querySelector('.ncm-discovery-panel')) {
      const panel = document.createElement('section');
      panel.className = 'ncm-discovery-panel';
      panel.setAttribute('aria-label','Descobrir pessoas no Nósverso');
      const heading = document.createElement('div');
      heading.className = 'ncm-discovery-header';
      const kicker = document.createElement('span');
      kicker.className = 'ncm-discovery-kicker';
      kicker.textContent = 'Conexões cósmicas';
      friendTitle.textContent = 'Novas constelações';
      friendTitle.id = 'ncm-discovery-title';
      const intro = document.createElement('p');
      intro.className = 'ncm-discovery-intro';
      intro.textContent = 'Encontre pessoas para expandir seu universo.';
      const planet = document.createElement('div');
      planet.className = 'ncm-discovery-planet';
      planet.setAttribute('aria-hidden','true');
      heading.append(kicker,friendTitle,intro,planet);
      const caption = document.createElement('p');
      caption.className = 'ncm-discovery-count';
      caption.textContent = 'Mundos para explorar';
      const footer = document.createElement('p');
      footer.className = 'ncm-discovery-footer';
      const spark = document.createElement('span');
      spark.className = 'ncm-spark';
      spark.textContent = '✦';
      const footText = document.createElement('span');
      footText.textContent = 'Cada nova conexão amplia sua galáxia.';
      footer.append(spark,footText);
      panel.append(heading,caption,friendList,footer);
      friendsAside.append(panel);
    }

    // Cabeçalho da lista de conversas; não mexe no conteúdo das mensagens.
    if (location.pathname.startsWith('/mensagens')) {
      document.querySelectorAll('.lista-contatos h3').forEach(h => {
        if (h.textContent.trim() === 'Mensagens') h.textContent = 'Sinais';
      });
    }
    if (!document.body.matches('.app-layout,.chat-layout,.settings-layout')) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = matchMedia('(min-width: 761px) and (pointer:fine)');
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && connection.saveData) return;
    let canvas, ctx, raf=0, spawnTimer=0, meteors=[], lastTime=0;
    function resize(){
      if (!canvas) return;
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(innerWidth * scale);
      canvas.height = Math.round(innerHeight * scale);
      canvas.style.width = innerWidth+'px';
      canvas.style.height = innerHeight+'px';
      ctx.setTransform(scale,0,0,scale,0,0);
    }
    function draw(time){
      raf=0;
      if (!canvas || document.hidden || reduced.matches || !desktop.matches) return;
      const dt = lastTime ? Math.min(45, time-lastTime)/1000 : 0.016;
      lastTime=time;
      ctx.clearRect(0,0,innerWidth,innerHeight);
      meteors=meteors.filter(m=>m.life<1);
      for(const m of meteors){
        m.x+=m.vx*dt;m.y+=m.vy*dt;m.life+=dt/m.duration;
        const a=Math.sin(Math.PI * Math.min(m.life,1))*m.opacity;
        if(a<=0) continue;
        const tx=m.x-m.vx*m.tail/Math.hypot(m.vx,m.vy);
        const ty=m.y-m.vy*m.tail/Math.hypot(m.vx,m.vy);
        const g=ctx.createLinearGradient(tx,ty,m.x,m.y);
        g.addColorStop(0,'rgba(255,110,24,0)');
        g.addColorStop(.58,`rgba(${m.warm?'255,120,51':'64,177,255'},${(a*.23).toFixed(3)})`);
        g.addColorStop(1,`rgba(${m.warm?'255,226,154':'200,242,255'},${(a*.95).toFixed(3)})`);
        ctx.strokeStyle=g;ctx.lineCap='round';ctx.lineWidth=m.radius*2;
        ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(m.x,m.y);ctx.stroke();
        ctx.fillStyle=`rgba(255,248,221,${a.toFixed(3)})`;
        ctx.beginPath();ctx.arc(m.x,m.y,m.radius*.7,0,Math.PI*2);ctx.fill();
      }
      if(meteors.length)raf=requestAnimationFrame(draw);
    }
    function spawn(){
      clearTimeout(spawnTimer);spawnTimer=0;
      if(!canvas || document.hidden || reduced.matches || !desktop.matches)return;
      // Diagonal celeste; meteoros ocasionais, nunca cobrindo interações.
      const w=innerWidth,h=innerHeight;
      const y=Math.random()*h*.55;
      const speed=340+Math.random()*240;
      const duration=1.1+Math.random()*.95;
      meteors.push({x:-120-Math.random()*140,y,
        vx:speed,vy:speed*(.25+Math.random()*.18),life:0,duration,
        tail:130+Math.random()*210,radius:1.1+Math.random()*1.4,
        warm:Math.random()>.25,opacity:.38+Math.random()*.29});
      if(!raf){lastTime=0;raf=requestAnimationFrame(draw);}
      spawnTimer=setTimeout(spawn,2400+Math.random()*4300);
    }
    function stop(){
      clearTimeout(spawnTimer);spawnTimer=0;
      cancelAnimationFrame(raf);raf=0;lastTime=0;
      meteors=[];
      if(canvas){canvas.remove();canvas=null;ctx=null;}
    }
    function sync(){
      if (reduced.matches || !desktop.matches || document.hidden){stop();return;}
      if(canvas)return;
      canvas=document.createElement('canvas');
      canvas.className='ncm-meteor-sky';
      canvas.setAttribute('aria-hidden','true');
      document.body.prepend(canvas);
      ctx=canvas.getContext('2d',{alpha:true});
      if(!ctx){stop();return;}
      resize();spawnTimer=setTimeout(spawn,850);
    }
    document.addEventListener('visibilitychange',sync);
    window.addEventListener('resize',resize,{passive:true});
    reduced.addEventListener?.('change',sync);
    desktop.addEventListener?.('change',sync);
    sync();
  });
})();
