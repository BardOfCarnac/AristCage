/* Optional heuristic image rangefinder rendered inside the LayeredChamber stack. */
window.HeuristicRangefinder = (() => {
  const ROOT_CLASS = 'heuristic-rangefinder-active';
  const DEFAULT_SOURCE = 'https://media.craiyon.com/2025-09-28/U_sUqYxjTEuZhc0UIYffDg.webp';
  const PALETTE = [[42,2,5],[104,5,12],[176,10,18],[243,24,24],[255,84,32],[255,174,72],[255,242,220]];
  const settings = { depth: 1, focus: 4, zoom: 1.08, softness: .22, recolour: true, showBase: true };

  let canvas, ctx, status, image, baseCanvas, bands = [];
  let active = false, ready = false, raf = 0, dpr = 1, W = 0, H = 0;
  let pointerId = null, dragging = false, dragDistance = 0, lastX = 0, lastY = 0;
  let targetLook = {x:0,y:0}, look = {x:0,y:0};
  let targetInspection = {u:.5,v:.5}, inspection = {u:.5,v:.5};
  let targetZoom = settings.zoom, zoom = settings.zoom, pulse = 0;
  let previousChamberMode = null;

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const luminance = (r,g,b) => (.2126*r + .7152*g + .0722*b) / 255;
  const button = () => document.querySelector('#heuristic-rangefinder-toggle');
  const chamberRoot = () => document.querySelector('#layered-chamber-system');

  function ensureChamber() {
    if (!window.LayeredChamber) return false;
    if (!LayeredChamber.isEnabled()) {
      previousChamberMode = LayeredChamber.MODES.OFF;
      LayeredChamber.setMode(LayeredChamber.MODES.BACKGROUND);
    } else if (previousChamberMode === null) previousChamberMode = LayeredChamber.getMode();
    return true;
  }

  function mount() {
    if (canvas?.isConnected) return true;
    if (!ensureChamber()) return false;
    const root = chamberRoot();
    if (!root) return false;

    canvas = document.createElement('canvas');
    canvas.id = 'heuristic-rangefinder-plane';
    canvas.className = 'layered-chamber-canvas heuristic-rangefinder-plane';
    canvas.setAttribute('aria-label', 'Heuristic image depth planes');
    const foreground = root.querySelector('#layered-chamber-fg');
    root.insertBefore(canvas, foreground || null);
    ctx = canvas.getContext('2d');

    status = document.createElement('div');
    status.className = 'heuristic-rangefinder-status';
    status.textContent = 'RANGEFINDER STANDBY';
    document.body.append(status);

    addEventListener('resize', resize, {passive:true});
    addEventListener('pointerdown', pointerDown, true);
    addEventListener('pointermove', pointerMove, {capture:true, passive:false});
    addEventListener('pointerup', pointerUp, true);
    addEventListener('pointercancel', pointerUp, true);
    addEventListener('wheel', wheel, {capture:true, passive:false});
    resize();
    return true;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function setStatus(message, fade=true) {
    if (!status) return;
    status.textContent = message; status.style.opacity = '1';
    if (fade) setTimeout(() => { if (status) status.style.opacity = '.35'; }, 1100);
  }

  function buildBands() {
    bands = [];
    baseCanvas = document.createElement('canvas');
    baseCanvas.width = image.naturalWidth; baseCanvas.height = image.naturalHeight;
    const bx = baseCanvas.getContext('2d'); bx.drawImage(image,0,0);
    let source;
    try { source = bx.getImageData(0,0,baseCanvas.width,baseCanvas.height); }
    catch (error) { setStatus('IMAGE HOST BLOCKED CANVAS ACCESS', false); throw error; }

    const w=baseCanvas.width, h=baseCanvas.height, count=w*h;
    const gray=new Float32Array(count), edge=new Float32Array(count), contrast=new Float32Array(count), depth=new Float32Array(count);
    for(let p=0;p<count;p++){ const i=p*4; gray[p]=luminance(source.data[i],source.data[i+1],source.data[i+2]); }

    let edgeMax=.0001;
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
      const p=y*w+x;
      const gx=-gray[p-w-1]+gray[p-w+1]-2*gray[p-1]+2*gray[p+1]-gray[p+w-1]+gray[p+w+1];
      const gy=-gray[p-w-1]-2*gray[p-w]-gray[p-w+1]+gray[p+w-1]+2*gray[p+w]+gray[p+w+1];
      edge[p]=Math.hypot(gx,gy); edgeMax=Math.max(edgeMax,edge[p]);
    }

    let contrastMax=.0001;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      let sum=0,sum2=0,n=0;
      for(let yy=Math.max(0,y-3);yy<=Math.min(h-1,y+3);yy+=2) for(let xx=Math.max(0,x-3);xx<=Math.min(w-1,x+3);xx+=2){
        const v=gray[yy*w+xx]; sum+=v; sum2+=v*v; n++;
      }
      const mean=sum/n, c=Math.sqrt(Math.max(0,sum2/n-mean*mean));
      contrast[y*w+x]=c; contrastMax=Math.max(contrastMax,c);
    }

    const horizon=.43;
    for(let y=0;y<h;y++){
      const yn=y/Math.max(1,h-1), below=clamp01((yn-horizon)/(1-horizon)), above=clamp01((horizon-yn)/horizon);
      for(let x=0;x<w;x++){
        const p=y*w+x, xn=x/Math.max(1,w-1), centre=1-Math.min(1,Math.abs(xn-.5)*2);
        const e=clamp01(edge[p]/edgeMax*2.2), c=clamp01(contrast[p]/contrastMax*1.9), dark=1-gray[p];
        depth[p]=clamp01(below*.58+e*.20+c*.14+dark*.08-above*centre*.22+(1-centre)*above*(e*.55+c*.45)*.28);
      }
    }

    for(let bi=0;bi<7;bi++){
      const layer=document.createElement('canvas'); layer.width=w; layer.height=h;
      const lx=layer.getContext('2d'), out=lx.createImageData(w,h);
      const centre=(bi+.5)/7, half=.5/7;
      for(let p=0;p<count;p++){
        const distance=Math.abs(depth[p]-centre);
        const alpha=distance<=half?1:Math.max(0,1-(distance-half)/Math.max(.0001,half*settings.softness*2.5));
        if(alpha<=0) continue;
        const i=p*4, energy=Math.max(0,Math.min(6,Math.floor(gray[p]*7))), colour=PALETTE[energy];
        out.data[i]=settings.recolour?colour[0]:source.data[i];
        out.data[i+1]=settings.recolour?colour[1]:source.data[i+1];
        out.data[i+2]=settings.recolour?colour[2]:source.data[i+2];
        out.data[i+3]=Math.round(source.data[i+3]*alpha);
      }
      lx.putImageData(out,0,0); bands.push(layer);
    }
  }

  function load(source=DEFAULT_SOURCE) {
    if (!mount()) return;
    ready=false; setStatus('ANALYSING STREET DEPTH',false);
    image=new Image(); image.crossOrigin='anonymous';
    image.onload=()=>{ try{ buildBands(); ready=true; setStatus('HEURISTIC DEPTH RESOLVED'); }catch(error){ console.error('HeuristicRangefinder:',error); } };
    image.onerror=()=>setStatus('IMAGE COULD NOT LOAD',false);
    image.src=source;
  }

  function chamberPlane(z) {
    const focal=Math.min(W,H)*.84, near=2.5;
    const viewportHalfW=(W*.5)*near/focal, viewportHalfH=(H*.5)*near/focal;
    const aspect=image.naturalWidth/image.naturalHeight;
    let worldH=viewportHalfH*1.92*zoom, worldW=worldH*aspect;
    if(worldW<viewportHalfW*1.92*zoom){ worldW=viewportHalfW*1.92*zoom; worldH=worldW/aspect; }
    const scale=focal/z, width=worldW*scale, height=worldH*scale;
    const pivotX=inspection.u*width, pivotY=inspection.v*height;
    const depthOffset=(z-near)*settings.depth;
    return {
      x:W*.5-pivotX+look.x*(1+depthOffset*.075),
      y:H*.5-pivotY+look.y*(1+depthOffset*.055),
      width,height
    };
  }

  function drawPlane(source,z,alpha,glow=0){
    const r=chamberPlane(z);
    ctx.save(); ctx.globalAlpha=alpha;
    if(glow){ ctx.shadowColor='rgba(255,55,35,.82)'; ctx.shadowBlur=glow; }
    ctx.drawImage(source,r.x,r.y,r.width,r.height); ctx.restore();
  }

  function drawReticle(){
    const x=W/2,y=H/2; ctx.save(); ctx.strokeStyle='rgba(255,92,78,.88)'; ctx.fillStyle='rgba(255,92,78,.9)';
    ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-18,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+18,y);ctx.moveTo(x,y-18);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+18);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function draw(){
    if(!active||!canvas){raf=0;return;}
    look.x+=(targetLook.x-look.x)*.13; look.y+=(targetLook.y-look.y)*.13;
    inspection.u+=(targetInspection.u-inspection.u)*.18; inspection.v+=(targetInspection.v-inspection.v)*.18;
    zoom+=(targetZoom-zoom)*.12; pulse*=.94;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    if(ready){
      const near=2.5, step=.5;
      if(settings.showBase) drawPlane(baseCanvas,near+7*step,.13,.5+pulse*3);
      bands.forEach((layer,index)=>{
        const z=near+(6-index)*step;
        const distance=Math.abs(index-settings.focus), focused=Math.max(0,1-distance/3.2);
        drawPlane(layer,z,.18+focused*.78,1+focused*10+pulse*(6+focused*22));
      });
    }
    drawReticle(); raf=requestAnimationFrame(draw);
  }

  function pointToImage(x,y){
    if(!ready)return null;
    const r=chamberPlane(2.5);
    const u=(x-r.x)/r.width,v=(y-r.y)/r.height;
    return u>=0&&u<=1&&v>=0&&v<=1?{u,v}:null;
  }

  function ignored(event){ return !!event.target.closest?.('.rail'); }
  function pointerDown(event){
    if(!active||ignored(event)||event.button>0)return;
    event.preventDefault(); dragging=true; pointerId=event.pointerId; lastX=event.clientX; lastY=event.clientY; dragDistance=0;
  }
  function pointerMove(event){
    if(!active||!dragging||event.pointerId!==pointerId)return;
    event.preventDefault(); const dx=event.clientX-lastX,dy=event.clientY-lastY; dragDistance+=Math.hypot(dx,dy); targetLook.x+=dx;targetLook.y+=dy;lastX=event.clientX;lastY=event.clientY;
  }
  function pointerUp(event){
    if(!active||!dragging||event.pointerId!==pointerId)return;
    event.preventDefault(); dragging=false; pointerId=null;
    if(dragDistance<10){ const point=pointToImage(event.clientX,event.clientY); if(point){targetInspection=point;targetLook={x:0,y:0};pulse=1;setStatus(`INSPECTION POINT ${Math.round(point.u*100)} / ${Math.round(point.v*100)}`);} }
  }
  function wheel(event){ if(!active||ignored(event))return; event.preventDefault(); targetZoom=Math.max(.5,Math.min(3.5,targetZoom*Math.exp(-event.deltaY*.0012))); }

  function setButtonState(){ const control=button(); if(control){control.setAttribute('aria-pressed',String(active));control.textContent=active?'Range On':'Range Off';} }
  function enable(source){
    if(!mount())return; if(source||!image)load(source||DEFAULT_SOURCE);
    active=true; document.documentElement.classList.add(ROOT_CLASS); setButtonState(); LayeredChamber.refresh(); if(!raf)raf=requestAnimationFrame(draw);
  }
  function disable(){
    active=false; document.documentElement.classList.remove(ROOT_CLASS); setButtonState(); if(raf)cancelAnimationFrame(raf);raf=0;
    if(ctx)ctx.clearRect(0,0,W,H);
  }
  function toggle(){active?disable():enable();}
  function configure(options={}){Object.assign(settings,options);if(Number.isFinite(options.zoom)){targetZoom=options.zoom;zoom=options.zoom;}if(ready&&('softness'in options||'recolour'in options))buildBands();}

  document.addEventListener('click',event=>{if(event.target.closest('#heuristic-rangefinder-toggle'))toggle();});
  return {enable,disable,toggle,load,configure,settings};
})();