"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Gradient { addColorStop() {} }
class Context2D {
  constructor(name){ this.name=name; this.operations=[]; this.globalCompositeOperation="source-over"; this.fillStyle=""; this.strokeStyle=""; this.lineWidth=1; }
  save(){this.operations.push(["save"]);} restore(){this.operations.push(["restore"]);} setTransform(...a){this.operations.push(["setTransform",...a]);}
  clearRect(...a){this.operations.push(["clearRect",...a]);} fillRect(...a){this.operations.push(["fillRect",...a]);}
  beginPath(){this.operations.push(["beginPath"]);} moveTo(...a){this.operations.push(["moveTo",...a]);} lineTo(...a){this.operations.push(["lineTo",...a]);}
  closePath(){this.operations.push(["closePath"]);} rect(...a){this.operations.push(["rect",...a]);} clip(){this.operations.push(["clip"]);}
  fill(){this.operations.push(["fill"]);} stroke(){this.operations.push(["stroke"]);} translate(){} scale(){} roundRect(){}
  createRadialGradient(){return new Gradient();}
}
class Element {
  constructor(){this.children=[];this.style={};this.hidden=false;this.parentElement=null;this.width=0;this.height=0;this.isConnected=true;}
  append(child){child.parentElement=this;this.children.push(child);} remove(){this.isConnected=false;} setAttribute(){}
  getBoundingClientRect(){return {left:0,top:0,width:800,height:600,right:800,bottom:600};}
}
class Canvas extends Element { constructor(){super();this.context=new Context2D("weather");} getContext(){return this.context;} }

const layers=Object.fromEntries(["far","rear","middle","near"].map(key=>[key,new Element()]));
const document={createElement(tag){return tag==="canvas"?new Canvas():new Element();}};
const tasks=new Map();
const runtime={
  register(name,callback,options){const task={name,callback,options,active:true};tasks.set(name,task);return {wake(){task.active=true;},enable(){task.active=true;},disable(){task.active=false;},suspend(){task.active=false;},resume(){task.active=true;},setMaxFps(){},unregister(){tasks.delete(name);}};},
  getQuality(){return "full";}
};
const camera={near:2.5,far:10.5,halfWidth:4.2,finalHalfWidth:4.2,halfHeight:2.55,project(x,y,z){return {x:400+x*504/z,y:300-y*504/z};},apertureAt(){return {left:0,top:0,width:800,height:600,right:800,bottom:600};}};
const presets={
  clear:Object.freeze({mist:0,smoke:0,dust:0,rain:0,haze:0,moisture:0,turbulence:0,drift:0,fallSpeed:0,depthFlow:0,verticalFill:0,bankScale:1,bankMultiplier:1,electrical:0}),
  mist:Object.freeze({mist:.8,smoke:0,dust:0,rain:0,haze:0,moisture:.5,turbulence:.4,drift:.18,fallSpeed:0,depthFlow:-.12,verticalFill:.2,bankScale:1,bankMultiplier:1,electrical:0})
};
const context={
  owner:"weather",
  runtime,
  settings:{quality:"full",reducedMotion:false},
  layers:{weather:layers},
  views:{getReadingZone:()=>null,getControlZones:()=>[],isReading:()=>false},
  chamber:{getCameraSnapshot:()=>camera,project:camera.project.bind(camera)},
  director:{envelope:(_channel,{intensity})=>({allowed:true,intensity,mode:"ambient",reducedMotion:false})},
  integration:{requireService:()=>({play:()=>true})}
};
const window={NCNWeatherPresets:presets,NCNWeatherDepartmentManifest:null};
Object.assign(global,{window,document,innerWidth:800,innerHeight:600,console});
vm.runInThisContext(fs.readFileSync("departments/weather/weather-module.js","utf8"));

(async()=>{
  const service=window.createNCNWeatherDepartment(context);
  await service.init();
  const events=[];
  const invalidationObservations=[];
  const unsubscribe=service.subscribeAfterRender(payload=>{
    events.push(payload);
    if(payload.type==="invalidate")invalidationObservations.push(service.getDepthFrame(payload.token));
  });
  assert.equal(unsubscribe.active(),true);
  service.setPreset("mist");
  service.setIntensity(1);
  service.setEnabled(true);
  const renderTask=[...tasks.values()].find(task=>task.name==="render");
  assert.ok(renderTask,"Weather owns its public render task directly");
  renderTask.callback({frame:40,delta:33,quality:"full",reducedMotion:false});
  renderTask.callback({frame:41,delta:33,quality:"full",reducedMotion:false});
  const rendered=events.filter(event=>event.type==="render").at(-1);
  assert.ok(rendered?.depthFrame,"listener receives the completed immutable depth frame");
  assert.equal(rendered.depthFrame,service.getDepthFrame(rendered.token));
  assert.equal(service.afterRenderContract.timing,"synchronous-after-completed-weather-canvas-render");
  assert.equal(service.afterRenderContract.invalidation,"synchronous-immediately-after-current-depth-frame-inert");
  assert.ok(layers.near.children[0].context.operations.length>0,"callback follows real canvas work");

  const target=new Context2D("foreground");
  const regions=[
    {nearerThan:99,polygons:[[{x:0,y:0},{x:800,y:0},{x:800,y:600},{x:0,y:600}]]},
    {nearerThan:99,polygons:[[{x:200,y:0},{x:800,y:0},{x:800,y:600},{x:200,y:600}]]}
  ];
  assert.ok(rendered.depthFrame.puffCount > 0, `expected puffs, got ${rendered.depthFrame.puffCount}`);
  const count=rendered.depthFrame.renderForeground(target,{regions,viewport:{left:0,top:0,width:800,height:600},includeAttenuation:false});
  assert.ok(count>0,"foreground regions render qualifying puffs");
  assert.ok(count<=rendered.depthFrame.puffCount,"overlapping regions never multiply the reported puff count");
  assert.equal(target.operations.filter(op=>op[0]==="clip").length>=count,true,"each puff receives one combined region clip");

  service.suspend();
  const invalidation=events.find(event=>event.type==="invalidate"&&event.reason==="weather-suspended");
  assert.ok(invalidation,"suspension synchronously invalidates the published frame");
  assert.strictEqual(invalidationObservations.at(-1),null,"invalidation is delivered immediately after the old handle becomes inert");
  assert.equal(service.getDepthFrame(invalidation.token),null,"the invalidated token is no longer current");
  assert.equal(unsubscribe.active(),false,"Weather clears subscribers on suspension");
  assert.equal(rendered.depthFrame.renderForeground(new Context2D("stale"),{nearerThan:99}),0,"stale handles cannot render");

  service.resume();
  const second=[];
  const unsubscribe2=service.subscribeAfterRender(payload=>second.push(payload));
  renderTask.callback({frame:42,delta:33,quality:"full",reducedMotion:false});
  assert.ok(second.some(event=>event.type==="render"),"consumers can resubscribe after resume");
  service.reset();
  assert.equal(unsubscribe2.active(),false,"reset clears frame subscribers");
  service.destroy("test");
  console.log("PASS: Weather-owned synchronous frame contract and seam-free region renderer");
})().catch(error=>{console.error(error);process.exitCode=1;});
