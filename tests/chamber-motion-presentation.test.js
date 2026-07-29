"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeContext {
  constructor(name) {
    this.name = name;
    this.operations = [];
    this.globalCompositeOperation = "source-over";
    this.fillStyle = "";
    this.strokeStyle = "";
    this.lineWidth = 1;
  }
  setTransform(...args) { this.operations.push(["setTransform", ...args]); }
  clearRect(...args) { this.operations.push(["clearRect", ...args]); }
  drawImage(...args) { this.operations.push(["drawImage", ...args.map(item => item?.className || item)]); }
  beginPath() { this.operations.push(["beginPath"]); }
  moveTo(...args) { this.operations.push(["moveTo", ...args]); }
  lineTo(...args) { this.operations.push(["lineTo", ...args]); }
  rect(...args) { this.operations.push(["rect", ...args]); }
  clip() { this.operations.push(["clip"]); }
  closePath() { this.operations.push(["closePath"]); }
  fill() { this.operations.push(["fill", this.globalCompositeOperation, this.fillStyle]); }
  stroke() { this.operations.push(["stroke", this.globalCompositeOperation, this.strokeStyle, this.lineWidth]); }
  save() { this.operations.push(["save"]); }
  restore() { this.operations.push(["restore"]); this.globalCompositeOperation = "source-over"; }
}
class FakeElement {
  constructor(tag = "div", className = "") {
    this.tagName = tag.toUpperCase(); this.className = className; this.children = []; this.dataset = {}; this.style = {};
    this.hidden = false; this.isConnected = true; this.parentElement = null; this.width = 800; this.height = 600;
  }
  append(child) { child.parentElement = this; child.isConnected = true; this.children.push(child); }
  remove() { this.isConnected = false; }
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
}
class FakeCanvas extends FakeElement {
  constructor(className = "") { super("canvas", className); this.context = new FakeContext(className || "canvas"); }
  getContext() { return this.context; }
}
const motionSurface = new FakeElement("div", "ncn-environment-layer--chamber-motion");
const originalCanvas = new FakeCanvas("ncn-chamber-motion-canvas"); originalCanvas.dataset.ncnChamberMotionCanvas = "production"; motionSurface.append(originalCanvas);
const nearLayer = new FakeElement("div", "ncn-environment-layer--weather-near");
const nearCanvas = new FakeCanvas("ncn-department-weather-canvas ncn-department-weather-near"); nearLayer.append(nearCanvas);
const documentElement = { dataset: {} };
const document = {
  documentElement,
  createElement(tag) { return tag === "canvas" ? new FakeCanvas() : new FakeElement(tag); },
  querySelector(selector) {
    if (selector === ".ncn-environment-layer--chamber-motion") return motionSurface;
    if (selector === "canvas[data-ncn-chamber-motion-canvas='production']") return originalCanvas;
    if (selector === ".ncn-department-weather-near") return nearCanvas;
    return null;
  }
};
const camera = { width: 800, height: 600, near: 2.5, cell: 0.5, focalLength: 504, project(x,y,z){return {x:400+x*504/z,y:300-y*504/z};} };
let geometry = [{ sequenceId:"s", blockId:"b", phase:"travelling-out", pose:{ centre:[-1.1,-1.7,5.2], basis:{u:[0,0,1],v:[0,1,0],n:[1,0,0]}, size:.5, thickness:.5, localCell:[0,0], clusterCells:[[0,0]] } }];
const listeners = new Map();
const motion = { getActiveGeometry:()=>geometry, addEventListener(t,l){const a=listeners.get(t)||[];a.push(l);listeners.set(t,a);}, removeEventListener(){} };
let weatherListener = null;
let foregroundCalls = 0;
const depthFrame = { token:"depth-1", frameNumber:1, renderForeground(ctx, options){ foregroundCalls += 1; ctx.operations.push(["renderForeground", options.nearerThan]); return 2; } };
const weather = { getDepthFrame:()=>depthFrame, subscribeAfterRender(listener){ weatherListener=listener; return ()=>{weatherListener=null;}; } };
const tasks = new Map();
const runtime = { register(name, callback, options){ const task={name,callback,options}; tasks.set(name,task); return {wake(){},unregister(){tasks.delete(name);},snapshot:()=>({name,group:options.group,priority:options.priority,maxFps:options.maxFps})}; } };
const windowTarget = new EventTarget();
Object.assign(windowTarget,{ devicePixelRatio:1, innerWidth:800, innerHeight:600, NCNChamberCamera:{snapshot:()=>camera}, NCNViewerRuntime:runtime,
 NCNIntegratedDepartments:{ready:async()=>true}, NCNIntegration:{getService:name=>name==="chamber-motion"?motion:name==="weather"?weather:null},
 addEventListener:windowTarget.addEventListener.bind(windowTarget), removeEventListener:windowTarget.removeEventListener.bind(windowTarget), dispatchEvent:windowTarget.dispatchEvent.bind(windowTarget)});
global.window=windowTarget; global.document=document; global.Element=FakeElement; global.console=console;
vm.runInThisContext(fs.readFileSync("js/chamber-motion-presentation.js","utf8"));
(async()=>{
 await windowTarget.NCNChamberPresentation.ready();
 assert.equal(tasks.size,1);
 assert.equal(originalCanvas.style.visibility,"hidden");
 [...tasks.values()][0].callback({now:1000,delta:33});
 weatherListener({depthFrame});
 const wall=motionSurface.children.find(c=>c.dataset.ncnChamberMotionCanvas==="wall-matched");
 const fg=motionSurface.children.find(c=>c.dataset.ncnChamberMotionCanvas==="foreground-mist");
 assert.ok(wall && fg);
 assert.ok(wall.context.operations.some(op=>op[0]==="fill"&&op[2]==="rgba(0,0,0,1)"));
 assert.ok(wall.context.operations.some(op=>op[0]==="stroke"&&op[1]==="lighter"));
 assert.ok(nearCanvas.context.operations.some(op=>op[0]==="fill"&&op[1]==="destination-out"));
 assert.ok(foregroundCalls>0);
 assert.equal(windowTarget.NCNChamberPresentation.snapshot().weatherSynchronized,true);
 geometry=[];
 [...tasks.values()][0].callback({now:1033,delta:33});
 assert.equal(wall.hidden,true);
 assert.equal(windowTarget.NCNChamberPresentation.destroy("test"),true);
 assert.equal(originalCanvas.style.visibility,"");
 assert.equal(tasks.size,0);
 console.log("PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
