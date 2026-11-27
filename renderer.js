/* Echo Wilds — original immediate-mode world renderer, 1200 × 800 ground pixels.
 * Character, bell, relics, magic and atmosphere are drawn here; terrain is original artwork.
 * This module reads game state and never mutates simulation or opens a network service.
 */
(function () {
  'use strict';
  const W=1200,H=800,TAU=Math.PI*2;
  const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
  const PALETTE={ink:'#172e32',cream:'#fff1c8',gold:'#e3ad45',coat:'#d8a331',hood:'#26344e',frost:'#bceeff',wind:'#dcf7bc',echo:'#edc5ff'};
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const mix=(a,b,t)=>a+(b-a)*t;
  const fract=n=>n-Math.floor(n);
  const noise=n=>fract(Math.sin(n*127.1+311.7)*43758.5453123);
  function identifier(value){if(typeof value==='number')return value;let n=17;for(const char of String(value))n=(n*31+char.charCodeAt(0))%65521;return n;}
  const pos=value=>Array.isArray(value)?{x:value[0],y:value[1]}:value;
  const colorFor=key=>PALETTE[key]||PALETTE.echo;
  const fallbackTerrain={width:W,height:H,image:'assets/terrain.webp',spawn:[250,395],bell:[969,289],relics:[{id:'forest',x:370,y:230},{id:'meadow',x:355,y:590},{id:'courtyard',x:900,y:475}],river:[[0,626,721],[200,555,645],[400,614,718],[600,542,655],[800,545,681]]};

  function create(canvas,game){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('EchoRenderer.create requires a canvas.');
    const g=canvas.getContext('2d',{alpha:false});
    if(!g)throw new Error('Canvas 2D is unavailable.');
    let terrain=window.EchoTerrain||fallbackTerrain,image=null,disposed=false,dirty=true;
    let zoom=1;
    let view={width:W,height:H,scale:1,x:0,y:0,dpr:1,baseScale:1,frameX:0,frameY:0,frameWidth:W,frameHeight:H,zoom:1};
    const ground=document.createElement('canvas');ground.width=W;ground.height=H;
    const bg=ground.getContext('2d');
    const sampleState=()=>typeof game?.getState==='function'?game.getState():game?.state||game||{};
    function save(alpha,fn){g.save();g.globalAlpha*=clamp(alpha);fn();g.restore();}
    function line(points,color,width=1,alpha=1){if(points.length<2)return;save(alpha,()=>{g.beginPath();g.moveTo(...points[0]);for(let i=1;i<points.length;i++)g.lineTo(...points[i]);g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.lineJoin='round';g.stroke();});}
    function ellipse(x,y,rx,ry,fill=null,stroke=null,width=1){g.beginPath();g.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
    function polygon(points,fill,stroke=null,width=1){g.beginPath();g.moveTo(...points[0]);points.slice(1).forEach(p=>g.lineTo(...p));g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.lineJoin='round';g.stroke();}}
    function round(x,y,w,h,r,fill,stroke=null,width=1){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
    function halo(x,y,r,color,alpha=.6){save(alpha,()=>{const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(1,color+'00');g.fillStyle=gradient;g.fillRect(x-r,y-r,r*2,r*2);});}
    function rune(x,y,size,type,color,alpha=1){save(alpha,()=>{g.translate(x,y);g.strokeStyle=color;g.lineWidth=1.7;g.lineCap='round';g.lineJoin='round';if(type==='frost'){for(let i=0;i<3;i++){g.save();g.rotate(i*Math.PI/3);line([[-size,0],[size,0]],color,1.5);line([[size*.55,-size*.3],[size*.75,0],[size*.55,size*.3]],color,1.1);line([[-size*.55,-size*.3],[-size*.75,0],[-size*.55,size*.3]],color,1.1);g.restore();}}else if(type==='wind'){for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(-size,i*size*.43);g.bezierCurveTo(-size*.2,i*size*.43-size*.3,size*.35,i*size*.43+size*.4,size,i*size*.43-size*.18);g.stroke();}}else{g.beginPath();g.arc(0,0,size,.18,TAU-.62);g.stroke();g.beginPath();g.arc(0,0,size*.5,Math.PI*.8,Math.PI*2.6);g.stroke();ellipse(size*.95,-size*.31,1.7,1.7,color);}});}
    function label(value,x,y,alpha=1){save(alpha,()=>{g.font='600 15px "Microsoft YaHei",system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';const width=g.measureText(value).width+19;round(x-width/2,y-13,width,26,10,'#183135d9','#f3edd42b');g.fillStyle='#fff3d4';g.fillText(value,x,y+1);});}

    function riverEdges(y){const rows=terrain.river||fallbackTerrain.river;for(let i=1;i<rows.length;i++)if(y<=rows[i][0]){const a=rows[i-1],b=rows[i],u=clamp((y-a[0])/(b[0]-a[0]||1));return[mix(a[1],b[1],u),mix(a[2],b[2],u)];}return rows.at(-1).slice(1);}
    function riverPath(context){const rows=terrain.river||fallbackTerrain.river,poly=terrain.riverPolygon||rows.map(r=>[r[1],r[0]]).concat(rows.slice().reverse().map(r=>[r[2],r[0]]));context.beginPath();context.moveTo(...poly[0]);poly.slice(1).forEach(p=>context.lineTo(...p));context.closePath();}
    function fallbackMap(){
      bg.fillStyle='#7c9a53';bg.fillRect(0,0,W,H);
      const wash=bg.createRadialGradient(380,340,70,510,400,670);wash.addColorStop(0,'#c1bd77');wash.addColorStop(1,'#305a3e');bg.fillStyle=wash;bg.fillRect(0,0,W,H);
      bg.fillStyle='#ccba84';bg.beginPath();bg.moveTo(0,369);bg.bezierCurveTo(270,350,390,377,600,365);bg.lineTo(615,424);bg.bezierCurveTo(350,420,190,444,0,411);bg.fill();
      bg.fillStyle='#acb08b';bg.fillRect(740,165,420,400);
      for(let i=0;i<1600;i++){const x=noise(i*3.1)*W,y=noise(i*7.7)*H;bg.fillStyle=i%3?'#ddcc9124':'#1f5d3d22';bg.beginPath();bg.ellipse(x,y,2+noise(i)*11,1+noise(i+7)*3,noise(i+3),0,TAU);bg.fill();}
      riverPath(bg);bg.fillStyle='#257e83';bg.fill();bg.strokeStyle='#456c4a';bg.lineWidth=10;bg.stroke();
      bg.fillStyle='#d0c59b';bg.beginPath();bg.ellipse(969,289,78,69,0,0,TAU);bg.fill();bg.strokeStyle='#817d60';bg.lineWidth=4;bg.stroke();
      for(let i=0;i<38;i++){const x=i%2?noise(i*17)*160:1030+noise(i*23)*170,y=noise(i*13)*H;bg.fillStyle=i%3?'#3a7242':'#547e3c';bg.beginPath();bg.ellipse(x,y,28+noise(i)*36,22+noise(i+7)*34,0,0,TAU);bg.fill();}
    }
    function rebuildGround(){bg.clearRect(0,0,W,H);if(image)bg.drawImage(image,0,0,W,H);else fallbackMap();}
    function camera(){
      const player=sampleState().player||pos(terrain.spawn||[250,395]);
      const scale=view.baseScale*zoom,halfW=view.frameWidth/(2*scale),halfH=view.frameHeight/(2*scale);
      // A world-clamped camera keeps the complete artwork inside the fitted map frame.
      const cx=clamp(player.x,halfW,W-halfW),cy=clamp(player.y-18,halfH,H-halfH);
      view.scale=scale;view.zoom=zoom;view.x=view.frameX+view.frameWidth/2-cx*scale;view.y=view.frameY+view.frameHeight/2-cy*scale;
    }
    function resize(){if(disposed)return view;const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1)),width=Math.max(1,rect.width||W),height=Math.max(1,rect.height||H);const pixelsW=Math.round(width*dpr),pixelsH=Math.round(height*dpr);if(canvas.width!==pixelsW||canvas.height!==pixelsH){canvas.width=pixelsW;canvas.height=pixelsH;}const baseScale=Math.min(width/W,height/H);view={width,height,baseScale,frameX:(width-W*baseScale)/2,frameY:(height-H*baseScale)/2,frameWidth:W*baseScale,frameHeight:H*baseScale,dpr};camera();dirty=false;return view;}
    function setZoom(value){if(Number.isFinite(value))zoom=clamp(value,1,1.8);if(dirty)resize();else camera();return zoom;}
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{dirty=true;}):null;observer?.observe(canvas);
    const onResize=()=>{dirty=true;};window.addEventListener('resize',onResize,{passive:true});
    fallbackMap();
    const ready=(async()=>{const candidates=[terrain.image,'assets/terrain.webp','assets/terrain.jpg'].filter((v,i,a)=>v&&a.indexOf(v)===i);for(const source of candidates){try{const im=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=new URL(source,SCRIPT_BASE).href;});if(disposed)return{terrainLoaded:false};image=im;terrain=window.EchoTerrain||terrain;rebuildGround();dirty=true;return{terrainLoaded:true,width:im.naturalWidth,height:im.naturalHeight};}catch{/* The playable procedural ground remains if an artwork path is absent. */}}return{terrainLoaded:false,width:W,height:H};})();

    function water(time){
      g.save();riverPath(g);g.clip();
      for(let i=0;i<34;i++){const y=(noise(i*9.2)*H+time*(5+noise(i)*4))%H,edges=riverEdges(y),x=mix(edges[0]+10,edges[1]-10,noise(i*17.7));const alpha=.08+.08*Math.sin(time*1.2+i);save(alpha,()=>{g.strokeStyle='#d4f5d9';g.lineWidth=.8;g.beginPath();g.ellipse(x,y,7+noise(i+8)*14,2+noise(i+4)*3,Math.sin(i)*.3,.15,Math.PI*1.5);g.stroke();});}
      for(let i=0;i<9;i++){const y=(i*101+time*11)%H,[left,right]=riverEdges(y);line([[left+16,y],[left+35,y+2],[right-19,y-1]],'#a5e7d5',.7,.09);}
      g.restore();
    }
    function atmosphere(time,foreground=false){
      if(!foreground){
        for(let i=0;i<3;i++){const x=310+i*215+Math.sin(time*.07+i)*46,y=510+Math.cos(i*2)*110;save(.025,()=>{const mist=g.createRadialGradient(x,y,10,x,y,180);mist.addColorStop(0,'#e6f4d9');mist.addColorStop(1,'#e6f4d900');g.fillStyle=mist;g.fillRect(x-180,y-80,360,160);});}
        return;
      }
      for(let i=0;i<26;i++){const x=(noise(i*5.31)*W+time*(2.8+noise(i)*2))%W,y=(noise(i*11.3)*H+Math.sin(time*.38+i)*13)%H;const a=.22+noise(i+11)*.35;save(a,()=>{g.translate(x,y);g.rotate(time*.25+i);ellipse(0,0,1.7+noise(i+8)*1.6,.7+noise(i+19)*.6,'#fff7ca');});}
      for(let i=0;i<5;i++){const x=285+i*165+Math.sin(time*.3+i)*14,y=230+Math.cos(time*.42+i*1.6)*16;ellipse(x,y,.9,.9,'#fff4ab');}
    }
    function ice(sheet,time){
      const r=Math.max(8,sheet.r||30),remaining=clamp(sheet.life/Math.max(.01,sheet.maxLife||sheet.life||1)),born=clamp(((sheet.maxLife||sheet.life)-sheet.life)*4),alpha=remaining<.12?.5+remaining*3:.91;
      save(alpha,()=>{halo(sheet.x,sheet.y,r*1.3,'#a5e9f4',.13);g.save();g.translate(sheet.x,sheet.y);g.scale(.85+.15*born,.85+.15*born);
        const rim=[];for(let k=0;k<13;k++){const a=k*TAU/13,rr=r*(.91+noise(k*2.7+identifier(sheet.id))*.09);rim.push([Math.cos(a)*rr,Math.sin(a)*rr]);}polygon(rim,'#c2e6ee94','#e2fbf0a8',.85);
        g.save();g.beginPath();g.arc(0,0,r-1,0,TAU);g.clip();
        for(let i=0;i<7;i++){const a=i*TAU/7+.22;const end=[Math.cos(a)*r,Math.sin(a)*r];polygon([[0,0],end,[Math.cos(a+.7)*r,Math.sin(a+.7)*r]],i%2?'#dbf7ff1c':'#70c4df24');line([[0,0],[end[0]*.52,end[1]*.52],[end[0]*.79-4,end[1]*.7+5],end],'#eefeff',.7,.47);}
        for(let i=0;i<8;i++){const sx=(noise(i+identifier(sheet.id))*2-1)*r,sy=(noise(i*13+identifier(sheet.id))*2-1)*r;ellipse(sx,sy,.9,.9,'#faffed');}
        g.restore();g.strokeStyle=remaining<.16?'#e5c582':'#e9fff795';g.lineWidth=1.1;g.beginPath();g.arc(0,0,r-1,-Math.PI*.7,-Math.PI*.7+Math.PI*.4*remaining);g.stroke();rune(0,0,Math.min(9,r*.3),'frost','#ecffff',.38);g.restore();
      });
    }
    function stone(x,y,w,h,seed){
      round(x,y,w,h,3,'#b8b49a','#5f6d58',1.5);polygon([[x+2,y+2],[x+w-3,y+2],[x+w-5,y+7],[x+3,y+7]],'#ded6b8');polygon([[x+w-5,y+7],[x+w,y+3],[x+w,y+h-2],[x+w-5,y+h-3]],'#7c876d');
      for(let i=0;i<3;i++){const sy=y+11+i*13;if(sy<y+h-3)line([[x+2,sy],[x+w-3,sy+noise(seed+i)*2]],'#6f7963',.7,.5);}
      if(h>25)line([[x+w*.38,y+8],[x+w*.46,y+17],[x+w*.35,y+22]],'#7c8067',.8,.8);
      for(let i=0;i<4;i++)ellipse(x+3+noise(seed+i*4.1)*(w-6),y+3+noise(seed+i*8.7)*Math.max(1,h-6),2.4,1.7,'#5b815850');
    }
    function bell(b,state,time){
      const x=b.x,y=b.y,pulse=clamp(state.bellPulse||0),near=Math.hypot(state.player.x-x,state.player.y-y)<110;
      ellipse(x+7,y+8,47,16,'#17312848');halo(x,y-27,55,'#f4d88b',.08+.22*pulse);
      stone(x-47,y-75,18,81,13);stone(x+29,y-76,18,82,31);stone(x-53,y-82,107,16,74);
      stone(x-51,y+2,26,10,17);stone(x+25,y+2,26,10,53);
      line([[x-35,y-65],[x-37,y-85],[x-29,y-90]],'#7a8a6b',2.2,.8);line([[x+38,y-66],[x+42,y-83],[x+35,y-88]],'#729160',1.9,.8);
      g.save();g.translate(x,y-65);g.rotate(Math.sin(time*12)*.11*pulse);
      round(-3,-4,6,12,2,'#847547','#354b3d',1);ellipse(0,9,7,8,'#bba867','#4e5943',1.3);
      const bronze=g.createLinearGradient(-24,10,27,57);bronze.addColorStop(0,'#77683c');bronze.addColorStop(.24,'#d9bc69');bronze.addColorStop(.58,'#a28d43');bronze.addColorStop(1,'#526e56');
      g.beginPath();g.moveTo(-8,12);g.bezierCurveTo(-19,16,-15,36,-25,47);g.lineTo(-30,53);g.quadraticCurveTo(0,64,30,53);g.lineTo(25,47);g.bezierCurveTo(15,36,19,16,8,12);g.closePath();g.fillStyle=bronze;g.fill();g.strokeStyle='#334737';g.lineWidth=2;g.stroke();
      ellipse(0,53,30,8,'#746c3d','#3c4d39',1.5);ellipse(0,54,22,4.6,'#303f32');line([[0,39],[0,56]],'#816e3c',3);ellipse(0,57,5,5,'#c2a45a','#3c4d39',1);
      line([[-10,19],[-14,34],[-18,43]],'#fff1bb',2,.6);line([[-23,47],[0,51],[23,47]],'#e7d18c',1.4,.65);
      rune(1,31,8,'echo',pulse? '#fff4b3':'#c8d6a2',.72+.28*pulse);g.restore();
      if(pulse>.01){for(let i=0;i<3;i++){const p=fract(time*.8+i*.33);save(pulse*(1-p)*.55,()=>ellipse(x,y-18,35+p*75,15+p*34,null,'#fff1b2',1.3));}}
      if(near)label('古钟',x,y-105,.93);
      else if(state.aim&&Math.hypot(state.aim.x-x,state.aim.y-y)<45)label('古钟',x,y-105,.75);
    }
    function relic(site,state,time,index){
      const revealed=(site.revealedUntil||0)>(state.time||0),near=Math.hypot(state.player.x-site.x,state.player.y-site.y)<110;
      const collected=site.collected||(state.relics||[]).includes(site.id);
      if(collected){save(.35,()=>{ellipse(site.x,site.y,11,5,null,'#e0d99e',1);rune(site.x,site.y-3,5,'echo','#f5ecc2',.5);});return;}
      const col=['#d6efb0','#c4eaff','#e7c8f4'][index%3],bob=Math.sin(time*1.7+index*2)*2.2,yy=site.y-17+bob;
      ellipse(site.x+2,site.y+3,13,5,'#18352a45');halo(site.x,yy,near||revealed?40:27,col,near||revealed?.27:.12);
      ellipse(site.x,site.y+2,14+(revealed?4:0),6,null,col,1);
      g.save();g.translate(site.x,yy);g.rotate(Math.sin(time*.65+index)*.07);
      polygon([[-9,-10],[2,-15],[11,-7],[8,8],[-1,13],[-10,5]],'#a4b5a0','#3d5a51',1.6);
      polygon([[-7,-9],[1,-12],[1,9],[-7,3]],'#e3e7c8');polygon([[1,-12],[8,-6],[5,6],[1,9]],'#89a9a0');
      rune(0,-1,5.7,['wind','frost','echo'][index%3],col,.95);g.restore();
      for(let k=0;k<3;k++){const a=time*.7+k*TAU/3+index,r=16+k*2;save(.45,()=>ellipse(site.x+Math.cos(a)*r,yy+Math.sin(a)*r*.6,1.2,1.2,col));}
      if(near||revealed)label(site.name||'回声碎片',site.x,site.y+27,near?1:.85);
    }
    function backpack(front=false){
      const x=front?4:-17,y=-34;
      round(x,y,18,22,6,'#6d5137','#253b38',1.5);round(x+1,y-1,16,9,4,'#a67b47','#493f2c',1);
      round(x+7,y+7,4,10,1,'#c8aa72');line([[x+3,y+4],[x+14,y+4]],'#c5a675',.9,.8);round(x+15,y+8,4,10,1,'#acb9a3','#3a5045',.8);
    }
    function avatar(player,state,time){
      const x=player.x,y=player.y,lift=state.jump?.height||0,walk=player.moving&&!player.airborne,phase=time*11.5;
      const front=Math.sin(player.facing||0)>-.35,look=Math.cos(player.facing||0),bob=walk?Math.abs(Math.sin(phase))*.85:Math.sin(time*2.1)*.35;
      const shadow=clamp(1-lift/90,.35,1);
      ellipse(x+3,y+3,17*shadow,7*shadow,'#142e2c60');
      save(.5,()=>ellipse(x,y+2,21,10,null,'#fff1bf',1.2));
      if(walk){for(let i=0;i<3;i++){const p=fract(time*2+i*.33),dx=player.dx||Math.cos(player.facing||0),dy=player.dy||Math.sin(player.facing||0);save((1-p)*.16,()=>ellipse(x-dx*(12+p*17)+(i-1)*3,y-dy*(12+p*17)+2,2+p*3,1.3+p,'#eee0a4'));}}
      g.save();g.translate(x,y-lift+bob);
      const a=walk?Math.sin(phase)*3:0,b=walk?Math.sin(phase+Math.PI)*3:0;
      line([[-7,-14],[-8,-3+a]],'#383e36',7);line([[7,-14],[8,-3+b]],'#323a35',7);
      round(-13,-5+a,11,8,3,'#2b3937','#172f30',1.1);round(3,-5+b,12,8,3,'#2b3937','#172f30',1.1);
      line([[-10,-3+a],[-5,-3+a]],'#708074',1.1,.7);line([[6,-3+b],[11,-3+b]],'#708074',1.1,.7);
      if(front)backpack(false);
      // A short, layered rain cape: rounded shoulders and uneven straw fringe.
      g.beginPath();g.moveTo(-10,-41);g.quadraticCurveTo(-20,-38,-22,-25);g.lineTo(-25,-11);g.quadraticCurveTo(-16,-7,-9,-9);g.lineTo(-3,-6);g.lineTo(3,-9);g.lineTo(10,-7);g.lineTo(17,-10);g.lineTo(23,-10);g.quadraticCurveTo(20,-30,12,-41);g.closePath();
      const coat=g.createLinearGradient(-20,-33,21,-6);coat.addColorStop(0,'#f1ce66');coat.addColorStop(.45,'#dca637');coat.addColorStop(1,'#a1702c');g.fillStyle=coat;g.fill();g.strokeStyle='#584b2b';g.lineWidth=1.7;g.stroke();
      g.save();g.clip();for(let i=0;i<14;i++){const sx=-22+i*3.5;line([[sx,-30+noise(i)*5],[sx+Math.sin(i)*2,-12+noise(i+7)*5]],i%3?'#977128':'#ffe6a0',.85,.55);}g.restore();
      g.beginPath();g.moveTo(-15,-35);g.quadraticCurveTo(0,-28,16,-35);g.lineTo(21,-23);g.quadraticCurveTo(0,-14,-22,-23);g.closePath();g.fillStyle='#e8bb4f';g.fill();g.strokeStyle='#b38331';g.lineWidth=1;g.stroke();
      line([[-18,-25],[-3,-21],[13,-24]],'#ffdc81',1.5,.6);
      if(!front)backpack(true);
      ellipse(-22,-19,3.7,4.2,'#bca27b','#49472e',1);ellipse(21,-18,3.6,4.2,'#c8ad83','#49472e',1);
      // The deep indigo hood has no pointed cap, elf ears, or familiar franchise silhouette.
      g.beginPath();g.moveTo(-15,-37);g.quadraticCurveTo(-20,-53,-9,-61);g.quadraticCurveTo(2,-67,13,-58);g.quadraticCurveTo(21,-49,16,-36);g.quadraticCurveTo(0,-30,-15,-37);g.closePath();
      const hood=g.createLinearGradient(-16,-60,13,-34);hood.addColorStop(0,'#56627e');hood.addColorStop(.38,'#2e3d5a');hood.addColorStop(1,'#18293e');g.fillStyle=hood;g.fill();g.strokeStyle='#142b35';g.lineWidth=1.7;g.stroke();
      line([[-11,-56],[-7,-60],[0,-61]],'#8b96a4',1.1,.55);
      if(front){const fx=look*2;ellipse(fx,-44,10,8.8,'#10212b');ellipse(fx+1,-42,6.9,5.9,'#ad9674');polygon([[fx-8,-49],[fx+9,-49],[fx+6,-44],[fx-6,-45]],'#27364b');ellipse(fx-2.5,-43,1.15,1.2,'#f4e4ac');ellipse(fx+3.4,-42.6,1.15,1.2,'#f4e4ac');line([[fx-2,-37],[fx+4,-37]],'#6d6553',1,.7);}else{line([[0,-59],[2,-39]],'#111f34',1.2,.65);line([[-12,-42],[0,-37],[13,-42]],'#566578',1,.7);}
      const casting=(state.effects||[]).some(e=>['frost','wind','echo'].includes(e.type)&&e.life>e.maxLife*.45&&Math.hypot(e.x-x,e.y-y)<38);
      if(casting){const col=colorFor(state.rune);halo(look>=0?23:-23,-20,16,col,.38);rune(look>=0?23:-23,-20,6,state.rune,col,.95);}
      g.restore();
      if(lift>0){save(.55,()=>{g.setLineDash([2,4]);line([[x,y-3],[x,y-lift+1]],'#eef6cf',1);g.setLineDash([]);});}
    }
    function windRibbon(e,time,alpha=1){
      const dx=e.tx-e.x,dy=e.ty-e.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
      for(let k=-1;k<=1;k++){const path=[];for(let i=0;i<=26;i++){const u=i/26,offset=(k*8+Math.sin(u*TAU*1.3-time*5+k)*5)*Math.sin(Math.PI*u);path.push([e.x+dx*u+nx*offset,e.y+dy*u+ny*offset-4]);}line(path,PALETTE.wind,k===0?2.2:1.2,.4*alpha);}
      for(let k=0;k<5;k++){const u=fract(time*1.3+k*.19),offset=Math.sin(u*11+k)*8;save((1-Math.abs(u-.5)*2)*alpha,()=>{const x=e.x+dx*u+nx*offset,y=e.y+dy*u+ny*offset;line([[x-dx/length*6,y-dy/length*6],[x,y]],'#edffd7',2);});}
    }
    function effect(e,time){
      const p=clamp(1-e.life/Math.max(.001,e.maxLife||1)),fade=Math.sin(Math.PI*p),seed=identifier(e.id),col=colorFor(e.rune||e.type),tx=Number.isFinite(e.tx)?e.tx:e.x,ty=Number.isFinite(e.ty)?e.ty:e.y;
      if(e.type==='wind'||e.type==='gust'){windRibbon({...e,tx,ty},time,e.type==='gust'?clamp(e.life/.9):fade);return;}
      if(e.type==='frost'){
        const x=mix(e.x,tx,clamp(p*2.5)),y=mix(e.y,ty,clamp(p*2.5));line([[e.x,e.y-14],[x,y]],'#d1f1ff',2.5,(1-p)*.65);halo(tx,ty,40+35*p,'#bceeff',fade*.16);
        for(let k=0;k<11;k++){const a=k*TAU/11+noise(seed)*.6,r=(14+p*38)*(.6+noise(seed+k)*.4),xx=tx+Math.cos(a)*r,yy=ty+Math.sin(a)*r;save((1-p)*.9,()=>polygon([[xx,yy-5],[xx+2.5,yy],[xx,yy+5],[xx-2.5,yy]],'#dcfbff'));}return;
      }
      if(e.type==='echo'){const r=11+p*19;save((1-p)*.8,()=>ellipse(e.x,e.y-10,r,r*.55,null,PALETTE.echo,1.8));return;}
      if(e.type==='bell'||e.type==='resonance'){
        const radius=e.type==='bell'?125:70;for(let k=0;k<3;k++){const u=clamp((p-k*.15)/(1-k*.15));if(u<=0)continue;save((1-u)*.7,()=>{ellipse(e.x,e.y-5,10+u*radius,(10+u*radius)*.62,null,e.type==='bell'?'#ffe5a5':'#d7eaff',2-u);});}return;
      }
      if(e.type==='relic'){
        halo(e.x,e.y-15,25+p*55,'#ffe6b3',fade*.28);for(let k=0;k<12;k++){const a=k*TAU/12,r=12+p*28;save((1-p)*.85,()=>ellipse(e.x+Math.cos(a)*r,e.y-16-p*30+Math.sin(a)*r*.6,1.8,1.8,'#fff0b8'));}return;
      }
      if(e.type==='return'){
        for(const q of [{x:e.x,y:e.y},{x:tx,y:ty}])save(fade*.7,()=>{ellipse(q.x,q.y,11+p*24,7+p*15,null,'#efdfad',1.8);rune(q.x,q.y-17,7,'wind','#e7f7ca',fade);});return;
      }
      save((1-p)*.7,()=>ellipse(e.x,e.y,5+p*30,3+p*13,null,col,1.5));
    }
    function projectile(shot,time){
      const col=shot.resonance?'#c9f7ff':PALETTE.echo,trail=shot.trail||[];
      for(let i=1;i<trail.length;i++){const a=trail[i-1],b=trail[i];line([[a.x,a.y-9],[b.x,b.y-9]],col,2.2,i/trail.length*.6);}
      halo(shot.x,shot.y-9,shot.r*2.8,col,.27);ellipse(shot.x,shot.y-9,shot.r,shot.r*.85,'#e6d5f6','#fff3fa',1.2);ellipse(shot.x-2,shot.y-11,shot.r*.4,shot.r*.37,'#fff9df');
      save(.75,()=>{g.translate(shot.x,shot.y-9);g.rotate(time*7);g.beginPath();g.ellipse(0,0,shot.r+4,shot.r+2,0,.2,Math.PI*1.35);g.strokeStyle=col;g.lineWidth=1;g.stroke();});
    }
    function marker(x,y,color,time,solid=false){
      const r=solid?19:12;
      g.save();g.translate(x,y);ellipse(0,0,r,r*.66,null,'#183a34b0',3.7);ellipse(0,0,r,r*.66,null,color,1.8);
      if(solid){const p=(Math.sin(time*4)+1)/2;ellipse(0,0,r+4+p*3,(r+4+p*3)*.66,null,color,1-p*.5);ellipse(0,0,2.2,2.2,color);}else{line([[-r-5,0],[-r+1,0]],color,1.4);line([[r-1,0],[r+5,0]],color,1.4);line([[0,-r*.66-4],[0,-r*.66+1]],color,1.4);line([[0,r*.66-1],[0,r*.66+4]],color,1.4);}g.restore();
    }
    function destinations(state,time){
      const aim=state.aim,player=state.player;
      if(state.goal&&Math.hypot(state.goal.x-player.x,state.goal.y-player.y)>12){marker(state.goal.x,state.goal.y,'#fff4cb',time,true);}
      if(state.jump){marker(state.jump.tx,state.jump.ty,PALETTE.wind,time,true);}
      if(aim&&canvas.dataset.aiming==='true'&&canvas.dataset.mode==='cast'){
        const dx=aim.x-player.x,dy=aim.y-player.y,d=Math.hypot(dx,dy),range=game.getCastRange();
        if(d>18){
          const reach=Math.min(1,range/d),x=player.x+dx*reach,y=player.y+dy*reach,col=colorFor(state.rune);
          if(d>range+8){
            g.save();g.setLineDash([3,5]);line([[x-dx/d*32,y-dy/d*32],[x,y]],col,1.8,.85);g.restore();
          }
          marker(x,y,col,time,false);
        }
      }
      const age=state.time||0;
      if(age<6){const a=clamp((6-age)/1.5),yy=player.y-(state.jump?.height||0)-79+Math.sin(time*3)*3;
        save(a*.9,()=>{halo(player.x,yy,16,'#ffe8a9',.35);line([[player.x-5,yy-3],[player.x,yy+2],[player.x+5,yy-3]],'#493d24',4);line([[player.x-5,yy-3],[player.x,yy+2],[player.x+5,yy-3]],'#ffe9ad',2);});
      }
    }
    function render(seconds=0){
      if(disposed)return;
      if(dirty||view.dpr!==Math.min(2,Math.max(1,window.devicePixelRatio||1)))resize();
      const state=sampleState(),player=state.player||{...pos(terrain.spawn||[250,395]),facing:0};
      const stateView=state.player?state:{...state,player};const time=Number.isFinite(seconds)?seconds:state.time||0;
      camera();
      g.setTransform(view.dpr,0,0,view.dpr,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.fillStyle='#183b35';g.fillRect(0,0,view.width,view.height);
      g.save();g.beginPath();g.rect(view.frameX,view.frameY,view.frameWidth,view.frameHeight);g.clip();
      g.setTransform(view.scale*view.dpr,0,0,view.scale*view.dpr,view.x*view.dpr,view.y*view.dpr);
      g.beginPath();g.rect(0,0,W,H);g.clip();g.drawImage(ground,0,0);water(time);atmosphere(time,false);
      for(const patch of state.ice||[])ice(patch,time);
      for(const e of state.effects||[])if(e.type==='gust')effect(e,time);
      const bellPosition=state.bell||pos(terrain.bell||[969,289]),sites=state.relicSites||terrain.relics||[];
      const entities=[{y:bellPosition.y,draw:()=>bell(bellPosition,stateView,time)},{y:player.y,draw:()=>avatar(player,stateView,time)},...sites.map((r,i)=>({y:r.y,draw:()=>relic(r,stateView,time,i)}))];
      entities.sort((a,b)=>a.y-b.y);entities.forEach(entity=>entity.draw());
      for(const shot of state.projectiles||[])projectile(shot,time);
      for(const e of state.effects||[])if(e.type!=='gust')effect(e,time);
      atmosphere(time,true);destinations(stateView,time);
      g.restore();g.setTransform(1,0,0,1,0,0);
    }
    function point(clientX,clientY){if(dirty)resize();const r=canvas.getBoundingClientRect(),sx=clientX-r.left,sy=clientY-r.top,x=(sx-view.x)/view.scale,y=(sy-view.y)/view.scale;return{x:clamp(x,0,W),y:clamp(y,0,H),inside:sx>=view.frameX&&sx<=view.frameX+view.frameWidth&&sy>=view.frameY&&sy<=view.frameY+view.frameHeight&&x>=0&&x<=W&&y>=0&&y<=H};}
    function screen(x,y){if(dirty)resize();const r=canvas.getBoundingClientRect();return{x:r.left+view.x+x*view.scale,y:r.top+view.y+y*view.scale};}
    function destroy(){disposed=true;observer?.disconnect();window.removeEventListener('resize',onResize);}
    resize();
    return{ready,render,point,screen,resize,setZoom,destroy,get zoom(){return zoom;},get view(){return{...view};},get terrainLoaded(){return!!image;}};
  }
  window.EchoRenderer={create,width:W,height:H};
}());
