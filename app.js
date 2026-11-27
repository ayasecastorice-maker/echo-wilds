'use strict';
(() => {
  const pick=id=>document.getElementById(id);
  const canvas=pick('world'),dialog=pick('guide'),toast=pick('notice'),interact=pick('interact');
  const storeKey='echo-wilds.adventure.v1', prefsKey='echo-wilds.settings.v1';
  const runeNames={frost:'凝霜',wind:'引风',echo:'回响'};
  const solutionNames={frost:'踏冰过溪',wind:'乘风越岸',echo:'隔溪鸣钟'};
  const spells={
    frost:{focus:'在落点结一块宽冰。脚下的冰消融前，可以向前再铺一块。',trail:'沿瞄准方向铺出一道冰径。站到岸边，向对岸施放。'},
    wind:{focus:'向目标跃出一段距离，落在陆地或冰面上。',trail:'随长风跃到更远的落脚点，并在身后留下一条加速风道。'},
    echo:{focus:'发出一束能敲钟的远距离音波。水面上的冰能让它传得更远。',trail:'散开的音波能探出附近的遗物，也会与水面上的冰共鸣。'}
  };
  const clues=[
    '先靠近西岸小路尽头。凝霜的「连缀」可以把溪面连成一条路。',
    '想少走几步？站在窄河段，换引风的「连缀」，瞄准东岸的空地。',
    '钟能听见回响。靠近西岸对准钟发射，或先在水面留冰，让音波传得更远。'
  ];
  let currentMode=matchMedia('(pointer: coarse)').matches?'walk':'cast',zoomed=false,clueIndex=-1;
  let lastData='',saveOK=true,started=false,muted=false,resetUntil=0,toastTimer,lastNearby='',recipes=null,recipeName='';
  const pressed=new Set();
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  const settings=read(prefsKey);muted=settings?.muted===true;
  function save(){
    if(!started)return;
    const txt=JSON.stringify(game.serialize());
    if(txt===lastData)return;
    try{localStorage.setItem(storeKey,txt);lastData=txt;}
    catch{saveOK=false;pick('save-state').textContent='当前浏览器未开放本地存档';}
  }
  function say(text,ms=2200){
    clearTimeout(toastTimer);toast.textContent=text;toast.classList.add('show');
    toastTimer=setTimeout(()=>toast.classList.remove('show'),ms);
  }
  function eventReceived(e){
    EchoSound.cue(e);
    if(e.type==='bell'){
      const msg=e.newSolution?'发现解法 · '+solutionNames[e.solution]:'钟声穿过了山谷。';
      say(msg,3400);
    }else if(e.type==='relic')say(e.count===e.total?'三件遗物已集齐。':e.message,2500);
    else if(['return','blocked','camp','reset','resonance'].includes(e.type))say(e.message,e.type==='resonance'?3200:2000);
    if(['bell','relic','form','equip','camp','reset'].includes(e.type)){
      updateUI();save();
    }
  }
  const game=EchoGame.create({onEvent:eventReceived});
  const recovered=read(storeKey);if(recovered)game.restore(recovered);
  const renderer=EchoRenderer.create(canvas,game);
  function setMode(mode){
    currentMode=mode;
    canvas.dataset.mode=mode;
    pick('cast-mode').setAttribute('aria-pressed',String(mode==='cast'));
    pick('walk-mode').setAttribute('aria-pressed',String(mode==='walk'));
    pick('map-wrap').classList.toggle('walk',mode==='walk');
  }
  function updateSound(){
    const b=pick('sound');b.setAttribute('aria-pressed',String(!muted));b.setAttribute('aria-label',muted?'打开声音':'静音');
    const icon=b.querySelector('canvas');icon.dataset.ink=muted?'mute':'sound';EchoInk.draw(icon);
    b.querySelector('span').textContent=muted?'静音':'声音';
  }
  function showNearby(){
    const item=game.getNearby(),id=item?item.type+item.id:'';
    if(lastNearby===id)return;lastNearby=id;interact.hidden=!item;
    if(item)interact.querySelector('span').textContent=item.type==='bell'?'敲响旧钟':'拾取'+item.name;
  }
  function updateUI(){
    const s=game.state;
    for(const b of document.querySelectorAll('.runes [data-rune]'))b.setAttribute('aria-pressed',String(!recipeName&&b.dataset.rune===s.rune));
    for(const b of document.querySelectorAll('.forms [data-form]'))b.setAttribute('aria-pressed',String(!recipeName&&b.dataset.form===s.form));
    pick('spell-hint').textContent=recipeName?'已装配「'+recipeName+'」。点地图连续施放两道符文，选下方符文可切回单发。':spells[s.rune][s.form];
    pick('quest-title').textContent=s.won?'山谷响起了钟声':'让旧钟再次响起';
    pick('quest-state').innerHTML=s.won?'<i></i>目标已完成':'<i></i>当前目标';
    pick('quest-copy').textContent=s.won?'石台回应了你的呼唤。还有别的方法能让这口钟响起吗？':'隔着溪水，东岸的石台上悬着一口钟。你可以过河，也可以让声音先过去。';
    if(s.solutions.length===3)pick('quest-copy').textContent='钟记住了冰、风与回响。现在，整座遗庭都向你敞开。';
    pick('relic-count').textContent=s.relics.length+' / '+s.relicSites.length;
    pick('route-count').textContent=s.solutions.length+' / 3';
    for(const item of document.querySelectorAll('.relic-row')){
      const found=s.relics.includes(item.dataset.site);
      item.classList.toggle('found',found);item.setAttribute('aria-label',item.dataset.label+'，'+(found?'已收集':'未收集'));
    }
    for(const el of document.querySelectorAll('[data-route]')){
      const found=s.solutions.includes(el.dataset.route);el.classList.toggle('found',found);
      el.title=found?solutionNames[el.dataset.route]:'尚未发现的解法';el.setAttribute('aria-label',el.title);EchoInk.draw(el);
    }
    pick('route-note').textContent=s.solutions.length?s.solutions.map(id=>solutionNames[id]).join(' · '):'每发现一种解法，就在这里留下一枚印记。';
    showNearby();
  }
  for(const site of game.state.relicSites){
    const row=document.createElement('div'),glyph=document.createElement('canvas'),name=document.createElement('span'),dot=document.createElement('i');
    row.className='relic-row';row.dataset.site=site.id;row.dataset.label=site.name;glyph.dataset.ink=site.id;glyph.setAttribute('aria-hidden','true');dot.className='dot';name.textContent=site.name;
    row.append(glyph,name,dot);pick('relic-list').append(row);
  }
  recipes=window.EchoRecipes?.create({game,onStatus:say,onArmed:(armed,name)=>{
    recipeName=armed?name:'';
    pick('workshop').setAttribute('aria-pressed',String(armed));
    if(armed)setMode('cast');updateUI();
  }})||null;
  pick('workshop').onclick=()=>{clearKeys();recipes?.open();};
  function single(){recipes?.cancelPending();if(recipes?.isArmed())recipes.disarm();}
  function fire(x=game.state.aim.x,y=game.state.aim.y){return recipes?.isArmed()?recipes.cast(x,y):game.cast(x,y);}
  function selectRune(id){single();game.equip(id);setMode('cast');}
  for(const el of document.querySelectorAll('[data-rune]'))el.addEventListener('click',()=>selectRune(el.dataset.rune));
  for(const el of document.querySelectorAll('.forms [data-form]'))el.addEventListener('click',()=>{single();game.setForm(el.dataset.form);setMode('cast');});
  pick('cast-mode').onclick=()=>setMode('cast');pick('walk-mode').onclick=()=>setMode('walk');
  interact.onclick=()=>game.interact();pick('camp').onclick=()=>{clearKeys();recipes?.cancelPending();game.returnToCamp();};
  pick('clue').onclick=()=>{
    clueIndex=(clueIndex+1)%(clues.length+1);
    const open=clueIndex<clues.length;pick('clue-text').hidden=!open;
    pick('clue-text').textContent=open?clues[clueIndex]:'';
    pick('clue').innerHTML=(open?(clueIndex===clues.length-1?'收起线索':'下一条线索'):'查看线索')+' <span>'+(open?'›':'＋')+'</span>';
  };
  pick('zoom').onclick=()=>{
    zoomed=!zoomed;renderer.setZoom(zoomed?1.75:1);
    const b=pick('zoom');b.textContent=zoomed?'−':'＋';b.setAttribute('aria-pressed',String(zoomed));b.setAttribute('aria-label',zoomed?'查看全图':'放大地图');b.title=zoomed?'查看全图':'放大地图';
  };
  pick('sound').onclick=()=>{muted=!muted;EchoSound.set(!muted);updateSound();try{localStorage.setItem(prefsKey,JSON.stringify({muted}));}catch{}};
  document.addEventListener('pointerdown',()=>{if(!muted)EchoSound.wake();},{once:true,capture:true});
  document.addEventListener('keydown',()=>{if(!muted)EchoSound.wake();},{once:true,capture:true});
  if(muted)EchoSound.set(false);
  pick('fullscreen').onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await pick('game-shell').requestFullscreen();}
    catch{say('当前浏览器未提供全屏模式。');}
  };
  function openGuide(){clearKeys();resetUntil=0;pick('reset-hint').hidden=true;if(!dialog.open)dialog.showModal();}
  pick('help').onclick=openGuide;pick('close-help').onclick=()=>dialog.close();pick('resume').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  pick('reset').onclick=()=>{
    if(performance.now()>=resetUntil){resetUntil=performance.now()+5000;pick('reset-hint').hidden=false;return;}
    dialog.close();single();lastData='';clueIndex=-1;pick('clue-text').hidden=true;pick('clue').innerHTML='查看线索 <span>＋</span>';game.reset();save();
  };
  const keys={KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0],KeyW:[0,-1],ArrowUp:[0,-1],KeyS:[0,1],ArrowDown:[0,1]};
  function syncMove(){
    let x=0,y=0;for(const code of pressed){x+=keys[code][0];y+=keys[code][1];}game.setMove(Math.sign(x),Math.sign(y));
  }
  function clearKeys(){pressed.clear();game.setMove(0,0);}
  window.addEventListener('keydown',e=>{
    if(!started||document.querySelector('dialog[open]')||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.code in keys){e.preventDefault();pressed.add(e.code);syncMove();return;}
    if(e.repeat)return;
    if(['Digit1','Digit2','Digit3'].includes(e.code))selectRune(['frost','wind','echo'][Number(e.code.slice(-1))-1]);
    if(e.code==='KeyQ'){single();game.setForm(game.state.form==='focus'?'trail':'focus');}
    if(e.code==='KeyE')game.interact();
    if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();fire();}
    if(e.code==='KeyH')openGuide();
  });
  window.addEventListener('keyup',e=>{if(pressed.delete(e.code)){e.preventDefault();syncMove();}});
  window.addEventListener('blur',()=>{clearKeys();save();});
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearKeys();save();}});
  canvas.addEventListener('pointermove',e=>{if(!started||dialog.open)return;const p=renderer.point(e.clientX,e.clientY);canvas.dataset.aiming=String(p.inside!==false);if(p.inside!==false)game.aim(p.x,p.y);});
  canvas.addEventListener('pointerleave',()=>{canvas.dataset.aiming='false';});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(!started||dialog.open||(e.button!==0&&e.button!==2))return;
    const p=renderer.point(e.clientX,e.clientY);if(p.inside===false)return;
    canvas.focus({preventScroll:true});game.aim(p.x,p.y);
    if(e.button===2||currentMode==='walk'){clearKeys();game.moveTo(p.x,p.y);}else fire(p.x,p.y);
  });
  EchoInk.all();updateSound();setMode(currentMode);updateUI();
  let previous=0,saveTimer=0;
  function frame(ms){
    const dt=previous?Math.min(.08,(ms-previous)/1000):0;previous=ms;
    if(!document.querySelector('dialog[open]')&&!document.hidden){game.step(dt);recipes?.step(dt);showNearby();saveTimer+=dt;if(saveTimer>=1.5&&saveOK){save();saveTimer=0;}}
    renderer.render(game.state.time);requestAnimationFrame(frame);
  }
  window.echoReady=Promise.resolve(renderer.ready).then(()=>{
    started=true;pick('loading').hidden=true;requestAnimationFrame(frame);
  }).catch(err=>{pick('loading').textContent='地图读取失败，请完整解压项目再打开 index.html。';throw err;});
})();
