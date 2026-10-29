import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const stages=['healthy','thirsty','dry','critical','dead','sleep'];
const parts=['pot','stalk','cap','foliage'];

test('one canonical mushroom asset path: new native layers for ALL six states',()=>{
 for(const stage of stages){
  for(const part of parts){
   const filename=path.join(root,'public/plant-assets/mushroom',stage,part+'.png');
   const bytes=fs.readFileSync(filename);
   assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
   assert.equal(bytes[25],6,'RGBA required');
   assert.equal(bytes.readUInt32BE(16),694);
   assert.equal(bytes.readUInt32BE(20),736);
  }
  const state=fs.readFileSync(path.join(root,'public/plant-assets/mushroom/states',stage+'.png'));
  assert.equal(state[25],6);
 }
 assert.equal(fs.existsSync(path.join(root,'public/plant-assets/mushroom_v2')),false);
 assert.equal(fs.existsSync(path.join(root,'assets/species/mushroom_v2')),false);
});

test('unchanging ceramic pot across all states',()=>{
 const origin=fs.readFileSync(path.join(root,'public/plant-assets/mushroom/healthy/pot.png'));
 for(const stage of stages){assert.deepEqual(fs.readFileSync(path.join(root,'public/plant-assets/mushroom',stage,'pot.png')),origin);}
});

test('no old-art switch or status bar, only one art loader',()=>{
 for(const file of ['src/plant.ts','browser_preview/src/plant.js','index.html','browser_preview/index.html']){
  const text=read(file);
  assert.doesNotMatch(text,/mushroom_v2|menu-art-version|mushroomV2Enabled|legacy|id="stage-pill"|class="pillrow"|id="more"|id="drag-handle"/);
 }
 assert.match(read('src/plant.ts'),/plant-assets\/mushroom\/\$\{stage\}\/\$\{name\}\.png/);
 assert.match(read('index.html'),/id="status-tip"/);
 assert.match(read('src/plant.ts'),/mouseenter/);
});

test('preview bundle and native bundle share exact canonical assets',()=>{
 for(const stage of stages){
  for(const part of parts){
   const relative=`plant-assets/mushroom/${stage}/${part}.png`;
   assert.deepEqual(fs.readFileSync(path.join(root,'public',relative)),fs.readFileSync(path.join(root,'browser_preview',relative)));
  }
 }
 assert.equal(read('src/widget-v04.css'),read('browser_preview/src/widget-v04.css'));
});

test('Tauri stays transparent and keeps default capability',()=>{
 const cfg=JSON.parse(read('src-tauri/tauri.conf.json'));
 const cap=JSON.parse(read('src-tauri/capabilities/default.json'));
 const win=cfg.app.windows.find(w=>w.label==='plant');
 assert.equal(cap.identifier,'default');
 assert.ok(cfg.app.security.capabilities.includes('default'));
 assert.equal(win.shadow,false);assert.equal(win.transparent,true);assert.equal(win.decorations,false);
});
