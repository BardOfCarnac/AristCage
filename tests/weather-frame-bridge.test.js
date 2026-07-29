"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const order=[];
let registered=null;
const originalFactory=context=>{
  context.runtime.register("render", frame=>{order.push("render"); return true;},{group:"environment",priority:20});
  return Object.freeze({
    getDepthFrame:()=>Object.freeze({token:"depth-1",frameNumber:7}),
    destroy:()=>true,
    snapshot:()=>({})
  });
};
const runtime={register(name,callback,options){registered={name,callback,options};return {unregister(){}};}};
const window={createNCNWeatherDepartment:originalFactory,NCNWeatherDepartment:{createWeather:originalFactory}};
global.window=window;global.console=console;
vm.runInThisContext(fs.readFileSync("js/weather-frame-bridge.js","utf8"));
const service=window.createNCNWeatherDepartment({runtime});
let payload=null;
const unsubscribe=service.subscribeAfterRender(value=>{order.push("listener");payload=value;});
assert.equal(registered.callback({frame:12}),true);
assert.deepEqual(order,["render","listener"]);
assert.equal(payload.token,"depth-1");
unsubscribe();
registered.callback({frame:13});
assert.deepEqual(order,["render","listener","render"]);
assert.equal(service.destroy("test"),true);
console.log("PASS");
