"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("js/chamber-motion-presentation.js", "utf8");

class Context2D { setTransform(){} clearRect(){} save(){} restore(){} drawImage(){} beginPath(){} moveTo(){} lineTo(){} closePath(){} fill(){} stroke(){} clip(){} }
class Element {
  constructor(tag="div") { this.tagName=tag.toUpperCase(); this.style={}; this.dataset={}; this.children=[]; this.parentElement=null; this.isConnected=true; this.hidden=false; this.width=800; this.height=600; this.appendCount=0; this.failOnAppend=0; }
  append(child){this.appendCount+=1;if(this.failOnAppend===this.appendCount)throw new Error("canvas append failure");child.parentElement=this;child.isConnected=true;this.children.push(child);}
  remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(item=>item!==this);}
  setAttribute(){}
  getBoundingClientRect(){return {left:0,top:0,width:800,height:600,right:800,bottom:600};}
}
class Canvas extends Element { constructor(context=true){super("canvas");this.context=context?new Context2D():null;} getContext(){return this.context;} }

async function runFailure(stage) {
  const surface=new Element();
  const original=new Canvas(); original.dataset.ncnChamberMotionCanvas="production"; surface.append(original);
  if(stage==="canvas-append-second")surface.failOnAppend=surface.appendCount+2;
  let createdCanvases=0;
  const document={
    documentElement:{dataset:{}},
    createElement(tag){
      if(tag!=="canvas")return new Element(tag);
      createdCanvases+=1;
      return new Canvas(!(stage==="canvas-context"&&createdCanvases===2));
    },
    querySelector(selector){
      if(selector===".ncn-environment-layer--chamber-motion")return surface;
      if(selector==="canvas[data-ncn-chamber-motion-canvas='production']")return original;
      if(selector===".ncn-department-weather-near")return null;
      return null;
    }
  };
  const motionListeners=new Map();
  const motion={
    getActiveGeometry:()=>[],
    addEventListener(type,listener){const values=motionListeners.get(type)||[];values.push(listener);motionListeners.set(type,values);},
    removeEventListener(type,listener){motionListeners.set(type,(motionListeners.get(type)||[]).filter(value=>value!==listener));}
  };
  let weatherSubscribers=0;
  const weather={
    getDepthFrame:()=>null,
    snapshot:()=>({enabled:false,suspended:false,destroyed:false}),
    subscribeAfterRender(){
      if(stage==="weather-subscribe")throw new Error("weather subscribe failure");
      weatherSubscribers+=1;
      let active=true;
      const unsubscribe=()=>{if(!active)return false;active=false;weatherSubscribers-=1;return true;};
      unsubscribe.active=()=>active;
      return unsubscribe;
    }
  };
  const tasks=new Set();
  const runtime={register(){
    if(stage==="runtime-register")throw new Error("runtime registration failure");
    if(stage==="runtime-register-null")return null;
    const handle={wake(){},unregister(){tasks.delete(handle);},snapshot:()=>({})};tasks.add(handle);return handle;
  }};
  const windowListeners=new Map();
  let addCount=0;
  const window={
    devicePixelRatio:1,innerWidth:800,innerHeight:600,
    NCNApplications:{current:()=>"redwire"},
    NCNIntegratedDepartments:{ready:async()=>true},
    NCNIntegration:{getService:name=>name==="chamber-motion"?motion:name==="weather"?weather:null},
    NCNViewerRuntime:runtime,
    NCNChamberCamera:{snapshot:()=>({width:800,height:600,near:2.5,cell:.5,focalLength:504,project:(x,y,z)=>({x:400+x*504/z,y:300-y*504/z})})},
    addEventListener(type,listener){
      addCount+=1;
      if(stage==="window-listener"&&addCount===1)throw new Error("window listener failure");
      const values=windowListeners.get(type)||[];values.push(listener);windowListeners.set(type,values);
    },
    removeEventListener(type,listener){windowListeners.set(type,(windowListeners.get(type)||[]).filter(value=>value!==listener));},
    dispatchEvent(){return true;}
  };
  const context=vm.createContext({window,document,Element,console,performance:{now:()=>1000}});
  vm.runInContext(source,context,{filename:"js/chamber-motion-presentation.js"});
  const result=await window.NCNChamberPresentation.ready();
  assert.equal(result.initialised,false,`${stage}: installation remains uninitialised`);
  assert.equal(result.installationState,"failed",`${stage}: explicit failed state`);
  assert.ok(result.failure,`${stage}: explicit failure reason`);
  assert.deepEqual(surface.children,[original],`${stage}: all mounted canvases roll back`);
  assert.notEqual(original.style.visibility,"hidden",`${stage}: incumbent renderer visibility is restored`);
  assert.equal(tasks.size,0,`${stage}: no runtime task remains`);
  assert.equal(weatherSubscribers,0,`${stage}: no Weather subscriber remains`);
  assert.equal([...motionListeners.values()].reduce((sum,values)=>sum+values.length,0),0,`${stage}: no service listeners remain`);
  assert.equal([...windowListeners.values()].reduce((sum,values)=>sum+values.length,0),0,`${stage}: no window listeners remain`);
}

(async()=>{
  for(const stage of ["canvas-context","canvas-append-second","runtime-register","runtime-register-null","weather-subscribe","window-listener"])await runFailure(stage);
  console.log("PASS: chamber presentation installation is transactional at every acquisition stage");
})().catch(error=>{console.error(error);process.exitCode=1;});
