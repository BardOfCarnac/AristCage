"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
let releaseReady;
const ready = new Promise(resolve => { releaseReady = resolve; });
class Element { constructor(){this.style={};this.dataset={};this.children=[];this.isConnected=true;this.hidden=false;} append(c){this.children.push(c);c.isConnected=true;} remove(){this.isConnected=false;} setAttribute(){} getContext(){return {setTransform(){},clearRect(){},save(){},restore(){},drawImage(){}};} }
const surface = new Element();
const original = new Element(); original.dataset.ncnChamberMotionCanvas="production";
const document={documentElement:{dataset:{}},createElement:()=>new Element(),querySelector(selector){if(selector===".ncn-environment-layer--chamber-motion")return surface;if(selector==="canvas[data-ncn-chamber-motion-canvas='production']")return original;return null;}};
const windowTarget=new EventTarget();
Object.assign(windowTarget,{NCNIntegratedDepartments:{ready:()=>ready},NCNIntegration:{getService:()=>null},NCNViewerRuntime:{register(){throw new Error("must not register after destroy");}},addEventListener:windowTarget.addEventListener.bind(windowTarget),removeEventListener:windowTarget.removeEventListener.bind(windowTarget)});
global.window=windowTarget;global.document=document;global.Element=Element;global.console=console;
vm.runInThisContext(fs.readFileSync("js/chamber-motion-presentation.js","utf8"));
assert.equal(windowTarget.NCNChamberPresentation.destroy("race"),true);
releaseReady(true);
windowTarget.NCNChamberPresentation.ready().then(state=>{
  assert.equal(state.destroyed,true);
  assert.equal(surface.children.length,0);
  assert.equal(original.style.visibility,undefined);
  console.log("PASS: destroy during department readiness cannot remount chamber presentation");
}).catch(error=>{console.error(error);process.exitCode=1;});
