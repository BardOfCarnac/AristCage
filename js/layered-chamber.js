/* Optional shared-projection layered chamber mode. */
window.LayeredChamber = (()=>{
 const KEY='ncn-layered-chamber'; let enabled=false,bg,fg,b,g,W=0,H=0,DPR=1,raf=0,px=0,py=0;
 const root=document.documentElement, feed=()=>document.querySelector('#feed'), toggle=()=>document.querySelector('#layered-chamber-toggle');
 function canvas(id){const c=document.createElement('canvas');c.id=id;c.className='layered-chamber-canvas';document.body.prepend(c);return c}
 function ensure(){if(bg)return;bg=canvas('layered-chamber-bg');fg=canvas('layered-chamber-fg');b=bg.getContext('2d');g=fg.getContext('2d')}
 function size(){ensure();DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;for(const c of [bg,fg]){c.width=W*DPR;c.height=H*DPR;c.style.width=W+'px';c.style.height=H+'px';c.getContext('2d').setTransform(DPR,0,0,DPR,0,0)}draw()}
 const project=(x,y,z)=>{const f=Math.min(W,H)*.82;return{x:W/2+(x-px)*f/z,y:H*.53-(y-py)*f/z}};
 function line(ctx,a,c,alpha=.24,w=1){const A=project(...a),C=project(...c);ctx.strokeStyle=`rgba(210,35,45,${alpha})`;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(C.x,C.y);ctx.stroke()}
 function rect(ctx,z,a=.25,w=1){const X=3.1,Y=2.35;line(ctx,[-X,-Y,z],[X,-Y,z],a,w);line(ctx,[X,-Y,z],[X,Y,z],a,w);line(ctx,[X,Y,z],[-X,Y,z],a,w);line(ctx,[-X,Y,z],[-X,-Y,z],a,w)}
 function grid(ctx,z0,z1,front=false){const X=3.1,Y=2.35,S=.5;for(let z=z0;z<=z1+.01;z+=S)rect(ctx,z,front?.42:.16);for(let x=-X;x<=X+.01;x+=S){line(ctx,[x,-Y,z0],[x,-Y,z1],front?.34:.18);line(ctx,[x,Y,z0],[x,Y,z1],front?.34:.18)}for(let y=-Y;y<=Y+.01;y+=S){line(ctx,[-X,y,z0],[-X,y,z1],front?.34:.18);line(ctx,[X,y,z0],[X,y,z1],front?.34:.18)}}
 function entries(){return [...(feed()?.querySelectorAll('.entry:not(.panel)')||[])]}
 function applyParallax(){entries().forEach((e,i)=>{const r=e.getBoundingClientRect(),cy=r.top+r.height/2,focus=H*.53,rel=Math.max(-2,Math.min(2,(cy-focus)/Math.max(r.height+14,116)));e.style.setProperty('--lc-front-x',`${(-px*16-rel*1.8).toFixed(2)}px`);e.style.setProperty('--lc-front-y',`${(-py*12).toFixed(2)}px`);e.style.setProperty('--lc-mid-x',`${(-px*8-rel*.8).toFixed(2)}px`);e.style.setProperty('--lc-mid-y',`${(-py*6).toFixed(2)}px`);e.style.setProperty('--lc-back-x',`${(px*7+rel*.7).toFixed(2)}px`);e.style.setProperty('--lc-back-y',`${(py*5).toFixed(2)}px`)})}
 function draw(){raf=0;if(!enabled||!W)return;b.clearRect(0,0,W,H);g.clearRect(0,0,W,H);grid(b,3.2,10.2,false);rect(b,10.2,.48,1.2);grid(g,2.45,3.05,true);applyParallax()}
 function request(){if(enabled&&!raf)raf=requestAnimationFrame(draw)}
 function set(on,persist=true){enabled=on;root.classList.toggle('layered-chamber-mode',on);const t=toggle();if(t){t.setAttribute('aria-pressed',String(on));t.textContent=on?'Chamber On':'Chamber Off'}if(persist)localStorage.setItem(KEY,on?'on':'off');if(on){ensure();size();request()}else{entries().forEach(e=>['--lc-front-x','--lc-front-y','--lc-mid-x','--lc-mid-y','--lc-back-x','--lc-back-y'].forEach(p=>e.style.removeProperty(p)));b?.clearRect(0,0,W,H);g?.clearRect(0,0,W,H)}}
 function pointer(e){if(!enabled)return;px=((e.clientX/W)-.5)*.42;py=((e.clientY/H)-.5)*.32;request()}
 function init(){ensure();toggle()?.addEventListener('click',()=>set(!enabled));addEventListener('resize',size,{passive:true});addEventListener('scroll',request,{passive:true});addEventListener('pointermove',pointer,{passive:true});new MutationObserver(request).observe(feed(),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});set(localStorage.getItem(KEY)==='on',false)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 return{enable:()=>set(true),disable:()=>set(false),isEnabled:()=>enabled,refresh:request};
})();
