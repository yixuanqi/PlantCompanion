import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Browser-preview mock tests: deliberately not a substitute for Rust tests.
class LocalStorage {
 constructor(){this.map=new Map()}
 getItem(k){return this.map.get(k)??null}
 setItem(k,v){this.map.set(k,v)}
}
globalThis.window=new EventTarget();
globalThis.localStorage=new LocalStorage();
const {call,demoAdvance}=await import(pathToFileURL(path.resolve(import.meta.dirname,'../browser_preview/src/bridge.js')).href);
test('preview: a dead plant remains until user explicitly replants',async()=>{
 await call('plant_seed',{species:'mint'});
 const first=(await call('get_snapshot')).current.instance_id;
 demoAdvance(65*60_000);
 let game=await call('get_snapshot');
 assert.equal(game.current.stage,'dead');
 demoAdvance(60*60_000);
 game=await call('get_snapshot');
 assert.equal(game.current.stage,'dead');
 assert.equal(game.current.instance_id,first);
 assert.equal(game.memorials.length,0);
 await call('plant_seed',{species:'mint'});
 game=await call('get_snapshot');
 assert.notEqual(game.current.instance_id,first);
 assert.equal(game.memorials.length,1);
 assert.equal(game.memorials[0].stage,'dead');
});
test('preview: manual sleep freezes progress',async()=>{
 const before=(await call('get_snapshot')).current.active_elapsed_ms;
 await call('enter_manual_sleep');
 demoAdvance(800*60_000);
 assert.equal((await call('get_snapshot')).current.active_elapsed_ms,before);
 await call('exit_manual_sleep');
 demoAdvance(45*60_000);
 assert.equal((await call('get_snapshot')).current.stage,'dry');
});
test('preview: a live plant cannot be replaced',async()=>{
 await assert.rejects(call('plant_seed',{species:'mint'}),/current|alive|陪着/);
});
test('preview: request idempotency and per-generation click cooldown', async()=>{
  const id='water-demo-unique';
  const [g1,result1]=await call('confirm_drink',{requestId:id});
  assert.match(result1,/Accepted/);
  const [g2,result2]=await call('confirm_drink',{requestId:id});
  assert.equal(result2,'Duplicate');
  assert.equal(g2.current.drink_count,g1.current.drink_count);
  demoAdvance(65*60_000);
  assert.equal((await call('get_snapshot')).current.stage,'dead');
  await call('plant_seed',{species:'mint',requestId:'new-generational-seed'});
  const [g3,result3]=await call('confirm_drink',{requestId:'first-on-new-generation'});
  assert.match(result3,/Accepted/);
  assert.equal(g3.current.drink_count,1);
  await call('plant_seed',{species:'mint',requestId:'new-generational-seed'});
  assert.equal((await call('get_snapshot')).current.generation,g3.current.generation);
});

test('preview: resting one hour does not advance active time',async()=>{
 const before=(await call('get_snapshot')).current.active_elapsed_ms;
 await call('snooze_one_hour');
 demoAdvance(300*60_000);
 assert.equal((await call('get_snapshot')).current.active_elapsed_ms,before);
 await call('exit_manual_sleep');
});
