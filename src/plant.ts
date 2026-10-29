import {call,subscribe,nameOf,native,type Game,type Species} from './bridge';
import {clampZoom,clampOpacity,isDrag,wheelNext} from './widget-controls.js';

type Motion='watering'|'waking'|'falling';
const el=<T extends HTMLElement>(selector:string)=>document.querySelector(selector) as T;
const layered=el<HTMLDivElement>('#plant-layered');
const pot=el<HTMLImageElement>('#layer-pot');
const stem=el<HTMLImageElement>('#layer-stem');
const crown=el<HTMLImageElement>('#layer-top');
const foliage=el<HTMLImageElement>('#layer-foliage');
const bubble=el<HTMLDivElement>('#bubble');
const tip=el<HTMLDivElement>('#status-tip');
const menu=el<HTMLDivElement>('#context-menu');
const placeholder=el<HTMLDivElement>('#plant-placeholder');
const dew=el<HTMLDivElement>('#dew');
const zone=el<HTMLDivElement>('#plant-zone');
let snapshot:Game|undefined;
let lastStage='';let lastSleep=false;let lastSpecies:Species|undefined;let lastInstance='';
let visualKey='';let bubbleTimer:ReturnType<typeof setTimeout>|undefined;
let motionTimer:ReturnType<typeof setTimeout>|undefined;
let tipTimer:ReturnType<typeof setTimeout>|undefined;
let motionToken=0;let lastAutomaticSpeech:number[]=[];

type Appearance={zoom:number;opacity:number;x?:number|null;y?:number|null};
let appearance:Appearance={zoom:1,opacity:1};
let wheelBuffer=0;let lastWheelCtrl=false;let preferenceTimer:ReturnType<typeof setTimeout>|undefined;
let nativeDragging=false;let noClickUntil=0;
let pressed:{id:number;x:number;y:number}|undefined;
let windowModule:Promise<typeof import('@tauri-apps/api/window')>|undefined;
if(native)windowModule=import('@tauri-apps/api/window');

// Strict hit testing against the visible alpha silhouette, not the sprite's rectangle.
let hitKey='';let hitPixels:Uint8ClampedArray|undefined;let hitWidth=0;let hitHeight=0;
function loadHitMask(species:Species,stage:string){
 const key=`${species}/${stage}`;if(hitKey===key)return;hitKey=key;
 hitPixels=undefined;hitWidth=0;hitHeight=0;
 const img=new Image();img.onload=()=>{
  if(hitKey!==key)return;
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
  ctx.drawImage(img,0,0);hitPixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  hitWidth=canvas.width;hitHeight=canvas.height;
 };img.onerror=()=>console.warn('植物图片未能加载点击蒙版',key);
 img.src=`./plant-assets/${species}/states/${stage}.png`;
}
function onVisiblePlant(e:{clientX:number;clientY:number}):boolean{
 if(!snapshot?.current)return false;
 const rect=zone.getBoundingClientRect();
 if(e.clientX<rect.left||e.clientX>=rect.right||e.clientY<rect.top||e.clientY>=rect.bottom)return false;
 const x=e.clientX-rect.left,y=e.clientY-rect.top;
 if(!hitPixels||!hitWidth||!hitHeight){
  // During the first decode, accept only the central part of the plant.
  return x>rect.width*.15&&x<rect.width*.85&&y>rect.height*.1&&y<rect.height*.93;
 }
 // The runtime layers use object-fit: contain; map pointer to image pixels.
 const scale=Math.min(rect.width/hitWidth,rect.height/hitHeight);
 const offsetX=(rect.width-hitWidth*scale)/2,offsetY=(rect.height-hitHeight*scale)/2;
 const imageX=(x-offsetX)/scale,imageY=(y-offsetY)/scale;
 if(imageX<0||imageY<0||imageX>=hitWidth||imageY>=hitHeight)return false;
 const px=Math.floor(imageX),py=Math.floor(imageY);
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const xx=px+dx,yy=py+dy;
  if(xx>=0&&yy>=0&&xx<hitWidth&&yy<hitHeight&&hitPixels[(yy*hitWidth+xx)*4+3]>=42)return true;
 }
 return false;
}
function applyAppearance(){
 document.documentElement.style.setProperty('--widget-zoom',String(appearance.zoom));
 document.documentElement.style.setProperty('--plant-opacity',String(appearance.opacity));
}
async function initializeAppearance(){
 try{
  if(native){appearance=await call<Appearance>('get_widget_view');}
  else {const saved=localStorage.getItem('plant-preview-appearance-v1');if(saved)appearance=JSON.parse(saved) as Appearance;}
 }catch(error){console.warn('读取外观设置失败，使用默认值',error);}
 appearance.zoom=clampZoom(appearance.zoom);appearance.opacity=clampOpacity(appearance.opacity);
 applyAppearance();
}
function scheduleAppearanceSave(){clearTimeout(preferenceTimer);preferenceTimer=setTimeout(()=>void saveAppearance(),160);}
let saving=false;let needResave=false;
async function saveAppearance(){
 if(saving){needResave=true;return;}saving=true;
 try{
  do{
   needResave=false;const value={zoom:appearance.zoom,opacity:appearance.opacity};
   if(native)await call<Appearance>('set_widget_view',value);
   else localStorage.setItem('plant-preview-appearance-v1',JSON.stringify(appearance));
  }while(needResave);
 }catch(error){console.error('保存外观失败',error);say('调整未保存，请再试一次～');}
 finally{saving=false;}
}


