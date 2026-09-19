(() => {
  if (globalThis.__fillframe) return;
  globalThis.__fillframe = true;
  const defaults = () => ({ mode: 'original', ratio: 'auto', zoom: 1, x: 0, y: 0, remember: false });
  let state = defaults(), video, container, host, root, scheduled = false, key = '', loadID = 0;
  let toolbarButton, tooltip;
  const modified = new Map();
  const allowed = ['auto','1.7777777777777777','1.6','2.3333333333333335','2.39','3.5555555555555554'];
  function clean(input) {
    const clamp = (v,min,max,fallback) => Number.isFinite(Number(v)) ? Math.min(max,Math.max(min,Number(v))) : fallback;
    return { mode: input.mode === 'fill' ? 'fill' : 'original', ratio: allowed.includes(String(input.ratio)) ? String(input.ratio) : 'auto', zoom: clamp(input.zoom,1,2,1), x: clamp(input.x,-1,1,0), y: clamp(input.y,-1,1,0), remember: input.remember === true };
  }
  function setStyle(el, property, value) {
    let record = modified.get(el);
    if (!record) {record = new Map(); modified.set(el,record);}
    if (!record.has(property)) record.set(property,{value:el.style.getPropertyValue(property),priority:el.style.getPropertyPriority(property),applied:null});
    const entry = record.get(property);
    if(entry.applied!==null && (el.style.getPropertyValue(property)!==entry.applied || el.style.getPropertyPriority(property)!=='important')) {
      entry.value=el.style.getPropertyValue(property);entry.priority=el.style.getPropertyPriority(property);
    }
    if (el.style.getPropertyValue(property) !== value || el.style.getPropertyPriority(property) !== 'important') el.style.setProperty(property,value,'important');
    entry.applied = el.style.getPropertyValue(property);
  }
  function restore() {
    for (const [el, entries] of modified) for (const [property, old] of entries) {
      if (el.style.getPropertyValue(property) !== old.applied) continue;
      if (old.value) el.style.setProperty(property,old.value,old.priority); else el.style.removeProperty(property);
    }
    modified.clear();
  }
  function chooseVideo() {
    return [...document.querySelectorAll('video')].filter(v => {const r=v.getBoundingClientRect();return r.width>160 && r.height>90 && getComputedStyle(v).visibility!=='hidden';}).sort((a,b)=>Number(!a.paused)-Number(!b.paused)||a.clientWidth*a.clientHeight-b.clientWidth*b.clientHeight).pop();
  }
  function chooseContainer(v) {
    const known=v.closest('#movie_player, .html5-video-player, .watch-video--player-view, .btm-media-client-element, [data-testid="player-container"]');
    if(known)return known;
    if(document.fullscreenElement?.contains(v) && document.fullscreenElement!==v)return document.fullscreenElement;
    return v.parentElement;
  }
  function preferenceKey() {
    const ratio = screen.width / screen.height;
    return `fillframe:${location.origin}:${ratio>2?'wide':ratio<1.7?'compact':'standard'}`;
  }
  async function load() {
    const next=preferenceKey(); if(next===key) return;
    key=next; const id=++loadID;
    try {const saved=await chrome.storage.local.get(next); if(id!==loadID)return; state=saved[next]?clean(saved[next]):defaults(); schedule();} catch { /* current session still works */ }
  }
  async function change(patch, reset=false) {
    ++loadID;
    state=reset?defaults():clean({...state,...patch});
    apply();
    try {if(state.remember) await chrome.storage.local.set({[key]:state}); else await chrome.storage.local.remove(key);} catch {return {ok:false,error:'Changed for this session, but settings could not be saved.'};}
    return status();
  }
  function status() {return video ? {ok:true,state,video:{width:video.videoWidth,height:video.videoHeight},site:location.hostname} : {ok:false,error:'Start a video on YouTube, Netflix or Disney+, then reopen Fillframe.'};}
  function schedule() { if(scheduled)return; scheduled=true; requestAnimationFrame(()=>{scheduled=false;refresh();}); }
  function refresh() {
    const found=chooseVideo();
    if (found!==video || (found && chooseContainer(found)!==container)) {
      restore(); observer.disconnect(); tooltip?.remove();tooltip=null; toolbarButton?.remove(); toolbarButton=null; host?.remove(); host=null; root=null;
      video=found; container=video?chooseContainer(video):null;
      if(video) { buildUI(); observer.observe(container); }
    }
    load(); attachToolbar(); apply();
  }
  function openPanel(open) {
    if(!root)return;
    root.querySelector('#panel').hidden=!open;
    root.querySelector('#more').setAttribute('aria-expanded',String(open));

    if(open)root.querySelector('#panel-toggle').focus();
  }
  function hideTooltip() { if(tooltip)tooltip.style.display='none'; }
  function showTooltip() {
    if(!toolbarButton?.isConnected)return;
    if(!tooltip?.isConnected) {
      tooltip=document.createElement('div');
      tooltip.className='ytp-tooltip ytp-bottom';
      tooltip.setAttribute('data-fillframe-tooltip','');
      tooltip.setAttribute('role','tooltip');tooltip.id='fillframe-tooltip';
      tooltip.innerHTML='<div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text"></span></div></div>';
      tooltip.style.cssText='position:absolute;pointer-events:none;z-index:2147483647;max-width:300px;';
      container.append(tooltip);
    }
    toolbarButton.setAttribute('aria-describedby',tooltip.id);
    const label=toolbarButton.getAttribute('aria-label');
    const text=tooltip.querySelector('.ytp-tooltip-text');if(text.textContent!==label)text.textContent=label;
    tooltip.style.display='block';
    const playerRect=container.getBoundingClientRect(),buttonRect=toolbarButton.getBoundingClientRect();
    const scaleX=playerRect.width/container.clientWidth || 1,scaleY=playerRect.height/container.clientHeight || 1;
    const chrome=container.querySelector('.ytp-chrome-bottom');
    const anchorTop=chrome?.getBoundingClientRect().top || buttonRect.top;
    const width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    const left=Math.max(8,Math.min(container.clientWidth-width-8,(buttonRect.left+buttonRect.width/2-playerRect.left)/scaleX-width/2));
    tooltip.style.left=`${left}px`;
    tooltip.style.top=`${Math.max(8,(anchorTop-playerRect.top)/scaleY-height-8)}px`;
  }
  function attachToolbar() {
    if(!root)return;
    const fullscreen=container.querySelector('.ytp-fullscreen-button');
    const controls=fullscreen?.parentElement;
    if(!fullscreen) {
      hideTooltip();toolbarButton?.remove();toolbarButton=null;
      root.querySelector('.bar').hidden=false;
      host.style.setProperty('top','14px','important');host.style.removeProperty('bottom');
      return;
    }
    if(!toolbarButton?.isConnected || toolbarButton.parentElement!==controls) {
      hideTooltip();toolbarButton?.remove();
      controls.querySelectorAll('[data-fillframe-toolbar]').forEach(button=>button.remove());
      toolbarButton=document.createElement('button');
      toolbarButton.className='ytp-button';toolbarButton.type='button';
      toolbarButton.setAttribute('data-fillframe-toolbar','');
      toolbarButton.setAttribute('aria-label','Fill player automatically');
      toolbarButton.setAttribute('data-tooltip-title','Fill player automatically');
      toolbarButton.setAttribute('aria-pressed',String(state.mode==='fill'));
      toolbarButton.style.cssText='position:relative;';
      toolbarButton.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" style="pointer-events:none;display:block;margin:auto"><rect x="2" y="4" width="20" height="16" rx="0.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 17V7h14L9 17Z" fill="currentColor"/></svg>';
      toolbarButton.addEventListener('pointerenter',showTooltip);
      toolbarButton.addEventListener('pointerleave',hideTooltip);
      toolbarButton.addEventListener('focus',()=>{if(toolbarButton.matches(':focus-visible'))showTooltip();});
      toolbarButton.addEventListener('blur',hideTooltip);
      toolbarButton.addEventListener('click',e=>{e.stopPropagation();hideTooltip();openPanel(false);change(state.mode==='fill'?{mode:'original'}:{mode:'fill',ratio:'auto',zoom:1,x:0,y:0});});
      toolbarButton.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTooltip();openPanel(false);e.stopPropagation();}});
      controls.insertBefore(toolbarButton,fullscreen);
    }
    root.querySelector('.bar').hidden=true;
    host.style.setProperty('top','auto','important');host.style.setProperty('bottom','64px','important');
  }
  function apply() {
    if(!video || !container) return;
    if(state.mode==='original') restore();
    else {
      const w=container.clientWidth,h=container.clientHeight;
      if(w && h && video.videoWidth && video.videoHeight) {
        if(getComputedStyle(container).position==='static') setStyle(container,'position','relative');
        setStyle(container,'overflow','hidden');
        const source=video.videoWidth/video.videoHeight;
        const target=state.ratio==='auto'?w/h:Number(state.ratio);
        // A manual content ratio describes the useful picture inside encoded black bars.
        // Preserve intrinsic proportions, scale the useful picture to cover the player.
        let usefulW=video.videoWidth, usefulH=video.videoHeight;
        if(state.ratio!=='auto') {if(target>source) usefulH=usefulW/target; else usefulW=usefulH*target;}
        const scale=Math.max(w/usefulW,h/usefulH)*state.zoom;
        const vw=video.videoWidth*scale,vh=video.videoHeight*scale;
        const x=(w-vw)/2 + state.x*Math.max(0,(vw-w)/2);
        const y=(h-vh)/2 + state.y*Math.max(0,(vh-h)/2);
        for(const [p,v] of Object.entries({position:'absolute',width:`${vw}px`,height:`${vh}px`,left:`${x}px`,top:`${y}px`,'max-width':'none','max-height':'none','min-width':'0px','min-height':'0px',margin:'0px',transform:'none','object-fit':'contain','object-position':'center'})) setStyle(video,p,v);
      }
    }
    if(toolbarButton){toolbarButton.setAttribute('aria-pressed',String(state.mode==='fill'));const label=state.mode==='fill'?'Restore original framing':'Fill player automatically';toolbarButton.setAttribute('aria-label',label);toolbarButton.setAttribute('data-tooltip-title',label);}
    if(root) {
      root.querySelector('#toggle').textContent=state.mode==='fill'?'Original':'Fill';
      root.querySelector('#panel-toggle').textContent=state.mode==='fill'?'Restore original':'Fill player';
      root.querySelector('#toggle').setAttribute('aria-label',state.mode==='fill'?'Restore original video':'Fill player with video');
      root.querySelector('#toggle').setAttribute('aria-pressed',String(state.mode==='fill'));
      root.querySelector('#ratio').value=state.ratio;
      root.querySelector('#zoom').value=state.zoom;
      root.querySelector('#remember').checked=state.remember;
    }
  }
  function buildUI() {
    host=document.createElement('div');host.setAttribute('data-fillframe','');
    // Shadow DOM contains extension controls and avoids host stylesheet collisions.
    host.style.cssText='position:absolute!important;top:14px!important;right:14px!important;z-index:2147483647!important;line-height:normal!important;';
    root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font:13px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#f8f8fa;color-scheme:dark}
      *{box-sizing:border-box} .bar{display:flex;justify-content:flex-end;gap:4px}
      button,select{font:inherit;color:inherit;border:1px solid #ffffff24;background:#252528;padding:8px 12px;border-radius:10px;cursor:pointer}
      button:hover{background:#454549}button:active{transform:scale(.97)}:focus-visible{outline:3px solid #84baff;outline-offset:3px}
      .bar{opacity:.25;transition:opacity .18s}.bar:hover,.bar:focus-within,:host(:hover) .bar{opacity:1}
      #panel{margin-top:8px;width:244px;max-width:calc(100vw - 40px);max-height:calc(100vh - 110px);overflow:auto;padding:16px;border-radius:18px;background:rgba(25,25,28,.94);border:1px solid #ffffff24;box-shadow:0 8px 30px #0006;backdrop-filter:blur(24px)}
      [hidden]{display:none!important}h2{font-size:15px;margin:0 0 12px}label{display:block;margin:12px 0 5px}select,input[type=range]{width:100%}small{display:block;color:#c6c6ca;margin-top:10px}input{accent-color:#91bfff} .check{display:flex;gap:8px;align-items:center}
      @media(prefers-reduced-motion:reduce){*{transition:none!important;transform:none!important}}
      @media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#panel{background:#19191c;backdrop-filter:none}.bar{opacity:1}}
    </style><div class="bar"><button id="toggle" aria-pressed="false">Fill</button><button id="more" aria-label="Crop settings" aria-expanded="false">•••</button></div>
    <section id="panel" hidden aria-label="Fillframe crop settings"><h2>Fillframe</h2><button id="panel-toggle">Fill player</button><button id="close" aria-label="Close Fillframe controls" style="float:right">×</button><label for="ratio">Picture inside the bars</label><select id="ratio"><option value="auto">Automatic · video size</option><option value="1.7777777777777777">16:9</option><option value="1.6">16:10</option><option value="2.3333333333333335">21:9</option><option value="2.39">Cinema · 2.39:1</option><option value="3.5555555555555554">32:9</option></select><label for="zoom">Extra zoom</label><input id="zoom" aria-label="Extra zoom" type="range" min="1" max="2" step="0.01"><label class="check"><input type="checkbox" id="remember">Remember for this site and display shape</label><button id="reset">Reset crop</button><small>Fill crops edges without stretching. Use a picture ratio for bars inside the video.</small></section>`;
    root.querySelector('#toggle').onclick=()=>change({mode:state.mode==='fill'?'original':'fill'});
    root.querySelector('#more').onclick=()=>openPanel(root.querySelector('#panel').hidden);
    root.querySelector('#panel-toggle').onclick=()=>change({mode:state.mode==='fill'?'original':'fill'});
    root.querySelector('#close').onclick=()=>{openPanel(false);(toolbarButton||root.querySelector('#more')).focus();};
    root.querySelector('#ratio').onchange=e=>change({ratio:e.target.value,mode:'fill'});
    root.querySelector('#zoom').oninput=e=>change({zoom:Number(e.target.value),mode:'fill'});
    root.querySelector('#remember').onchange=e=>change({remember:e.target.checked});
    root.querySelector('#reset').onclick=()=>change({},true);
    host.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTooltip();openPanel(false);(toolbarButton||root.querySelector('#more')).focus();e.stopPropagation();}});
    for(const type of ['click','pointerdown','dblclick']) host.addEventListener(type,e=>e.stopPropagation());
    container.append(host);
  }
  document.addEventListener('pointerdown',e=>{if(root&&!e.composedPath().includes(host)&&!e.composedPath().includes(toolbarButton))openPanel(false);},true);
  const observer=new ResizeObserver(schedule);
  new MutationObserver(mutations=>{if(mutations.some(m=>(m.type==='attributes' && m.target===video)||(m.type==='childList' && [...m.addedNodes,...m.removedNodes].some(n=>n!==host))))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  document.addEventListener('loadedmetadata',schedule,true);
  document.addEventListener('play',schedule,true);
  document.addEventListener('fullscreenchange',()=>{hideTooltip();schedule();});
  window.addEventListener('resize',()=>{hideTooltip();schedule();});
  document.addEventListener('keydown',e=>{if(e.altKey&&e.shiftKey&&e.code==='KeyF'&&!e.repeat&&!e.composedPath().some(n=>n?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(n?.tagName))){e.preventDefault();change({mode:state.mode==='fill'?'original':'fill'});}});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id) return;
    if(!chooseVideo()) return;
    if(message?.type==='FF_GET'){refresh();reply(status());return;}
    if(message?.type==='FF_SET'||message?.type==='FF_RESET'){refresh();change(message.patch||{},message.type==='FF_RESET').then(reply);return true;}
  });
  refresh();
})();
