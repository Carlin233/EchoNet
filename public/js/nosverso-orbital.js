/* Nósverso Orbital: marca, scroll parallax decorativo e atalhos existentes.
   Não intercepta navegação, não altera APIs nem dados. */
(() => {
 'use strict';
 const html=document.documentElement;
 const brandSrc='/img/nosverso-orbital/logo.svg';
 function replaceBrand(selector){
   document.querySelectorAll(selector).forEach(el=>{
     if(el.dataset.cxLogo==='1')return;
     const img=document.createElement('img'); img.src=brandSrc;img.alt='';img.className='cx-mark';img.setAttribute('aria-hidden','true');
     const span=document.createElement('span');span.textContent='Nósverso';span.className='cx-brand-name';
     el.replaceChildren(img,span);el.dataset.cxLogo='1';
     el.setAttribute('aria-label','Nósverso'); if(el.matches('a')) el.setAttribute('title','Nósverso');
   });
 }
 function init(){
   html.classList.remove('nv-space','echonet-nova','echonet-pulse');
   html.classList.add('cosmos-active');
   replaceBrand('.sidebar-brand, .mobile-header-logo, .natal-brand, .form-logo');
   document.querySelectorAll('img.phone-logo').forEach(img=>{img.src=brandSrc;img.alt='Nósverso';});
   document.querySelectorAll('.login-footer').forEach(el=>{el.textContent=el.textContent.replace(/EchoNet/g,'Nósverso');});
   if(document.title.includes('EchoNet'))document.title=document.title.replace(/EchoNet/g,'Nósverso');
   // Só remove decorações dos temas antigos, sem tocar nos posts ou Stories.
   document.querySelectorAll('.nv-deck,.nova-hero,.pulse-feed-switches').forEach(el=>el.remove());
   const scene=document.querySelector('[data-cosmos-scene]');
   if(scene){
     const create=scene.querySelector('[data-cosmos-create]');
     if(create){
       const target=document.querySelector('#abrirModal,#newPostButton,#abrirModalPerfil');
       if(target && target!==create)create.addEventListener('click',()=>target.click());
       else create.hidden=true;
     }
     const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
     if(!reduced){
       let y=0,mx=0,my=0,frame=0;
       const draw=()=>{
         frame=0;
         const b=scene.getBoundingClientRect();
         if(b.bottom < -120 || b.top > window.innerHeight+120)return;
         y=Math.max(-1,Math.min(1,(window.innerHeight/2-(b.top+b.height/2))/Math.max(b.height,1)));
         scene.style.setProperty('--cx-scroll',y.toFixed(3));
         scene.style.setProperty('--cx-mx',mx.toFixed(3));
         scene.style.setProperty('--cx-my',my.toFixed(3));
         scene.style.setProperty('--cx-star-x',(-15*mx).toFixed(1)+'px');
         scene.style.setProperty('--cx-star-y',(-30*y).toFixed(1)+'px');
         scene.style.setProperty('--cx-neb-x',(25*mx).toFixed(1)+'px');
         scene.style.setProperty('--cx-neb-y',(28*y).toFixed(1)+'px');
         scene.style.setProperty('--cx-world-x',(26*mx).toFixed(1)+'px');
         scene.style.setProperty('--cx-world-y',(-46*y+16*my).toFixed(1)+'px');
         scene.style.setProperty('--cx-world-rotate',(4*mx).toFixed(1)+'deg');
       };
       const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(draw);};
       window.addEventListener('scroll',schedule,{passive:true});
       window.addEventListener('resize',schedule,{passive:true});
       if(window.matchMedia('(pointer:fine)').matches){
         scene.addEventListener('pointermove',e=>{
           const r=scene.getBoundingClientRect();
           mx=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width/2)));
           my=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height/2)));
           schedule();
         },{passive:true});
         scene.addEventListener('pointerleave',()=>{mx=0;my=0;schedule();},{passive:true});
       }
       schedule();
     }
   }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