const lines:Record<Species,Record<string,string>>={
 mint:{healthy:'今天的阳光刚刚好～',thirsty:'我的叶子有点软软的啦。',dry:'喝口水吧，我也伸伸叶子～',critical:'我的叶子快垂下来了……',dead:'这片叶子的故事，留在花园里吧。',sleep:'你忙你的，我先眯一会儿～',wake:'你回来啦，我伸个懒腰～',water:'咕噜咕噜！又精神起来啦。'},
 mushroom:{healthy:'我的小伞晒到太阳啦～',thirsty:'伞缘软软的，想歇一下。',dry:'要不要一起咕噜一口水？',critical:'小伞快垂到花盆里啦……',dead:'这朵小伞住进纪念花园啦。',sleep:'让我缩进小伞里一会儿。',wake:'你回来啦，我醒咯～',water:'哇，伞帽又撑起来了！'}
};
const line=(key:string)=>lines[snapshot?.current?.species??'mint'][key]||lines.mint[key]||'';
const conditionOf=(s:Game)=>s.current?(s.current.stage==='dead'?'dead':s.sleep_reasons.length?'sleep':s.current.stage):'';
const partAsset=(species:Species,stage:string,part:'pot'|'stem'|'crown'|'foliage')=>{
 if(species==='mushroom'){
  const name=part==='stem'?'stalk':part==='crown'?'cap':part;
  return `./plant-assets/mushroom/${stage}/${name}.png`;
 }
 return `./plant-assets/mint/motion_layers/${stage}/${part}.png`;
};

