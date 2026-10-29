//! Desktop shell: all lifecycle, inventory and wallet mutations pass through Rust + SQLite.
mod widget_view;
use widget_view::{WidgetViewState,get_widget_view,set_widget_view};
use plant_life_core::{DrinkResult, Effect, Game, Settings, SleepReason, Species};
use plant_store::PlantStore;
use std::{fs, sync::Mutex, sync::atomic::{AtomicU64, Ordering}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{Emitter, Manager, State};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};

struct Shared { game: Mutex<Game>, store: Mutex<PlantStore> }

fn unix_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

fn transact(shared: &Shared, event: &str, request_id: Option<&str>,
    op: impl FnOnce(&mut Game) -> Result<(), String>) -> Result<Game, String> {
    let mut game = shared.game.lock().map_err(|e| e.to_string())?;
    let mut candidate = game.clone();
    op(&mut candidate)?;
    // An exact retry is a successful no-op: avoid a duplicate UNIQUE request in SQLite.
    if serde_json::to_vec(&candidate).map_err(|e| e.to_string())?
        == serde_json::to_vec(&*game).map_err(|e| e.to_string())? {
        return Ok(game.clone());
    }
    // Never report success to UI before the durable DB transaction commits.
    shared.store.lock().map_err(|e| e.to_string())?
        .commit(&game, &candidate, event, request_id, unix_ms()).map_err(|e| e.to_string())?;
    *game = candidate;
    Ok(game.clone())
}

fn publish(app: &tauri::AppHandle, snapshot: &Game) { let _ = app.emit("plant-state",snapshot.clone()); }

