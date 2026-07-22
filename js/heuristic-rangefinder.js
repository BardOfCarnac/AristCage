/* Heuristic image rangefinder rendered inside the LayeredChamber stack. */
window.HeuristicRangefinder = (() => {
  const ROOT_CLASS = 'heuristic-rangefinder-active';
  const DEFAULT_SOURCE = 'https://media.craiyon.com/2025-09-28/U_sUqYxjTEuZhc0UIYffDg.webp';
  const PALETTE = [[42,2,5],[104,5,12],[176,10,18],[243,24,24],[255,84,32],[255,174,72],[255,242,220]];
  const CHAMBER = { near: 2.5, cell: 0.5, focal: 0.84, wallShiftCells: 2 };
  const BAND_COUNT = 7;
  const FOLLOW_WEIGHTS = [1,.85,.70,.55,.40,.25,.10];
  const MAX_DEPTH_DRIFT = 120;
  const settings = { focus: 4, zoom: 1.08, softness: .22, recolour: true, showBase: true };

  let canvas, ctx, hitSurface, status, image, baseCanvas, bands = [];
  let active = false, ready = false, raf = 0, dpr = 1, W = 0, H = 0;
  let targetLook = {x:0,y:0}, look = {x:0,y:0};
  let targetInspection = {u:.5,v:.5}, inspection = {u:.5,v:.5};
  let targetZoom = settings.zoom, zoom = settings.zoom;
  const pointers = new Map();
  let dragDistance = 0, lastX = 0, lastY = 0, pinchDistance = 0, pinchZoom = settings.zoom;

  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const clamp01 = v => clamp(v,0,1);
  const luminance = (r,g,b) => (.2126*r + .7152*g + .0722*b) / 255;
  const button = () => document.querySelector('#heuristic-rangefinder-toggle');
  const chamberRoot = () => document.querySelector('#layered-chamber-system');
  const snapCell = value => Math.max(CHAMBER.cell,Math.round(value/CHAMBER.cell)*CHAMBER.cell);
  const frontDepth = () => CHAMBER.near + CHAMBER.cell;
  const baseDepth = () => CHAMBER.near + CHAMBER.cell * 8;

  function ensureChamber(){
    if(!window.LayeredChamber)return false;
    if(!LayeredChamber.isEnabled())LayeredChamber.setMode(LayeredChamber.MODES.BACKGROUND);
    return true;
  }

  function mount(){
    if(canvas?.isConnected&&hitSurface?.isConnected)return true;
    if(!ensureChamber())return false;
    const root=chamberRoot();
    if(!root)return false;

    canvas=document.createElement('canvas');
    canvas.id='heuristic-rangefinder-plane';
    canvas.className='layered-chamber-canvas heuristic-rangefinder-plane';
    root.insertBefore(canvas,root.querySelector('#layered-chamber-fg')||null);
    ctx=canvas.getContext('2d');

    hitSurface=document.createElement('div');
    hitSurface.className='heuristic-rangefinder-hit-surface';
    hitSurface.setAttribute('aria-label','Rangefinder interaction surface');
    document.body.append(hitSurface);

    status=document.createElement('div');
    status.className='heuristic-rangefinder-status';
    status.textContent='RANGEFINDER STANDBY';
    document.body.append(status);

    addEventListener('resize',resize,{passive:true});
    hitSurface.addEventListener('pointerdown',pointerDown,{passive:false});
    hitSurface.addEventListener('pointermove',pointerMove,{passive:false});
    hitSurface.addEventListener('pointerup',pointerUp,{passive:false});
    hitSurface.addEventListener('pointercancel',pointerUp,{passive:false});
    hitSurface.addEventListener('wheel',wheel,{passive:false});
    resize();
    return true;
  }

  function resize(){
    if(!canvas)return;
    dpr=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    canvas.style.width=`${W}px`; canvas.style.height=`${H}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    constrainTargetView();
  }

  function setStatus(message,fade=true){
    if(!status)return;
    status.textContent=message; status.style.opacity='1';
    if(fade)setTimeout(()=>{if(status)status.style.opacity='.35';},1100);
  }

  function buildBands(){
    bands=[];
    baseCanvas=document.createElement('canvas');
    baseCanvas.width=image.naturalWidth; baseCanvas.height=image.naturalHeight;
    const bx=baseCanvas.getContext('2d'); bx.drawImage(image,0,0);
    let source;
    try{source=bx.getImageData(0,0,baseCanvas.width,baseCanvas.height);}
    catch(error){setStatus('IMAGE HOST BLOCKED CANVAS ACCESS',false);throw error;}

    const w=baseCanvas.width,h=baseCanvas.height,count=w*h;
    const gray=new Float32Array(count),edge=new Float32Array(count),contrast=new Float32Array(count),depth=new Float32Array(count);
    for(let p=0;p<count;p++){const i=p*4;gray[p]=luminance(source.data[i],source.data[i+1],source.data[i+2]);}

    let edgeMax=.0001;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const p=y*w+x;
      const gx=-gray[p-w-1]+gray[p-w+1]-2*gray[p-1]+2*gray[p+1]-gray[p+w-1]+gray[p+w+1];
      const gy=-gray[p-w-1]-2*gray[p-w]-gray[p-w+1]+gray[p+w-1]+2*gray[p+w]+gray[p+w+1];
      edge[p]=Math.hypot(gx,gy); edgeMax=Math.max(edgeMax,edge[p]);
    }

    let contrastMax=.0001;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let sum=0,sum2=0,n=0;
      for(let yy=Math.max(0,y-3);yy<=Math.min(h-1,y+3);yy+=2)for(let xx=Math.max(0,x-3);xx<=Math.min(w-1,x+3);xx+=2){
        const v=gray[yy*w+xx];sum+=v;sum2+=v*v;n++;
      }
      const mean=sum/n,c=Math.sqrt(Math.max(0,sum2/n-mean*mean));
      contrast[y*w+x]=c;contrastMax=Math.max(contrastMax,c);
    }

    const horizon=.43;
    for(let y=0;y<h;y++){
      const yn=y/Math.max(1,h-1),below=clamp01((yn-horizon)/(1-horizon)),above=clamp01((horizon-yn)/horizon);
      for(let x=0;x<w;x++){
        const p=y*w+x,xn=x/Math.max(1,w-1),centre=1-Math.min(1,Math.abs(xn-.5)*2);
        const e=clamp01(edge[p]/edgeMax*2.2),c=clamp01(contrast[p]/contrastMax*1.9),dark=1-gray[p];
        depth[p]=clamp01(below*.58+e*.20+c*.14+dark*.08-above*centre*.22+(1-centre)*above*(e*.55+c*.45)*.28);
      }
    }

    for(let bi=0;bi<BAND_COUNT;bi++){
      const layer=document.createElement('canvas');layer.width=w;layer.height=h;
      const lx=layer.getContext('2d'),out=lx.createImageData(w,h),centre=(bi+.5)/BAND_COUNT,half=.5/BAND_COUNT;
      for(let p=0;p<count;p++){
        const distance=Math.abs(depth[p]-centre);
        const alpha=distance<=half?1:Math.max(0,1-(distance-half)/Math.max(.0001,half*settings.softness*2.5));
        if(alpha<=0)continue;
        const i=p*4,energy=Math.max(0,Math.min(6,Math.floor(gray[p]*7))),colour=PALETTE[energy];
        out.data[i]=settings.recolour?colour[0]:source.data[i];
        out.data[i+1]=settings.recolour?colour[1]:source.data[i+1];
        out.data[i+2]=settings.recolour?colour[2]:source.data[i+2];
        out.data[i+3]=Math.round(source.data[i+3]*alpha);
      }
      lx.putImageData(out,0,0);bands.push(layer);
    }
  }

  function load(source=DEFAULT_SOURCE){
    if(!mount())return;
    ready=false;setStatus('ANALYSING STREET DEPTH',false);
    image=new Image();image.crossOrigin='anonymous';
    image.onload=()=>{try{buildBands();ready=true;constrainTargetView();setStatus('7-LAYER DEPTH RESOLVED');}catch(error){console.error('HeuristicRangefinder:',error);}};
    image.onerror=()=>setStatus('IMAGE COULD NOT LOAD',false);
    image.src=source;
  }

  function focalLength(){return Math.min(W,H)*CHAMBER.focal;}
  function chamberGeometry(){
    const focal=focalLength();
    return {focal,halfWidth:snapCell((W*.5)*CHAMBER.near/focal)+CHAMBER.wallShiftCells*CHAMBER.cell,halfHeight:snapCell((H*.5)*CHAMBER.near/focal)};
  }
  function apertureAt(z){
    const {focal,halfWidth,halfHeight}=chamberGeometry();
    const width=halfWidth*2*focal/z,height=halfHeight*2*focal/z;
    return {left:W*.5-width*.5,top:H*.5-height*.5,width,height,right:W*.5+width*.5,bottom:H*.5+height*.5};
  }
  function planeDepthForBand(index){
    const t=index/Math.max(1,BAND_COUNT-1);
    return baseDepth()-(baseDepth()-frontDepth())*t;
  }
  function coverSize(aperture,magnification){
    const aspect=image.naturalWidth/image.naturalHeight;
    let width=aperture.width*magnification,height=width/aspect;
    if(height<aperture.height*magnification){height=aperture.height*magnification;width=height*aspect;}
    return {width,height};
  }
  function boundedFrontRect(aperture,width,height,x,y){
    return {x:clamp(x,aperture.right-width,aperture.left),y:clamp(y,aperture.bottom-height,aperture.top),width,height,aperture};
  }
  function frontRect(useTargets=false){
    const aperture=apertureAt(frontDepth()),mag=useTargets?targetZoom:zoom,point=useTargets?targetInspection:inspection,pan=useTargets?targetLook:look;
    const size=coverSize(aperture,mag);
    return boundedFrontRect(aperture,size.width,size.height,W*.5-point.u*size.width+pan.x,H*.5-point.v*size.height+pan.y);
  }
  function depthRect(z,index,useTargets=false){
    const aperture=apertureAt(z),mag=useTargets?targetZoom:zoom,point=useTargets?targetInspection:inspection;
    const size=coverSize(aperture,mag),front=frontRect(useTargets),weight=FOLLOW_WEIGHTS[index]??FOLLOW_WEIGHTS.at(-1);
    const frontCentreX=front.x+front.width*.5,frontCentreY=front.y+front.height*.5;
    const desiredX=(front.x+point.u*front.width)-point.u*size.width;
    const desiredY=(front.y+point.v*front.height)-point.v*size.height;
    const neutralX=W*.5-size.width*.5,neutralY=H*.5-size.height*.5;
    const rawX=neutralX+(desiredX-neutralX)*weight;
    const rawY=neutralY+(desiredY-neutralY)*weight;
    const driftX=clamp(rawX-neutralX,-MAX_DEPTH_DRIFT,MAX_DEPTH_DRIFT);
    const driftY=clamp(rawY-neutralY,-MAX_DEPTH_DRIFT,MAX_DEPTH_DRIFT);
    return {x:neutralX+driftX,y:neutralY+driftY,width:size.width,height:size.height,aperture,frontCentreX,frontCentreY};
  }
  function constrainTargetView(){
    if(!ready||!image||!W||!H)return;
    const aperture=apertureAt(frontDepth());targetZoom=clamp(targetZoom,1,3.5);
    const size=coverSize(aperture,targetZoom);
    const bounded=boundedFrontRect(aperture,size.width,size.height,W*.5-targetInspection.u*size.width+targetLook.x,H*.5-targetInspection.v*size.height+targetLook.y);
    targetLook.x=bounded.x-(W*.5-targetInspection.u*size.width);
    targetLook.y=bounded.y-(H*.5-targetInspection.v*size.height);
  }

  function drawPlane(source,z,index,alpha){
    const r=depthRect(z,index);
    ctx.save();ctx.beginPath();ctx.rect(r.aperture.left,r.aperture.top,r.aperture.width,r.aperture.height);ctx.clip();ctx.globalAlpha=alpha;
    ctx.drawImage(source,r.x,r.y,r.width,r.height);ctx.restore();
  }
  function drawReticle(){
    const a=apertureAt(frontDepth()),x=W/2,y=H/2;if(x<a.left||x>a.right||y<a.top||y>a.bottom)return;
    ctx.save();ctx.strokeStyle='rgba(255,92,78,.88)';ctx.fillStyle='rgba(255,92,78,.9)';
    ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-18,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+18,y);ctx.moveTo(x,y-18);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+18);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function draw(){
    if(!active||!canvas){raf=0;return;}
    constrainTargetView();
    look.x+=(targetLook.x-look.x)*.12;look.y+=(targetLook.y-look.y)*.12;
    inspection.u+=(targetInspection.u-inspection.u)*.12;inspection.v+=(targetInspection.v-inspection.v)*.12;
    zoom+=(targetZoom-zoom)*.12;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    if(ready){
      if(settings.showBase)drawPlane(baseCanvas,baseDepth(),0,.08);
      for(let index=0;index<bands.length;index++){
        const focused=Math.max(0,1-Math.abs(index-settings.focus)/3.2);
        drawPlane(bands[index],planeDepthForBand(index),index,.16+focused*.68);
      }
    }
    drawReticle();raf=requestAnimationFrame(draw);
  }

  function pointToImage(x,y){
    if(!ready)return null;const r=frontRect();
    if(x<r.aperture.left||x>r.aperture.right||y<r.aperture.top||y>r.aperture.bottom)return null;
    const u=(x-r.x)/r.width,v=(y-r.y)/r.height;return u>=0&&u<=1&&v>=0&&v<=1?{u,v}:null;
  }
  function pointerDistance(){const p=[...pointers.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  function pointerDown(event){
    if(!active||event.button>0)return;event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});hitSurface.setPointerCapture?.(event.pointerId);dragDistance=0;
    if(pointers.size===1){lastX=event.clientX;lastY=event.clientY;}
    if(pointers.size===2){pinchDistance=pointerDistance();pinchZoom=targetZoom;}
    hitSurface.classList.add('is-dragging');
  }
  function pointerMove(event){
    if(!active||!pointers.has(event.pointerId))return;event.preventDefault();const previous=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>=2){const distance=pointerDistance();if(pinchDistance>0)targetZoom=clamp(pinchZoom*(distance/pinchDistance),1,3.5);constrainTargetView();setStatus(`MAGNIFICATION ${targetZoom.toFixed(2)}×`);return;}
    const dx=event.clientX-lastX,dy=event.clientY-lastY;dragDistance+=Math.hypot(event.clientX-previous.x,event.clientY-previous.y);targetLook.x+=dx;targetLook.y+=dy;constrainTargetView();lastX=event.clientX;lastY=event.clientY;
  }
  function pointerUp(event){
    if(!active||!pointers.has(event.pointerId))return;event.preventDefault();const wasSingle=pointers.size===1;pointers.delete(event.pointerId);hitSurface.releasePointerCapture?.(event.pointerId);
    if(!pointers.size)hitSurface.classList.remove('is-dragging');
    if(pointers.size===1){const remaining=[...pointers.values()][0];lastX=remaining.x;lastY=remaining.y;}
    if(wasSingle&&dragDistance<10){const point=pointToImage(event.clientX,event.clientY);if(point){targetInspection=point;setStatus(`CONVERGING ${Math.round(point.u*100)} / ${Math.round(point.v*100)}`);}}
  }
  function wheel(event){
    if(!active)return;event.preventDefault();event.stopPropagation();targetZoom=clamp(targetZoom*Math.exp(-event.deltaY*.0015),1,3.5);constrainTargetView();setStatus(`MAGNIFICATION ${targetZoom.toFixed(2)}×`);
  }

  function setButtonState(){const control=button();if(control){control.setAttribute('aria-pressed',String(active));control.textContent=active?'Range On':'Range Off';}}
  function enable(source){if(!mount())return;if(source||!image)load(source||DEFAULT_SOURCE);active=true;document.documentElement.classList.add(ROOT_CLASS);setButtonState();LayeredChamber.refresh();if(!raf)raf=requestAnimationFrame(draw);}
  function disable(){active=false;pointers.clear();document.documentElement.classList.remove(ROOT_CLASS);setButtonState();if(raf)cancelAnimationFrame(raf);raf=0;if(ctx)ctx.clearRect(0,0,W,H);}
  function toggle(){active?disable():enable();}
  function configure(options={}){Object.assign(settings,options);if(Number.isFinite(options.zoom)){targetZoom=clamp(options.zoom,1,3.5);zoom=targetZoom;}constrainTargetView();if(ready&&('softness'in options||'recolour'in options))buildBands();}

  document.addEventListener('click',event=>{if(event.target.closest('#heuristic-rangefinder-toggle'))toggle();});
  return {enable,disable,toggle,load,configure,settings};
})();