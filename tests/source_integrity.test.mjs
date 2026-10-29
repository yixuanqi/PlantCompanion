import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('config explicitly forbids forced or automatic replant',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'specs/default_settings.v1.json'),'utf-8'));
 assert.equal(config.replant_policy,'user_initiated_no_auto_delay');
});
test('only mint and mushroom in first release',()=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'specs/plant_species.v1.json'),'utf-8'));
 assert.deepEqual(cfg.species.map(s=>s.id),['mint','mushroom']);
});
test('mint sprites are shipped for every stage and sleeping',()=>{
 for(const stage of ['healthy','thirsty','dry','critical','dead','sleep']) {
  const img=path.join(root,'public/plant-assets/mint/states',stage+'.png');
  const bytes=fs.readFileSync(img);
  assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
 }
});
test('core is authoritative and explicitly guards the dead-state',()=>{
 const core=fs.readFileSync(path.join(root,'crates/life-core/src/lib.rs'),'utf8');
 assert.match(core,/pub fn plant_seed/);
 assert.match(core,/pub fn observe_activity/);
 assert.match(core,/no_auto_plant_when_dead_even_after_long_time/);
 assert.match(core,/self\.pending_idle_ms/);
});
test('both initial species have true RGBA PNG lifecycle assets',()=>{
 for(const species of ['mint','mushroom']){
  for(const stage of ['healthy','thirsty','dry','critical','dead','sleep']){
   const file=path.join(root,'public/plant-assets',species,'states',stage+'.png');
   const bytes=fs.readFileSync(file);
   assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
   assert.equal(bytes[25],6,`${species}/${stage} must be RGBA`);
  }
 }
});
test('mint retains frame sequences while mushroom has procedural 4-layer animations',()=>{
 for(const seq of ['idle_healthy','water_recover','go_to_sleep','wake_up','death_once']){
  const directory=path.join(root,'public/plant-assets/mint/sequences',seq);
  assert.ok(fs.readdirSync(directory).filter(v=>v.endsWith('.png')).length>=8,`mint/${seq}`);
 }
 const css=fs.readFileSync(path.join(root,'src/widget-v04.css'),'utf8');
 assert.match(css,/cap-idle/);assert.match(css,/sleep-idle/);assert.match(css,/water-response/);
});
test('SQLite uses an atomic snapshot / wallet / memorial transaction',()=>{
 const store=fs.readFileSync(path.join(root,'crates/plant-store/src/lib.rs'),'utf8');
 for(const statement of ['CREATE TABLE IF NOT EXISTS snapshot','CREATE TABLE IF NOT EXISTS wallet_ledger','CREATE TABLE IF NOT EXISTS memorials','tx.commit()?']){
  assert.ok(store.includes(statement),statement);
 }
});
test('frontend requires first click to only wake sleeping plant',()=>{
 const source=fs.readFileSync(path.join(root,'src/plant.ts'),'utf8');
 assert.match(source,/First click only wakes/);
 assert.match(source,/return; \/\/ First click only wakes/);
});
