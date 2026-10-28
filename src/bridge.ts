export type Species='mint'|'mushroom';
export type Stage='healthy'|'thirsty'|'dry'|'critical'|'dead';
export type SleepReason='idle'|'lock'|'suspend'|'manual'|'quiet_hours'|'recovery';
export interface Settings { reminder_minutes:number; idle_sleep_minutes:number; idle_sleep_enabled:boolean;click_min_interval_minutes:number;reward_interval_minutes:number; quiet_hours_enabled:boolean;active_start_minute:number;active_end_minute:number; }
export interface Plant {instance_id:string;generation:number;species:Species;stage:Stage;active_elapsed_ms:number;total_active_ms:number;cycle_reminder_ms:number;cycle_number:number;drink_count:number;growth_points:number;planted_at_unix_ms:number;died_at_unix_ms:number|null;reminder_fired:boolean; }
export interface Game {settings:Settings;current:Plant|null;memorials:Plant[];unlocked:Species[];droplets:number;total_confirmed_active_ms:number;last_water_total_active_ms:number|null;last_reward_total_active_ms:number|null;last_reward_cycle:string|null;processed_request_ids:string[];next_instance_id:number;sleep_reasons:SleepReason[];pending_idle_ms:number;manual_sleep_until_unix_ms:number|null;}
export const native = '__TAURI_INTERNALS__' in window;
const minute=60_000;
let mock:Game = {settings:{reminder_minutes:45,idle_sleep_minutes:10,idle_sleep_enabled:true,click_min_interval_minutes:15,reward_interval_minutes:30,quiet_hours_enabled:true,active_start_minute:480,active_end_minute:1320},current:null,memorials:[],unlocked:[],droplets:0,total_confirmed_active_ms:0,last_water_total_active_ms:null,last_reward_total_active_ms:null,last_reward_cycle:null,processed_request_ids:[],next_instance_id:1,sleep_reasons:[],pending_idle_ms:0,manual_sleep_until_unix_ms:null};
// Browser-only preview uses localStorage to share mock state across two tabs.
// This path is never used as the native application's lifecycle source.
if (!native) {
  try {const stored=localStorage.getItem('plant-preview-mock');if(stored){
    const previous=JSON.parse(stored) as Game;
    mock={...mock,...previous,settings:{...mock.settings,...previous.settings},manual_sleep_until_unix_ms:previous.manual_sleep_until_unix_ms??null};
  }}catch{ /* private/incognito mode */ }
  window.addEventListener('storage',event=>{
    if(event.key==='plant-preview-mock' && event.newValue){
      try{mock=JSON.parse(event.newValue) as Game;window.dispatchEvent(new CustomEvent('plant-demo-snapshot',{detail:structuredClone(mock)}));}catch{}
    }
  });
}
let previewRequestSeq=0;
const clone=()=>structuredClone(mock);
function savePreview(){if(!native){try{localStorage.setItem('plant-preview-mock',JSON.stringify(mock));}catch{}}}
function stage(e:number,t:number):Stage {return e>=t+20*minute?'dead':e>=t+10*minute?'critical':e>=t*.9?'dry':e>=t*.7?'thirsty':'healthy';}
export function demoAdvance(ms:number){
 if(mock.current && mock.current.stage!=='dead' && !mock.sleep_reasons.length){
  const p=mock.current;p.active_elapsed_ms+=ms;p.total_active_ms+=ms;mock.total_confirmed_active_ms+=ms;p.stage=stage(p.active_elapsed_ms,p.cycle_reminder_ms);
  if(p.stage==='dead' && p.died_at_unix_ms===null)p.died_at_unix_ms=Date.now();
 }
 savePreview();window.dispatchEvent(new CustomEvent('plant-demo-snapshot',{detail:clone()}));
}
export async function call<T=Game>(command:string,args:Record<string,unknown>={}):Promise<T>{
 if(native){const {invoke}=await import('@tauri-apps/api/core');return invoke<T>(command,args);}
 const p=mock.current, species=args.species as Species;
 const requestId=(typeof args.requestId === "string" ? args.requestId : `preview-${++previewRequestSeq}`);
 switch(command){
  case 'get_snapshot':break;
  case 'plant_seed':
   if(mock.processed_request_ids.includes(requestId))break;
   if(p && p.stage!=='dead')throw Error('当前植物还在陪着你');
   if(!mock.unlocked.length)mock.unlocked.push(species);
   if(!mock.unlocked.includes(species))throw Error('请先解锁种子');
   if(p)mock.memorials.push(p);
   mock.current={instance_id:'demo-'+mock.next_instance_id++,generation:mock.memorials.filter(m=>m.species===species).length+1,species,stage:'healthy',active_elapsed_ms:0,total_active_ms:0,cycle_reminder_ms:mock.settings.reminder_minutes*minute,cycle_number:1,drink_count:0,growth_points:0,planted_at_unix_ms:Date.now(),died_at_unix_ms:null,reminder_fired:false};mock.sleep_reasons=[];mock.last_water_total_active_ms=null;mock.manual_sleep_until_unix_ms=null;mock.processed_request_ids.push(requestId);break;
  case 'purchase_species':if(mock.processed_request_ids.includes(requestId))break;if(mock.unlocked.includes(species))throw Error('已拥有');if(mock.droplets<6)throw Error('水滴币不足');mock.droplets-=6;mock.unlocked.push(species);mock.processed_request_ids.push(requestId);break;
  case 'snooze_one_hour':if(p && p.stage!=='dead'){if(!mock.sleep_reasons.includes('manual'))mock.sleep_reasons.push('manual');mock.manual_sleep_until_unix_ms=Date.now()+3600000;}break;
  case 'enter_manual_sleep':if(p&&p.stage!=='dead'&&!mock.sleep_reasons.includes('manual'))mock.sleep_reasons.push('manual');break;
  case 'exit_manual_sleep':mock.sleep_reasons=mock.sleep_reasons.filter(s=>s!=='manual');mock.manual_sleep_until_unix_ms=null;break;
  case 'update_settings':mock.settings=args.settings as Settings;break;
  case 'confirm_drink':{
    const id=args.requestId as string;
    let msg='NoPlant';
    if(p){if(mock.processed_request_ids.includes(id))msg='Duplicate';else if(p.stage==='dead')msg='Dead';else if(mock.sleep_reasons.length)msg='Sleeping';else if(mock.last_water_total_active_ms!==null && mock.total_confirmed_active_ms-mock.last_water_total_active_ms<mock.settings.click_min_interval_minutes*minute)msg='TooSoon';else{
     mock.processed_request_ids.push(id);
     const reward=mock.total_confirmed_active_ms>=mock.settings.reward_interval_minutes*minute && (mock.last_reward_total_active_ms===null||mock.total_confirmed_active_ms-mock.last_reward_total_active_ms>=mock.settings.reward_interval_minutes*minute);
     if(reward){mock.droplets++;mock.last_reward_total_active_ms=mock.total_confirmed_active_ms;}
     mock.last_water_total_active_ms=mock.total_confirmed_active_ms;
     p.drink_count++;p.growth_points++;p.active_elapsed_ms=0;p.stage='healthy';p.cycle_number++;p.cycle_reminder_ms=mock.settings.reminder_minutes*minute;p.reminder_fired=false;
     msg=`Accepted { rewarded: ${reward} }`;
    }}return [clone(),msg] as T;
  }
  default:throw Error('Unknown preview command: '+command);
 }
 savePreview();window.dispatchEvent(new CustomEvent('plant-demo-snapshot',{detail:clone()}));
 return clone() as T;
}
export async function subscribe(onValue:(game:Game)=>void){
 if(native){const {listen}=await import('@tauri-apps/api/event');return await listen<Game>('plant-state',e=>onValue(e.payload));}
 const handler=(e:Event)=>onValue((e as CustomEvent<Game>).detail);
 window.addEventListener('plant-demo-snapshot',handler);return()=>window.removeEventListener('plant-demo-snapshot',handler);
}
export const asset=(species:Species,stage:Stage|'sleep')=>`./plant-assets/${species}/states/${stage}.png`;
export const nameOf=(species:Species)=>species==='mint'?'小薄荷':'小蘑菇';
