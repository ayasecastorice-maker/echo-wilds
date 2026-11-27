/* A deterministic, renderer-independent simulation. Distances are world pixels; time is seconds. */
(() => {
  'use strict';

  const RUNES = ['frost', 'wind', 'echo'];
  const FORMS = ['focus', 'trail'];
  const GRID = 18;
  const RANGE = { frost: { focus: 165, trail: 188 }, wind: { focus: 182, trail: 232 }, echo: { focus: 454, trail: 409 } };
  const SPEED = 159;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const point = p => Array.isArray(p) ? {x:p[0], y:p[1]} : {x:p.x, y:p.y};
  const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  function inside(x, y, polygon) {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  }
  function closestOnSegment(p, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = clamp(((p.x - start.x) * dx + (p.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return {x:start.x + t * dx, y:start.y + t * dy};
  }

  function create({onEvent = () => {}, terrain = globalThis.EchoTerrain} = {}) {
    if (!terrain || !terrain.spawn || !terrain.bell) throw Error('Load the Echo Wilds terrain before creating a game.');
    const W = terrain.width, H = terrain.height;
    const spawn = point(terrain.spawn), bell = point(terrain.bell);
    const river = terrain.river;
    const shoreline = terrain.riverPolygon?.map(point);
    const ground = (terrain.walkable || []).map(p => (p.points || p).map(point));
    const obstacles = terrain.obstacles || [];
    const sites = (terrain.relics || []).map(r => ({...r, ...point(r), collected:false, revealedUntil:0}));
    const state = {};
    let moveX = 0, moveY = 0, path = [], lastLand, currentBank, journey, seq = 0;
    let lastBlock = -2;
    const emit = (type, message, detail = {}) => onEvent({type, message, ...detail});
    const bounds = (x, y) => x >= 5 && x <= W-5 && y >= 5 && y <= H-5;

    function riverEdges(y) {
      if (!river?.length) return [W/2, W/2];
      let i = 1;
      while (i < river.length && river[i][0] < y) i++;
      const a = river[Math.max(0,i-1)], b = river[Math.min(i,river.length-1)];
      const t = clamp((y-a[0])/(b[0]-a[0] || 1),0,1);
      return [a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    }
    function water(x, y) {
      if (shoreline?.length) return inside(x,y,shoreline);
      const [l,r] = riverEdges(y);
      return x > l && x < r;
    }
    function bank(x, y) {
      const [l,r] = riverEdges(y);
      return x < (l+r)/2 ? 'west' : 'east';
    }
    function land(x,y) {
      if (!bounds(x,y) || water(x,y)) return false;
      if (ground.length && !ground.some(p => inside(x,y,p))) return false;
      return !obstacles.some(o => {
        const rx = o.rx || o.r, ry = o.ry || o.r;
        return rx>0 && ry>0 && ((x-o.x)/rx)**2 + ((y-o.y)/ry)**2 < 1;
      });
    }
    function isWalkable(x,y) {
      if (land(x,y)) return true;
      if (!bounds(x,y)) return false;
      // The calibrated land masks stop before the rocky bank lips; a cast must connect those lips to the water.
      const [left,right] = riverEdges(y);
      return x>=left-34 && x<=right+34 && state.ice.some(p => p.life>0 && Math.hypot(p.x-x,p.y-y)<p.r-2);
    }
    function unobstructed(a,b) {
      const count = Math.max(1,Math.ceil(dist(a,b)/5));
      for (let i=1; i<=count; i++) {
        const t=i/count;
        if (!isWalkable(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)) return false;
      }
      return true;
    }
    function effect(type,x,y,tx=x,ty=y,duration=.65,more={}) {
      state.effects.push({id:++seq,type,x,y,tx,ty,life:duration,maxLife:duration,form:state.form,...more});
    }
    function blocked(message) {
      if (state.time-lastBlock>.75) { lastBlock=state.time; emit('blocked',message); }
      return false;
    }
    function halt() { path=[]; state.goal=null; state.player.moving=false; }
    function reset(announce=true) {
      moveX=moveY=0; lastBlock=-2; seq=0; lastLand={...spawn}; currentBank=bank(spawn.x,spawn.y); journey=null; path=[];
      for (const r of sites) {r.collected=false; r.revealedUntil=0;}
      Object.assign(state, {time:0,player:{...spawn,dx:1,dy:0,facing:0,moving:false,airborne:false},
        aim:{...bell},rune:'frost',form:'focus',won:false,method:null,route:null,solutions:[],lastCrossing:null,
        relics:[],relicSites:sites,bell:{...bell},ice:[],effects:[],projectiles:[],cooldown:0,goal:null,jump:null,bellPulse:0});
      if (announce) emit('reset','遗迹已重新开始。');
    }
    function setMove(x,y) {
      moveX=Number.isFinite(x)?x:0; moveY=Number.isFinite(y)?y:0;
      if (moveX || moveY) halt();
    }
    function aim(x,y) {
      if (Number.isFinite(x) && Number.isFinite(y)) state.aim={x:clamp(x,0,W),y:clamp(y,0,H)};
    }

    // Search only through connected ground/ice. An inaccessible click approaches the closest reachable shore.
    function moveTo(x,y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || state.jump) return false;
      const start=state.player, target={x:clamp(x,5,W-5),y:clamp(y,5,H-5)};
      moveX=moveY=0;
      if (unobstructed(start,target)) {path=[target];state.goal={...target};return true;}
      const cols=Math.ceil(W/GRID), rows=Math.ceil(H/GRID);
      const pos=k=>({x:(k%cols+.5)*GRID,y:(Math.floor(k/cols)+.5)*GRID});
      const closed=new Set(), open=new Set(), cost=new Map(), prev=new Map(), weights=new Map();
      const sx=Math.floor(start.x/GRID), sy=Math.floor(start.y/GRID);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const cx=sx+dx,cy=sy+dy;if(cx<0||cx>=cols||cy<0||cy>=rows)continue;
        const k=cy*cols+cx,p=pos(k);
        if(unobstructed(start,p)){open.add(k);cost.set(k,dist(start,p));weights.set(k,cost.get(k)+dist(p,target));}
      }
      let best=null, nearest=dist(start,target), reached=false;
      while(open.size){
        let k=null,min=Infinity;
        for(const a of open)if(weights.get(a)<min){min=weights.get(a);k=a;}
        open.delete(k);closed.add(k);
        const p=pos(k), d=dist(p,target);
        if(d<nearest){nearest=d;best=k;}
        if(d<GRID*2 && unobstructed(p,target)){best=k;reached=true;break;}
        const gx=k%cols,gy=Math.floor(k/cols);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!(dx||dy))continue;
          const xx=gx+dx,yy=gy+dy;if(xx<0||xx>=cols||yy<0||yy>=rows)continue;
          const j=yy*cols+xx;if(closed.has(j))continue;
          const q=pos(j), g=cost.get(k)+dist(p,q);
          if(g>=(cost.get(j)??Infinity)||!unobstructed(p,q))continue;
          cost.set(j,g);prev.set(j,k);weights.set(j,g+dist(q,target));open.add(j);
        }
      }
      if(best===null){halt();return blocked('这里没有可行的落脚点。');}
      const nodes=reached?[target]:[];
      for(let k=best;k!==undefined;k=prev.get(k))nodes.unshift(pos(k));
      path=nodes;state.goal={...nodes[nodes.length-1]};
      if (!reached && bank(start.x,start.y)!==bank(target.x,target.y)) blocked('河水会挡住脚步，试试在岸边施放符文。');
      return true;
    }
    function equip(id) {
      if(!RUNES.includes(id)) return false;
      if(state.rune!==id){state.rune=id;emit('equip','已切换符文。',{id});}
      return true;
    }
    function setForm(id){
      if(!FORMS.includes(id)) return false;
      if(state.form!==id){state.form=id;emit('form','已切换施法形态。',{id});}
      return true;
    }
    function collect(r){
      if(r.collected)return false;
      r.collected=true;state.relics.push(r.id);effect('relic',r.x,r.y,r.x,r.y,1.2);
      emit('relic','发现'+(r.name||r.label||'遗物')+'。',{id:r.id,count:state.relics.length,total:sites.length});
      return true;
    }
    function ring(method, solution){
      const first=!state.won,newSolution=!!solution&&!state.solutions.includes(solution);
      if(first){state.won=true;state.method=method;state.route=solution;}
      if(newSolution)state.solutions.push(solution);
      state.bellPulse=1;effect('bell',bell.x,bell.y,bell.x,bell.y,1.9);
      emit('bell',newSolution?'钟声回应了这条新路。':first?'古钟在山谷间响起。':'钟声再次越过山谷。',{method,solution:solution||null,first,newSolution});
    }
    function getNearby(){
      if(state.jump)return null;
      const p=state.player;
      const options=sites.filter(r=>!r.collected).map(r=>({type:'relic',id:r.id,x:r.x,y:r.y,distance:dist(p,r),name:r.name||r.label||'遗物'})).filter(r=>r.distance<=47);
      if(dist(p,bell)<=65)options.push({type:'bell',id:'bell',...bell,distance:dist(p,bell),name:'古钟'});
      return options.sort((a,b)=>a.distance-b.distance)[0]||null;
    }
    function interact(){
      const n=getNearby();
      if(!n)return blocked('靠近古钟或遗物后可以触碰。');
      if(n.type==='bell')ring('touch',state.lastCrossing);
      else collect(sites.find(r=>r.id===n.id));
      return true;
    }
    function freeze(x,y,r,seconds) {
      const same=state.ice.find(p=>Math.hypot(x-p.x,y-p.y)<8 && Math.abs(p.r-r)<4);
      if(same){same.life=same.maxLife=seconds;return;}
      state.ice.push({id:++seq,rune:'frost',form:state.form,x,y,r,life:seconds,maxLife:seconds});
    }
    function cast(x=state.aim.x,y=state.aim.y){
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      aim(x,y);
      if(state.jump || state.cooldown>0)return false;
      const p=state.player,rune=state.rune,form=state.form,range=RANGE[rune][form];
      const dx=x-p.x,dy=y-p.y,raw=Math.hypot(dx,dy);
      const ux=raw>1?dx/raw:Math.cos(p.facing),uy=raw>1?dy/raw:Math.sin(p.facing);
      const span=clamp(raw || range,16,range);
      const at=d=>({x:p.x+ux*d,y:p.y+uy*d});
      let end=at(span);
      if(rune==='frost'){
        if(form==='focus')freeze(end.x,end.y,44,25);
        else{
          const count=Math.max(2,Math.ceil(span/22));
          for(let i=1;i<=count;i++){const q=at(i*span/count);freeze(q.x,q.y,23,19);}
        }
      }else if(rune==='wind'){
        // If the pointer lies on water, look just beyond it for the first usable landing.
        let landing=isWalkable(end.x,end.y)?end:null;
        if(!landing){
          for(let s=span+3;s<=range;s+=3){const q=at(s);if(isWalkable(q.x,q.y)){landing=q;break;}}
        }
        if(!landing){
          for(let s=span-3;s>=26;s-=3){const q=at(s);if(isWalkable(q.x,q.y)){landing=q;break;}}
        }
        if(!landing || dist(p,landing)<24)return blocked('风跃需要前方有一块能落脚的地面或冰面。');
        end=landing;halt();p.airborne=true;
        const jumpLength=dist(p,end);
        state.jump={x:p.x,y:p.y,tx:end.x,ty:end.y,t:0,duration:.32+jumpLength/670,height:0,form,
          fromBank:water(p.x,p.y)?currentBank:bank(p.x,p.y)};
        if(form==='trail')effect('gust',p.x,p.y,end.x,end.y,4.5,{dx:ux,dy:uy,r:27});
      }else{
        const angle=Math.atan2(uy,ux), cascade={resonated:false};
        const offsets=form==='focus'?[0]:[0,-.15,.15];
        for(const offset of offsets){
          const a=angle+offset,speed=form==='focus'?440:391;
          state.projectiles.push({id:++seq,rune:'echo',type:'echo',form,x:p.x,y:p.y,dx:Math.cos(a),dy:Math.sin(a),
            r:form==='focus'?8:6,life:range/speed,maxLife:range/speed,speed,remaining:range,launchBank:land(p.x,p.y)?bank(p.x,p.y):null,
            resonance:false,cascade,trail:[]});
        }
        end=at(range);
      }
      p.dx=ux;p.dy=uy;p.facing=Math.atan2(uy,ux);
      effect(rune,p.x,p.y,end.x,end.y,rune==='wind'?.78:.65);
      state.cooldown=rune==='wind'?.72:rune==='frost'?.5:.56;
      emit('cast',({frost:'霜纹在地面铺开。',wind:'风托起了脚步。',echo:'回响沿指向飞出。'})[rune],{rune,form,x:p.x,y:p.y,tx:end.x,ty:end.y});
      return true;
    }
    function landOn(p, mode){
      if(!land(p.x,p.y))return;
      const now=bank(p.x,p.y);
      if(now!==currentBank){
        if(now==='east')state.lastCrossing=mode==='wind'?'wind':journey==='frost'?'frost':null;
        else state.lastCrossing=null;
      }
      currentBank=now;lastLand={x:p.x,y:p.y};journey=null;
    }
    function safeReturn(){
      const p=state.player,old={x:p.x,y:p.y};
      Object.assign(p,lastLand,{airborne:false,moving:false});state.jump=null;journey=null;halt();
      effect('return',old.x,old.y,p.x,p.y,1);
      emit('return','薄冰化开了，水流把你送回刚才的岸边。');
    }
    function walk(dt){
      const p=state.player, j=state.jump;
      if(j){
        j.t=Math.min(j.duration,j.t+dt);
        const u=j.t/j.duration,e=u*u*(3-2*u);
        p.x=j.x+(j.tx-j.x)*e;p.y=j.y+(j.ty-j.y)*e;
        j.height=Math.sin(u*Math.PI)*(28+dist({x:j.x,y:j.y},{x:j.tx,y:j.ty})*.09);
        if(u>=1){
          state.jump=null;p.airborne=false;
          if(!isWalkable(p.x,p.y)){safeReturn();return;}
          if(!land(p.x,p.y))journey='frost';else landOn(p,'wind');
          effect('ripple',p.x,p.y,p.x,p.y,.45,{rune:'wind'});
        }
        return;
      }
      if(!isWalkable(p.x,p.y)){safeReturn();return;}
      let dx=moveX,dy=moveY,cap=Infinity;
      if(!dx&&!dy){
        while(path.length && dist(p,path[0])<2)path.shift();
        if(!path.length){halt();return;}
        dx=path[0].x-p.x;dy=path[0].y-p.y;cap=Math.hypot(dx,dy);
      }
      const len=Math.hypot(dx,dy);if(!len){p.moving=false;return;}
      dx/=len;dy/=len;
      const aided=state.effects.some(e=>e.type==='gust'&&dx*e.dx+dy*e.dy>.25&&dist(p,closestOnSegment(p,e,{x:e.tx,y:e.ty}))<e.r);
      const amount=Math.min(cap,SPEED*(aided?1.5:1)*dt);
      const old={x:p.x,y:p.y},nx=p.x+dx*amount,ny=p.y+dy*amount;
      if(isWalkable(nx,ny)){p.x=nx;p.y=ny;}
      else if(moveX||moveY){
        if(isWalkable(nx,p.y))p.x=nx;
        if(isWalkable(p.x,ny))p.y=ny;
      } else {halt();return;}
      p.dx=dx;p.dy=dy;p.facing=Math.atan2(dy,dx);p.moving=dist(p,old)>.005;
      if(!land(p.x,p.y)){journey='frost';}
      else landOn(p);
    }
    function advanceEcho(dt) {
      for(const shot of state.projectiles){
        const old={x:shot.x,y:shot.y},span=Math.min(shot.remaining,dt*shot.speed);
        shot.x+=shot.dx*span;shot.y+=shot.dy*span;shot.remaining-=span;shot.life=shot.remaining/shot.speed;
        shot.trail.push(old);if(shot.trail.length>14)shot.trail.shift();
        if(!shot.resonance && state.ice.some(i=>water(i.x,i.y)&&dist(i,closestOnSegment(i,old,shot))<i.r)){
          shot.resonance=true;shot.remaining+=102;shot.life=shot.remaining/shot.speed;shot.maxLife+=102/shot.speed;
          if(!shot.cascade.resonated){
            shot.cascade.resonated=true;effect('resonance',shot.x,shot.y,shot.x,shot.y,.95,{rune:'echo'});
            emit('resonance','水面上的霜纹引起共鸣，回响又向前传了一程。',{bonusRange:102});
          }
        }
        const reveal=shot.form==='trail'?72:29;
        for(const r of sites)if(!r.collected&&dist(r,closestOnSegment(r,old,shot))<reveal)r.revealedUntil=state.time+4;
        if(dist(bell,closestOnSegment(bell,old,shot))<=24+shot.r){
          if(!shot.cascade.rang){
            shot.cascade.rang=true;ring('echo',shot.launchBank==='west'?'echo':null);
          }
          shot.life=0;shot.remaining=0;
        }else if(!bounds(shot.x,shot.y)||shot.remaining<.01){
          shot.life=0;effect('ripple',shot.x,shot.y,shot.x,shot.y,.5,{rune:'echo'});
        }
      }
      state.projectiles=state.projectiles.filter(s=>s.life>0);
    }
    function tick(dt){
      state.time+=dt;state.cooldown=Math.max(0,state.cooldown-dt);state.bellPulse=Math.max(0,state.bellPulse-dt*.64);
      state.ice=state.ice.filter(p=>(p.life-=dt)>0);
      state.effects=state.effects.filter(e=>(e.life-=dt)>0);
      walk(dt);advanceEcho(dt);
      if(!state.jump)for(const r of sites)if(!r.collected&&dist(r,state.player)<23)collect(r);
    }
    function step(dt){
      if(!Number.isFinite(dt)||dt<=0)return;
      // Substeps keep narrow banks and projectiles reliable if a display frame is delayed.
      let remain=Math.min(dt,60);
      while(remain>1e-9){const d=Math.min(remain,1/60);tick(d);remain-=d;}
    }
    function returnToCamp(){
      const old={x:state.player.x,y:state.player.y};
      Object.assign(state.player,spawn,{airborne:false,moving:false,dx:1,dy:0,facing:0});
      currentBank=bank(spawn.x,spawn.y);journey=null;state.lastCrossing=null;lastLand={...spawn};
      state.jump=null;state.projectiles=[];state.cooldown=0;state.aim={...bell};moveX=moveY=0;halt();
      effect('return',old.x,old.y,spawn.x,spawn.y,1);emit('camp','已经回到西岸，探索记录仍在。');
      return true;
    }
    function serialize(){
      const p=state.player;
      return {version:1,player:state.jump?{...lastLand}:{x:p.x,y:p.y},lastLand:{...lastLand},bank:currentBank,
        journey,lastCrossing:state.lastCrossing,won:state.won,method:state.method,route:state.route,
        solutions:[...state.solutions],relics:[...state.relics],rune:state.rune,form:state.form,
        ice:state.ice.map(({x,y,r,life,maxLife,form})=>({x,y,r,life,maxLife,form}))};
    }
    function restore(raw){
      let data=raw;
      if(typeof raw==='string'){try{data=JSON.parse(raw);}catch{return false;}}
      if(!data||data.version!==1)return false;
      reset(false);
      if(RUNES.includes(data.rune))state.rune=data.rune;
      if(FORMS.includes(data.form))state.form=data.form;
      state.won=data.won===true;
      if(state.won){state.method=data.method==='echo'?'echo':'touch';state.route=RUNES.includes(data.route)?data.route:null;}
      state.solutions=[...new Set(Array.isArray(data.solutions)?data.solutions.filter(id=>RUNES.includes(id)):[])];
      for(const id of (Array.isArray(data.relics)?data.relics:[])){
        const r=sites.find(site=>site.id===id);
        if(r&&!r.collected){r.collected=true;state.relics.push(id);}
      }
      if(valid(data.lastLand)&&land(data.lastLand.x,data.lastLand.y))lastLand={...point(data.lastLand)};
      for(const i of (Array.isArray(data.ice)?data.ice:[]).slice(-240)){
        if(!valid(i)||!bounds(i.x,i.y)||!(i.life>0)||!Number.isFinite(i.life)||!FORMS.includes(i.form))continue;
        const maxLife=i.form==='focus'?25:19;
        state.ice.push({id:++seq,rune:'frost',form:i.form,x:i.x,y:i.y,r:i.form==='focus'?44:23,life:Math.min(maxLife,i.life),maxLife});
      }
      const target=valid(data.player)&&isWalkable(data.player.x,data.player.y)?data.player:lastLand;
      Object.assign(state.player,point(target));currentBank=bank(lastLand.x,lastLand.y);
      if(land(target.x,target.y)){currentBank=bank(target.x,target.y);lastLand=point(target);}
      journey=!land(target.x,target.y)?'frost':null;
      state.lastCrossing=currentBank==='east'&&['frost','wind'].includes(data.lastCrossing)?data.lastCrossing:null;
      return true;
    }
    reset(false);
    return {state,getState:()=>state,step,setMove,moveTo,aim,cast,interact,equip,setForm,reset,returnToCamp,serialize,restore,
      getNearby,isWalkable,isWater:water,getCastRange:()=>RANGE[state.rune][state.form]};
  }
  globalThis.EchoGame=Object.freeze({create});
})();
