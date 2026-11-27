/* Small UI symbols share a 32-unit pen grid. The world itself is a painted bitmap. */
window.EchoInk = (() => {
  const paths = {
    brand:'M16 1 L26 16 L16 31 L6 16 Z M16 4 V29 M7 16 H25 M16 23 Q9 21 7 15 M16 17 Q23 16 26 10 M11 9 L16 14 L21 9',
    sound:'M4 13 H10 L17 7 V25 L10 19 H4 Z M21 11 Q26 16 21 21 M24 7 Q33 16 24 25',
    mute:'M4 13 H10 L17 7 V25 L10 19 H4 Z M22 12 L29 20 M29 12 L22 20',
    book:'M3 6 Q10 4 16 9 Q21 4 29 6 V25 Q22 23 16 27 Q10 23 3 25 Z M16 9 V26',
    full:'M4 12 V5 H12 M20 5 H28 V12 M28 20 V27 H20 M12 27 H4 V20',
    wand:'M4 28 L20 12 M17 5 L19 10 L24 12 L19 14 L17 20 L15 14 L10 12 L15 10 Z M25 3 V8 M23 5.5 H28',
    weave:'M8 5 L16 13 L8 21 L1 13 Z M23 11 L31 19 L23 27 L15 19 Z M7 13 H23 M12 9 L21 18',
    walk:'M11 4 Q15 4 16 9 L17 15 Q15 19 11 17 L8 12 Q6 6 11 4 Z M12 21 L17 20 L18 24 L14 26 Z M22 12 Q26 10 27 16 L27 21 L24 23 L21 20 Z M23 26 L28 25 L28 29 L24 30 Z',
    quill:'M5 26 Q10 21 14 16 M8 23 Q8 9 25 4 Q27 15 15 23 Z M10 22 L23 7 M14 15 L19 15 M14 29 H28',
    camp:'M3 25 L15 7 L28 25 Z M11 25 L16 17 L20 25 M13 4 L20 13 M18 4 L12 13',
    frost:'M16 2 V30 M4 9 L28 23 M4 23 L28 9 M12 5 L16 9 L20 5 M12 27 L16 23 L20 27 M5 14 L9 12 L9 7 M23 25 L23 20 L28 18 M5 18 L9 20 L9 25 M23 7 L23 12 L28 14',
    wind:'M3 14 C8 14 10 10 17 10 C26 10 27 3 22 3 C19 3 18 5 18 6 M5 19 C13 20 16 14 24 14 Q30 14 29 10 M8 24 Q14 25 19 22 C25 18 29 22 26 26 Q24 29 21 26',
    echo:'M3 16 H6 L9 11 L12 22 L16 5 L20 27 L23 13 L26 18 L29 16 M6 6 Q2 9 2 12 M27 26 Q30 23 30 20',
    forest:'M7 26 L23 8 M7 23 Q2 11 23 4 Q27 20 12 24 Z M12 18 L12 11 M15 15 L22 15',
    meadow:'M13 27 L17 13 M11 13 L9 8 L14 9 L16 4 L19 9 L24 7 L22 13 L26 16 L20 17 L18 22 L15 17 L11 19 L12 15 L7 14 Z M14 25 Q8 20 7 22 Q9 26 13 27',
    courtyard:'M6 12 L16 5 L26 12 L23 23 L16 28 L9 23 Z M6 12 L16 17 L26 12 M16 17 V28 M11 10 L20 14',
    compass:'M16 2 L22 23 L16 19 L10 23 Z M16 2 V29 M4 20 H9 M23 20 H28'
  };
  const stamps=new Map();
  function draw(el){
    const name=el.dataset.ink, p=paths[name];
    if(!p)return;
    const color=getComputedStyle(el).color,key=name+'|'+color;
    if(!stamps.has(key)){
      const stamp=document.createElement('canvas');stamp.width=stamp.height=64;
      const c=stamp.getContext('2d',{willReadFrequently:true});
      c.scale(2,2);c.strokeStyle=color;
      c.lineWidth=['brand','compass'].includes(name)?1.2:1.7;c.lineJoin='round';c.lineCap='round';c.stroke(new Path2D(p));
      if(name==='compass'){c.fillStyle=color;c.fill(new Path2D('M16 2L22 23L16 19Z'));}
      stamps.set(key,'url('+stamp.toDataURL()+')');
    }
    el.style.backgroundImage=stamps.get(key);el.style.backgroundRepeat='no-repeat';el.style.backgroundPosition='center';
    el.style.backgroundSize=el.dataset.route?'68% 68%':'contain';
  }
  return {draw,all(){document.querySelectorAll('canvas[data-ink]').forEach(draw);}};
})();
