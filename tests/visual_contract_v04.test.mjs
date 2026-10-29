import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('compact widget dimensions matched by Tauri and CSS',()=>{
 const cfg=JSON.parse(read('src-tauri/tauri.conf.json'));
 const win=cfg.app.windows.find(w=>w.label==='plant');
 assert.deepEqual([win.width,win.height],[268,292]);
 const css=read('src/widget-v04.css');
 assert.match(css,/\.widget\{[\s\S]*?width:268px;height:292px/);
 assert.match(css,/body\.plant-body\{[\s\S]*?width:268px;height:292px/);
 assert.match(read('src-tauri/src/widget_view.rs'),/win\.outer_size\(\)/);
});

test('no always-visible bottom pill, status only on hover',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/pillrow|stage-pill|drag-handle|id="more"/);
 assert.match(html,/id="status-tip"/);
 const css=read('src/widget-v04.css');
 assert.doesNotMatch(css,/\.pillrow|\.soft-pill/);
 assert.match(css,/\.status-tip/);
});

test('mushroom moves locally; pot stays static and no raster frame switching',()=>{
 const css=read('src/widget-v04.css');
 assert.match(css,/\.layer-pot\{z-index:1;animation:none!important;transform:none!important/);
 assert.match(css,/\.layer-top\{animation:water-response/);
 assert.match(css,/\.layer-stem\{animation:stalk-idle/);
 assert.match(read('src/plant.ts'),/visualKey!==newVisualKey/);
 assert.doesNotMatch(read('src/plant.ts'),/setInterval\(|sprite\.classList/);
});

test('only current mushroom source survives; browser preview is aligned',()=>{
 assert.equal(fs.existsSync(path.join(root,'public/plant-assets/mushroom_v2')),false);
 assert.ok(fs.existsSync(path.join(root,'assets/species/mushroom/source/mushroom_healthy.svg')));
 for(const page of ['index.html','browser_preview/index.html'])assert.match(read(page),/widget-v04\.css/);
 assert.match(read('src/plant.ts'),/First click only wakes/);
});
