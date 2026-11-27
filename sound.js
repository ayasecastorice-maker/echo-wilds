/* All cues are synthesized on demand. The first player gesture starts Web Audio. */
window.EchoSound = (() => {
  let audio,master,enabled=true;
  function wake(){
    if(!enabled)return;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    try{if(!audio){audio=new AC();master=audio.createGain();master.gain.value=.47;master.connect(audio.destination);}
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch{/* Audio is optional on browsers without sound output. */}
  }
  function set(val){enabled=Boolean(val);if(enabled)wake();if(master)master.gain.setTargetAtTime(enabled ? .47 : 0,audio.currentTime,.03);}
  function tone(f,duration,level,wave='sine',delay=0,to=0){
    if(!audio||!enabled||audio.state!=='running')return;
    const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
    o.type=wave;o.frequency.setValueAtTime(f,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(level,t+.015);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.04);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  function cue(event){
    if(event.type==='bell'){
      [[196,.54,3.0],[393,.28,2.4],[544,.10,1.65],[830,.09,1.28],[1158,.05,.9]].forEach(([f,a,d])=>tone(f,d,a));
    }else if(event.type==='relic'){[440,587.33,880].forEach((f,i)=>tone(f,.74,.19,'sine',i*.11));}
    else if(event.type==='resonance'){tone(440,.72,.18);tone(660,.8,.18,'sine',.09);}
    else if(event.type==='cast'){
      if(event.rune==='wind'){tone(180,.34,.15,'triangle',0,462);tone(336,.4,.09,'sine',.045,584);}
      if(event.rune==='frost'){[720,940,1216].forEach((f,i)=>tone(f,.28,.11,'sine',i*.034));}
      if(event.rune==='echo'){tone(396,.45,.19,'sine',0,260);tone(396,.36,.08,'sine',.12,260);}
    }else if(event.type==='equip'||event.type==='form')tone(478,.12,.09,'sine');
  }
  return {wake,set,cue};
})();
