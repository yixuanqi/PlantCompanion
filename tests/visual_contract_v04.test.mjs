import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('v0.4 native window and transparent widget CSS use the same geometry',()=>{
 const cfg=JSON.parse(read('src-tauri/tauri.conf.json'));
 const win=cfg.app.windows.find(w=>w.label==='plant');
 assert.equal(win.width,300);assert.equal(win.height,336);
 assert.equal(win.transparent,true);assert.equal(win.decorations,false);
 const css=read('src/widget-v04.css');
 assert.match(css,/\.widget\{position:relative;width:300px;height:336px/);
 assert.match(css,/body\.plant-body\{width:300px;height:336px;background:transparent!important/);
 assert.match(css,/context-menu\{position:absolute;/);
});

test('pot never receives idle or watering animation; only actual plant organs move',()=>{
 const css=read('src/widget-v04.css');
 assert.match(css,/\.layer-pot\{[^}]*animation:none!important/);
 assert.match(css,/\.layer-top\{animation:water-leaf-response/);
 assert.match(css,/\.layer-stem\{animation:stem-local-sway/);
 assert.doesNotMatch(read('src/plant.ts'),/sprite\.classList\.toggle\('idle'/);
});

test('both species have complete aligned motion rigs with transparent PNG assets',()=>{
 const all=['healthy','thirsty','dry','critical','dead','sleep'];
 for(const species of ['mint','mushroom'])for(const stage of all){
  let dims='';
  for(const part of ['pot','stem','crown']){
   const file=path.join(root,'public/plant-assets',species,'motion_layers',stage,part+'.png');
   const bytes=fs.readFileSync(file);
   assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
   assert.equal(bytes[25],6,'asset must be RGBA PNG');
   const size=bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20);
   if(dims)assert.equal(size,dims,'same canvas for every layer');else dims=size;
  }
  assert.equal(dims,'256x256');
 }
});

test('standalone visual lab and preview both load v0.4 widget stylesheet',()=>{
 for(const page of ['index.html','browser_preview/index.html']){
  assert.match(read(page),/widget-v04\.css/);
  assert.match(read(page),/id="plant-layered"/);
 }
 assert.match(read('browser_preview/visual_lab.html'),/动画验证台/);
 assert.match(read('src/plant.ts'),/First click only wakes/);
});