#[tauri::command]
fn get_snapshot(shared: State<'_, Shared>) -> Result<Game, String> {
    Ok(shared.game.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
fn plant_seed(species: Species, request_id: String, shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game, String> {
    let value=transact(&shared,"plant",Some(&request_id),|g| {
        g.plant_seed_once(species,unix_ms(),&request_id).map(|_|()).map_err(str::to_owned)
    })?;
    publish(&app,&value);Ok(value)
}

#[tauri::command]
fn purchase_species(species: Species, request_id: String, shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game, String> {
    let value=transact(&shared,"purchase",Some(&request_id),|g| {
        g.unlock_species_once(species,&request_id).map(|_|()).map_err(str::to_owned)
    })?;
    publish(&app,&value);Ok(value)
}

#[tauri::command]
fn confirm_drink(request_id: String, shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<(Game,String),String> {
    let mut result=DrinkResult::NoPlant;
    let value=transact(&shared,"drink",Some(&request_id),|g| {
        result=g.confirm_drink(&request_id);
        if !matches!(result,DrinkResult::Accepted{..}) {return Err(format!("SKIP:{result:?}"));}
        Ok(())
    });
    match value {
        Ok(v)=>{publish(&app,&v);Ok((v,format!("{result:?}")))},
        Err(s) if s.starts_with("SKIP:")=>Ok((get_snapshot(shared)?,s.trim_start_matches("SKIP:").to_string())),
        Err(s)=>Err(s),
    }
}

#[tauri::command]
fn enter_manual_sleep(shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game,String> {
    let v=transact(&shared,"sleep_manual",None,|g|{g.enter_sleep(SleepReason::Manual);Ok(())})?;
    publish(&app,&v);Ok(v)
}

#[tauri::command]
fn exit_manual_sleep(shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game,String> {
    let v=transact(&shared,"wake_manual",None,|g|{g.exit_sleep(SleepReason::Manual);Ok(())})?;
    publish(&app,&v);Ok(v)
}

#[tauri::command]
fn snooze_one_hour(shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game,String> {
    let v=transact(&shared,"snooze_hour",None,|g|{g.snooze(60,unix_ms());Ok(())})?;
    publish(&app,&v);Ok(v)
}

#[tauri::command]
fn update_settings(settings: Settings, shared: State<'_, Shared>, app: tauri::AppHandle) -> Result<Game,String> {
    settings.validate().map_err(str::to_owned)?;
    let v=transact(&shared,"settings",None,|g|{g.settings=settings;Ok(())})?;
    publish(&app,&v);Ok(v)
}

#[cfg(windows)]
fn windows_idle_ms() -> Option<u64> {
    use std::mem::size_of;
    #[repr(C)] struct LastInputInfo { cb_size: u32, dw_time: u32 }
    #[link(name="user32")]
    extern "system" { fn GetLastInputInfo(info:*mut LastInputInfo)->i32; }
    #[link(name="kernel32")]
    extern "system" { fn GetTickCount()->u32; }
    let mut info=LastInputInfo{cb_size:size_of::<LastInputInfo>() as u32,dw_time:0};
    if unsafe{GetLastInputInfo(&mut info)}==0 {None}
    else {Some(unsafe{GetTickCount()}.wrapping_sub(info.dw_time) as u64)}
}
#[cfg(not(windows))]
fn windows_idle_ms()->Option<u64>{None}

/// Best-effort Windows desktop detection; Winlogon/secure desktop => conservative LOCK.
/// Actual WTS lock/unlock event hook and multi-session tests remain Windows acceptance gates.
#[cfg(windows)]
fn windows_input_desktop_locked()->Option<bool> {
    #[link(name="user32")]
    extern "system" {
        fn OpenInputDesktop(flags:u32, inherit:i32, access:u32)->isize;
        fn CloseDesktop(desktop:isize)->i32;
        fn GetUserObjectInformationW(obj:isize,index:i32,info:*mut u16,len:u32,needed:*mut u32)->i32;
    }
    let handle=unsafe{OpenInputDesktop(0,0,0x0001)}; // DESKTOP_READOBJECTS
    if handle==0{return None;}
    let mut buf=[0u16;128];let mut need=0u32;
    let ok=unsafe{GetUserObjectInformationW(handle,2,buf.as_mut_ptr(),(buf.len()*2) as u32,&mut need)};
    unsafe{CloseDesktop(handle)};
    if ok==0 {return None;}
    let name=String::from_utf16_lossy(&buf[..buf.iter().position(|c|*c==0).unwrap_or(buf.len())]);
    Some(!name.eq_ignore_ascii_case("Default"))
}
#[cfg(not(windows))]
fn windows_input_desktop_locked()->Option<bool>{None}

#[cfg(windows)]
fn local_minute_of_day()->u16 {
    #[repr(C)]struct SystemTime{year:u16,month:u16,weekday:u16,day:u16,hour:u16,minute:u16,second:u16,millis:u16}
    #[link(name="kernel32")]
    extern "system"{fn GetLocalTime(st:*mut SystemTime);}
    let mut st=SystemTime{year:0,month:0,weekday:0,day:0,hour:0,minute:0,second:0,millis:0};
    unsafe{GetLocalTime(&mut st)};
    st.hour*60+st.minute
}
#[cfg(not(windows))]
fn local_minute_of_day()->u16{12*60}

fn show_settings(app:&tauri::AppHandle){
    if let Some(w)=app.get_webview_window("settings") {let _=w.show();let _=w.set_focus();}
}

fn run_tick(app: &tauri::AppHandle, delta:u64, input:bool, locked:Option<bool>, minute:u16, flush:bool) {
    let shared=app.state::<Shared>();
    let Ok(mut game)=shared.game.lock() else { eprintln!("tick: game mutex poisoned"); return; };
    if flush { eprintln!("tick: alive delta={delta}ms input={input} locked={locked:?} minute={minute} sleeping={} reasons={:?}", game.is_sleeping(), game.sleep_reasons); }
    let old=game.clone();
    let mut next=old.clone();
    let mut effects:Vec<Effect>=vec![];
    let event:Result<(), String>=(|| {
        let g=&mut next;
        let now=unix_ms();
        effects.extend(g.expire_snooze(now));
        if locked==Some(true){effects.extend(g.enter_sleep(SleepReason::Lock));}
        else if locked==Some(false){effects.extend(g.exit_sleep(SleepReason::Lock));}
        if g.settings.is_quiet_at(minute){effects.extend(g.enter_sleep(SleepReason::QuietHours));}
        else {effects.extend(g.exit_sleep(SleepReason::QuietHours));}
        // A large unexpected interval is never evidence of continuous activity.
        if delta>30_000 {
            effects.extend(g.enter_sleep(SleepReason::Recovery));
        } else {
            if g.sleep_reasons.contains(&SleepReason::Recovery) && input {
                effects.extend(g.exit_sleep(SleepReason::Recovery));
            }
            effects.extend(g.observe_activity(delta,input,now));
        }
        Ok(())
    })();
    if let Err(e)=event {eprintln!("plant tick: {e}");return;}
    let changed=serde_json::to_vec(&next).ok()!=serde_json::to_vec(&old).ok();
    let should_save=changed && (flush || !effects.is_empty());
    if should_save {
        let event_type=if effects.is_empty(){"checkpoint"}else{"life_transition"};
        if let Err(e)=shared.store.lock().map_err(|e|e.to_string())
            .and_then(|mut store|store.commit(&old,&next,event_type,None,unix_ms()).map_err(|e|e.to_string())) {
            eprintln!("plant SQLite checkpoint: {e}");return;
        }
    }
    *game=next.clone();
    drop(game);
    if !effects.is_empty(){let _=app.emit("plant-effects",effects);}
    if flush || should_save {publish(app,&next);}
}

pub fn run(){
    tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![
        get_snapshot,plant_seed,purchase_species,confirm_drink,
        get_widget_view,set_widget_view,
        enter_manual_sleep,exit_manual_sleep,snooze_one_hour,update_settings
      ])
      .setup(|app|{
          let data=app.path().app_data_dir()?;fs::create_dir_all(&data)?;
          let mut store=PlantStore::open(&data.join("plants-v1.sqlite3"))
              .map_err(|e|std::io::Error::other(e.to_string()))?;
          let game=store.load_or_import(Some(&data.join("save-v1.json")))
              .map_err(|e|std::io::Error::other(e.to_string()))?;
          app.manage(Shared{game:Mutex::new(game),store:Mutex::new(store)});
          let appearance=WidgetViewState::new(data.join("widget-view-v1.json"));
          app.manage(appearance);
          if let Some(win)=app.get_webview_window("plant") {
              app.state::<WidgetViewState>().apply_startup(&win)
                  .map_err(std::io::Error::other)?;
          }
          let show=MenuItem::with_id(app,"show","显示植物",true,None::<&str>)?;
          let settings=MenuItem::with_id(app,"settings","种子铺 / 设置",true,None::<&str>)?;
          let sleep=MenuItem::with_id(app,"sleep","让植物睡一会儿",true,None::<&str>)?;
          let snooze=MenuItem::with_id(app,"snooze","休息 1 小时",true,None::<&str>)?;
          let wake=MenuItem::with_id(app,"wake","唤醒植物",true,None::<&str>)?;
          let quit=MenuItem::with_id(app,"quit","退出",true,None::<&str>)?;
          let menu=Menu::with_items(app,&[&show,&settings,&sleep,&snooze,&wake,&quit])?;
          TrayIconBuilder::new()
             .icon(app.default_window_icon().expect("app icon").clone())
             .menu(&menu).menu_on_left_click(false)
             .on_menu_event(|handle,event|{
                 match event.id().as_ref(){
                     "show"=>{if let Some(w)=handle.get_webview_window("plant"){let _=w.show();}},
                     "settings"=>show_settings(handle),
                     "sleep"|"wake"|"snooze"=>{
                         let label=event.id().as_ref();
                         let v=transact(&handle.state::<Shared>(),label,None,|g|{
                             match label {
                                 "sleep"=>{g.enter_sleep(SleepReason::Manual);},
                                 "wake"=>{g.exit_sleep(SleepReason::Manual);},
                                 _=>{g.snooze(60,unix_ms());}
                             }Ok(())
                         });
                         match v{Ok(g)=>publish(handle,&g),Err(e)=>eprintln!("menu: {e}")}
                     },
                     "quit"=>handle.exit(0),_=>{},
                 }
             }).build(app)?;
          let handle=app.handle().clone();
          // Tick heartbeat + watchdog: one real-world incident had the tick thread stop
          // silently (process alive, no error). The watchdog respawns the loop if the
          // heartbeat stalls; a recovered stale thread exits via the generation guard.
          let beat=std::sync::Arc::new(AtomicU64::new(unix_ms() as u64));
          let generation=std::sync::Arc::new(AtomicU64::new(0));
          fn spawn_tick(handle:tauri::AppHandle, beat:std::sync::Arc<AtomicU64>, generation:std::sync::Arc<AtomicU64>) {
              let my_gen=generation.fetch_add(1,Ordering::SeqCst)+1;
              beat.store(unix_ms() as u64,Ordering::SeqCst);
              thread::spawn(move||{
                  let mut previous=Instant::now();
                  let mut old_idle=windows_idle_ms();
                  let mut polls=0u8;
                  loop{
                      thread::sleep(Duration::from_millis(1000));
                      if generation.load(Ordering::SeqCst)!=my_gen {return;}
                      beat.store(unix_ms() as u64,Ordering::SeqCst);
                      let now=Instant::now();let delta=now.duration_since(previous).as_millis() as u64;
                      previous=now;
                      let idle=windows_idle_ms();
                      let input=match(old_idle,idle){
                          (Some(old),Some(new))=>new.saturating_add(300)<old.saturating_add(delta),
                          _=>false,
                      };
                      old_idle=idle;
                      polls=polls.wrapping_add(1);
                      // Checkpoint every ~30 s, immediately on stage/sleep/death events.
                      polls = if polls >= 30 {0} else {polls};
                      run_tick(&handle,delta,input,windows_input_desktop_locked(),local_minute_of_day(),polls==0);
                  }
              });
          }
          spawn_tick(handle.clone(),beat.clone(),generation.clone());
          thread::spawn(move||{
              loop{
                  thread::sleep(Duration::from_secs(5));
                  let age=unix_ms() as u64 - beat.load(Ordering::SeqCst);
                  if age>15_000 {
                      eprintln!("tick watchdog: heartbeat stalled {age}ms, respawning tick thread");
                      spawn_tick(handle.clone(),beat.clone(),generation.clone());
                  }
              }
          });
          Ok(())
      })
      .on_window_event(|window,event|{
          if window.label()=="plant" {
              if let tauri::WindowEvent::Moved(pos)=event {
                  window.app_handle().state::<WidgetViewState>()
                      .record_moved(*pos,window.app_handle().clone());
              }
          }
          if let tauri::WindowEvent::CloseRequested{api,..}=event {
              if window.label()=="settings" || window.label()=="plant" {
                  api.prevent_close();let _=window.hide();
              }
          }
      })
      .run(tauri::generate_context!())
      .expect("unable to run plant companion");
}
