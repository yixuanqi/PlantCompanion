import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {clampZoom,clampOpacity,isDrag,wheelNext} from '../src/widget-controls.js';
const root=path.resolve(import.meta.dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('wheel zoom limits: original 100% is maximum, minimum 50%',()=>{
 assert.equal(clampZoom(9),1);assert.equal(clampZoom(-9),.5);
 let z=1;for(let i=0;i<32;i++)z=wheelNext(z,1,100,false).zoom;
 assert.equal(z,.5);
 for(let i=0;i<32;i++)z=wheelNext(z,1,-100,false).zoom;
 assert.equal(z,1);
});
test('Ctrl+wheel only changes plant alpha, with safe bound',()=>{
 let opacity=1;for(let i=0;i<30;i++){
  const next=wheelNext(.65,opacity,120,true);
  assert.equal(next.zoom,.65);
  opacity=next.opacity;
 }
 assert.equal(opacity,.25);
 assert.equal(clampOpacity(1.5),1);
});
test('hold 7px crosses drag threshold; clicks never drag',()=>{
 assert.equal(isDrag(10,10,12,12),false);
 assert.equal(isDrag(10,10,17,10),true);
 assert.equal(isDrag(10,10,11,30),true);
});
test('wheel interaction is scoped to alpha hit-tested plant',()=>{
 const s=read('src/plant.ts');
 assert.match(s,/zone\.addEventListener\('wheel'/);
 assert.match(s,/if\(!onVisiblePlant\(e\)\)return/);
 assert.match(s,/getImageData/);
 assert.match(s,/e\.preventDefault\(\);e\.stopPropagation\(\)/);
 assert.match(s,/e\.ctrlKey/);
 assert.doesNotMatch(s,/window\.addEventListener\('wheel'/);
});
test('click and drag split and native startDragging after threshold',()=>{
 const s=read('src/plant.ts');
 assert.match(s,/if\(!isDrag\(pressed\.x,pressed\.y,e\.clientX,e\.clientY\)\)return/);
 assert.match(s,/startDragging\(\)/);
 assert.match(s,/zone\.addEventListener\('pointerup'/);
 assert.match(s,/if\(!wasDrag&&Date\.now\(\)>=noClickUntil/);
 assert.doesNotMatch(s,/altKey/);
});
test('scaling shrinks real OS window and preferences persist independently',()=>{
 const rust=read('src-tauri/src/widget_view.rs');
 assert.match(rust,/win\.set_size\(LogicalSize::new/);
 assert.match(rust,/win\.set_position\(PhysicalPosition::new/);
 assert.match(read('src-tauri/src/lib.rs'),/widget-view-v1\.json/);
 assert.match(read('src-tauri/src/lib.rs'),/get_widget_view,set_widget_view/);
 assert.match(read('src/widget-interaction.css'),/transform: scale\(var\(--widget-zoom\)\)/);
 const capabilities=JSON.parse(read('src-tauri/capabilities/default.json'));
 assert.equal(capabilities.identifier,'default');
 assert.ok(capabilities.permissions.includes('core:window:allow-start-dragging'));
});
test('preview carries same interaction resources as native',()=>{
 assert.equal(read('browser_preview/src/widget-interaction.css'),read('src/widget-interaction.css'));
 assert.equal(read('browser_preview/src/widget-controls.js'),read('src/widget-controls.js'));
 assert.match(read('browser_preview/index.html'),/widget-interaction\.css/);
});