function hideTip(){clearTimeout(tipTimer);tip.classList.remove('visible');}
function say(message:string,ms=3800){
 if(!message)return;
 menu.hidden=true;hideTip();
 bubble.textContent=message;bubble.classList.add('visible');
 clearTimeout(bubbleTimer);
 bubbleTimer=setTimeout(()=>bubble.classList.remove('visible'),ms);
}
function sayRare(message:string){
 const now=Date.now();lastAutomaticSpeech=lastAutomaticSpeech.filter(t=>now-t<3600000);
 if(lastAutomaticSpeech.length>=2)return;lastAutomaticSpeech.push(now);say(message);
}
function stopMotion(){motionToken++;clearTimeout(motionTimer);layered.classList.remove('watering','waking','falling');}
function motion(name:Motion,ms:number){
 stopMotion();const token=motionToken;void layered.offsetWidth;layered.classList.add(name);
 motionTimer=setTimeout(()=>{if(token===motionToken)layered.classList.remove(name);},ms);
}
function animateDroplet(){dew.classList.remove('drop');void dew.offsetWidth;dew.classList.add('drop');}
function render(s:Game){
 snapshot=s;
 const p=s.current;const cond=conditionOf(s);const sleeping=s.sleep_reasons.length>0;
 const switched=!!p && (p.instance_id!==lastInstance || p.species!==lastSpecies);
 placeholder.style.display=p?'none':'flex';
 if(!p){
  layered.hidden=true;visualKey='';stopMotion();tip.textContent='尚未种植 · 在托盘打开种子铺';
  lastStage='';lastSleep=false;lastSpecies=undefined;lastInstance='';return;
 }
 layered.hidden=false;
 // Do not set .src on every native heartbeat: it forces image reload and causes flicker.
 const newVisualKey=`${p.species}/${cond}`;
 if(visualKey!==newVisualKey){
  layered.dataset.species=p.species;layered.dataset.stage=cond;
  pot.src=partAsset(p.species,cond,'pot');
  stem.src=partAsset(p.species,cond,'stem');
  crown.src=partAsset(p.species,cond,'crown');
  if(p.species==='mushroom'){
   foliage.src=partAsset(p.species,cond,'foliage');foliage.hidden=false;
  }else{foliage.hidden=true;foliage.removeAttribute('src');}
  visualKey=newVisualKey;
  loadHitMask(p.species,cond);
 }
 const stageLabels:Record<string,string>={healthy:'精神满满',thirsty:'有一点点渴',dry:'该喝水啦',critical:'快蔫掉了',dead:'已枯萎',sleep:'正在休息'};
 const remaining=Math.max(0,Math.ceil((p.cycle_reminder_ms-p.active_elapsed_ms)/60000));
 tip.textContent=cond==='dead'?'这一株已枯萎 · 右键打开种子铺':cond==='sleep'?'正在睡觉 · 倒计时已暂停':`${stageLabels[cond]} · 还有 ${remaining} 分钟`;
 if(!switched&&lastStage&&lastStage!==p.stage){
  if(p.stage==='dead'){stopMotion();say(line('dead'),5200);}
  else sayRare(line(p.stage));
 }
 if(!switched&&lastSleep!==sleeping&&p.stage!=='dead'){
  say(sleeping?line('sleep'):line('wake'));
  motion(sleeping?'falling':'waking',950);
 }
 if(switched){stopMotion();bubble.classList.remove('visible');hideTip();}
 lastStage=p.stage;lastSleep=sleeping;lastSpecies=p.species;lastInstance=p.instance_id;
}
async function refresh(){try{const initial=await call<Game>('get_snapshot');if(!snapshot)render(initial);}catch(error){console.error(error);say('暂时读不到花园状态。');}}
async function openSettings(){
 if(native){
  const {getAllWindows}=await import('@tauri-apps/api/window');
  const w=(await getAllWindows()).find(w=>w.label==='settings');await w?.show();await w?.setFocus();
 }else window.open('settings.html','_blank');
}
async function water(){
 if(!snapshot?.current){say('先挑一颗种子吧～');void openSettings();return;}
 if(snapshot.current.stage==='dead'){say('它已经住进纪念花园啦。');void openSettings();return;}
 if(snapshot.sleep_reasons.length){
  if(snapshot.sleep_reasons.includes('manual')){
   try{
    const next=await call<Game>('exit_manual_sleep');render(next);
    if(next.sleep_reasons.length===0){say(line('wake'));motion('waking',950);}
    else say('我还在休息，稍等一下吧～');
   }catch(err){say(String(err));}
  }else say('我在休息，等我醒来再说吧～');
  return; // First click only wakes; never also confirms a drink.
 }
 try{
  const [next,result]=await call<[Game,string]>('confirm_drink',{requestId:crypto.randomUUID()});
  render(next);
  if(result.startsWith('Accepted')){motion('watering',1100);animateDroplet();say(line('water'));}
  else if(result==='TooSoon')say('慢慢喝，不用急着点我呀～');
  else if(result==='Sleeping')say('我还在睡觉呢～');
 }catch(err){say(String(err));}
}
function toggleMenu(){menu.hidden=!menu.hidden;if(!menu.hidden){hideTip();bubble.classList.remove('visible');}}
// Native drag begins only after moving beyond the click/drag threshold.
zone.addEventListener('pointerdown',e=>{
 if(e.button!==0||!e.isPrimary||!onVisiblePlant(e))return;
 e.preventDefault();
 pressed={id:e.pointerId,x:e.clientX,y:e.clientY};nativeDragging=false;
 try{zone.setPointerCapture(e.pointerId);}catch{}
});
zone.addEventListener('pointermove',e=>{
 if(!pressed||e.pointerId!==pressed.id||nativeDragging)return;
 if(!isDrag(pressed.x,pressed.y,e.clientX,e.clientY))return;
 nativeDragging=true;noClickUntil=Date.now()+500;
 zone.classList.add('drag-intent');
 if(native){
  // The OS owns the drag loop once threshold is crossed.
  try{zone.releasePointerCapture(e.pointerId);}catch{}
  pressed=undefined;
  void windowModule?.then(({getCurrentWindow})=>getCurrentWindow().startDragging())
    .catch(err=>console.error('拖动窗口失败',err))
    .finally(()=>{nativeDragging=false;zone.classList.remove('drag-intent');});
 }else{
  // Preview has no native window. Never treat a drag as a drink.
  pressed=undefined;zone.classList.remove('drag-intent');
 }
});
zone.addEventListener('pointerup',e=>{
 if(!pressed||e.pointerId!==pressed.id)return;
 const wasDrag=nativeDragging||isDrag(pressed.x,pressed.y,e.clientX,e.clientY);
 pressed=undefined;
 try{if(zone.hasPointerCapture(e.pointerId))zone.releasePointerCapture(e.pointerId);}catch{}
 zone.classList.remove('drag-intent');
 if(!wasDrag&&Date.now()>=noClickUntil&&onVisiblePlant(e))void water();
});
zone.addEventListener('pointercancel',()=>{pressed=undefined;zone.classList.remove('drag-intent');});
window.addEventListener('blur',()=>{pressed=undefined;zone.classList.remove('drag-intent');});
// Wheel/Control are only interpreted over visible pixels of the plant.
zone.addEventListener('wheel',e=>{
 if(!onVisiblePlant(e))return;
 e.preventDefault();e.stopPropagation();
 if(lastWheelCtrl!==e.ctrlKey){wheelBuffer=0;lastWheelCtrl=e.ctrlKey;}
 const amount=e.deltaY*(e.deltaMode===1?40:e.deltaMode===2?120:1);
 wheelBuffer+=amount;
 const steps=Math.min(4,Math.trunc(Math.abs(wheelBuffer)/80));
 if(!steps)return;
 const sign=Math.sign(wheelBuffer);
 wheelBuffer-=sign*steps*80;
 for(let i=0;i<steps;i++){
  const next=wheelNext(appearance.zoom,appearance.opacity,sign*80,e.ctrlKey);
  appearance={...appearance,...next};
 }
 applyAppearance();scheduleAppearanceSave();
},{passive:false});
// The hand-drawn HTML context menu cannot fit a 134x146 window. At small sizes
// use a native Windows popup, keeping actions and font size accessible.
let nativeMenuPromise:Promise<import('@tauri-apps/api/menu').Menu>|undefined;
async function openNativeContextMenu(){
 const {Menu}=await import('@tauri-apps/api/menu');
 if(!nativeMenuPromise){
  nativeMenuPromise=Menu.new({items:[
   {id:'drink',text:'💧 我喝水啦',action:()=>void water()},
   {id:'sleep',text:'🌙 让植物睡一会儿',action:()=>void call<Game>('enter_manual_sleep').then(render)},
   {id:'snooze',text:'☕ 休息 1 小时',action:()=>void call<Game>('snooze_one_hour').then(render)},
   {id:'wake',text:'☀️ 唤醒植物',action:()=>void call<Game>('exit_manual_sleep').then(render)},
   {id:'settings',text:'🌱 种子铺与设置',action:()=>void openSettings()},
   {id:'hide',text:'☁️ 暂时隐藏',action:()=>void windowModule?.then(({getCurrentWindow})=>getCurrentWindow().hide())}
  ]});
 }
 await (await nativeMenuPromise).popup();
}
zone.addEventListener('contextmenu',e=>{
 e.preventDefault();
 if(!onVisiblePlant(e))return;
 if(native&&appearance.zoom<0.92){
  void openNativeContextMenu().catch(err=>{console.error('原生菜单失败',err);toggleMenu();});
 }else toggleMenu();
});
zone.addEventListener('mouseenter',()=>{
 clearTimeout(tipTimer);
 tipTimer=setTimeout(()=>{if(!menu.hidden||bubble.classList.contains('visible'))return;tip.classList.add('visible');},650);
});
zone.addEventListener('mouseleave',hideTip);
el('#menu-drink').addEventListener('click',()=>{menu.hidden=true;void water();});
el('#menu-sleep').addEventListener('click',async()=>{menu.hidden=true;try{render(await call<Game>('enter_manual_sleep'));}catch(e){say(String(e));}});
el('#menu-wake').addEventListener('click',async()=>{menu.hidden=true;try{render(await call<Game>('exit_manual_sleep'));}catch(e){say(String(e));}});
el('#menu-snooze').addEventListener('click',async()=>{menu.hidden=true;try{render(await call<Game>('snooze_one_hour'));say('我先打个盹，一小时后见～');}catch(e){say(String(e));}});
el('#menu-settings').addEventListener('click',()=>{menu.hidden=true;void openSettings();});
el('#menu-hide').addEventListener('click',async()=>{
 menu.hidden=true;if(native){const {getCurrentWindow}=await import('@tauri-apps/api/window');await getCurrentWindow().hide();}else say('预览中暂不隐藏～');
});
window.addEventListener('keydown',e=>{if(e.key==='Escape')menu.hidden=true;});
void initializeAppearance();void subscribe(render);void refresh();
if(native){void import('@tauri-apps/api/event').then(({listen})=>listen<Array<string|Record<string,unknown>>>('plant-effects',e=>{
 if(e.payload.some(item=>item==='reminder'))sayRare(line('dry'));
}));}
