//! Persisted widget appearance and position, separate from the Rust lifecycle/SQLite save.
//! Zoom changes the *real* native window size so transparent unused space does not
//! continue intercepting input from applications underneath.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::{Mutex, atomic::{AtomicBool,AtomicU64,Ordering}}, thread, time::Duration};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

const BASE_WIDTH: f64 = 268.0;
const BASE_HEIGHT: f64 = 292.0;
const MIN_ZOOM: f64 = 0.5;
const MIN_OPACITY: f64 = 0.25;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct WidgetView {
    pub zoom: f64,
    pub opacity: f64,
    /// Physical global screen coordinates (can be negative on secondary monitors).
    pub x: Option<i32>,
    pub y: Option<i32>,
}
impl Default for WidgetView {
    fn default() -> Self { Self { zoom:1.0, opacity:1.0, x:None, y:None } }
}
impl WidgetView {
    fn sanitize(&mut self) {
        self.zoom = if self.zoom.is_finite() { self.zoom.clamp(MIN_ZOOM,1.0) } else {1.0};
        self.opacity = if self.opacity.is_finite() { self.opacity.clamp(MIN_OPACITY,1.0) } else {1.0};
    }
}

pub struct WidgetViewState {
    path:PathBuf,
    view:Mutex<WidgetView>,
    moved_generation:AtomicU64,
    move_worker_active:AtomicBool,
    io_lock:Mutex<()>,
}
impl WidgetViewState {
    pub fn new(path:PathBuf)->Self{
        let restored=fs::read(&path).ok().and_then(|b|serde_json::from_slice::<WidgetView>(&b).ok())
            .or_else(||fs::read(path.with_extension("json.bak")).ok()
                .and_then(|b|serde_json::from_slice::<WidgetView>(&b).ok()));
        let mut value=restored.unwrap_or_default();
        value.sanitize();
        Self {path,view:Mutex::new(value),moved_generation:AtomicU64::new(0),
            move_worker_active:AtomicBool::new(false),io_lock:Mutex::new(())}
    }
    pub fn current(&self)->Result<WidgetView,String>{self.view.lock().map(|v|v.clone()).map_err(|e|e.to_string())}
    fn persist(&self)->Result<(),String>{
        let _write_guard=self.io_lock.lock().map_err(|e|e.to_string())?;
        let value=self.current()?;
        let data=serde_json::to_vec_pretty(&value).map_err(|e|e.to_string())?;
        // .tmp prevents truncation of the existing preference file during a crash.
        let tmp=self.path.with_extension("json.tmp");
        fs::write(&tmp,data).map_err(|e|e.to_string())?;
        // On Windows rename cannot replace an existing destination. A backup makes
        // an interrupted replacement recoverable without changing the game save.
        let backup=self.path.with_extension("json.bak");
        if self.path.exists(){
            let _=fs::remove_file(&backup);
            fs::rename(&self.path,&backup).map_err(|e|e.to_string())?;
        }
        match fs::rename(&tmp,&self.path){
            Ok(())=>{let _=fs::remove_file(&backup);Ok(())},
            Err(e)=>{
                if !self.path.exists() && backup.exists(){let _=fs::rename(&backup,&self.path);}
                Err(e.to_string())
            }
        }
    }
    pub fn apply_startup(&self, win:&WebviewWindow)->Result<(),String>{
        let saved=self.current()?;
        win.set_size(LogicalSize::new(BASE_WIDTH*saved.zoom, BASE_HEIGHT*saved.zoom))
            .map_err(|e|e.to_string())?;
        let physical=win.outer_size().map_err(|e|e.to_string())?;
        let monitors=win.available_monitors().map_err(|e|e.to_string())?;
        let old_position=match(saved.x,saved.y){(Some(x),Some(y))=>Some((x,y)),_=>None};
        // Restore only if at least a useful portion remains on a connected screen.
        if let Some((x,y))=old_position {
            let valid=monitors.iter().any(|m|{
                let a=m.work_area();
                x+physical.width as i32>=a.position.x+24 && x<=a.position.x+a.size.width as i32-24 &&
                y+physical.height as i32>=a.position.y+24 && y<=a.position.y+a.size.height as i32-24
            });
            if valid {return win.set_position(PhysicalPosition::new(x,y)).map_err(|e|e.to_string());}
        }
        if let Some(monitor)=win.current_monitor().map_err(|e|e.to_string())?{
            let a=monitor.work_area();
            let x=a.position.x+a.size.width as i32-physical.width as i32-10;
            let y=a.position.y+a.size.height as i32-physical.height as i32-6;
            win.set_position(PhysicalPosition::new(x,y)).map_err(|e|e.to_string())?;
        }
        Ok(())
    }
    pub fn change(&self, win:&WebviewWindow,zoom:f64,opacity:f64)->Result<WidgetView,String>{
        if !zoom.is_finite() || !opacity.is_finite(){return Err("无效的缩放/透明度".into());}
        let mut new=self.current()?;
        let clamped_zoom=(zoom.clamp(MIN_ZOOM,1.0)*100.0).round()/100.0;
        let clamped_opacity=(opacity.clamp(MIN_OPACITY,1.0)*100.0).round()/100.0;
        if (clamped_zoom-new.zoom).abs()>0.001 {
            let before_size=win.outer_size().map_err(|e|e.to_string())?;
            let before_pos=win.outer_position().map_err(|e|e.to_string())?;
            win.set_size(LogicalSize::new(BASE_WIDTH*clamped_zoom,BASE_HEIGHT*clamped_zoom))
                .map_err(|e|e.to_string())?;
            let after_size=win.outer_size().map_err(|e|e.to_string())?;
            // Keep bottom-right fixed; avoids surprise jumps from the system tray.
            win.set_position(PhysicalPosition::new(
                before_pos.x+before_size.width as i32-after_size.width as i32,
                before_pos.y+before_size.height as i32-after_size.height as i32
            )).map_err(|e|e.to_string())?;
        }
        let pos=win.outer_position().map_err(|e|e.to_string())?;
        new.zoom=clamped_zoom;new.opacity=clamped_opacity;
        new.x=Some(pos.x);new.y=Some(pos.y);
        *self.view.lock().map_err(|e|e.to_string())?=new.clone();
        // Supersede pending move checkpoints: zoom/opacity changes persist immediately.
        self.moved_generation.fetch_add(1,Ordering::SeqCst);
        self.persist()?;
        Ok(new)
    }
    pub fn record_moved(&self, position:PhysicalPosition<i32>,app:AppHandle){
        if let Ok(mut v)=self.view.lock(){v.x=Some(position.x);v.y=Some(position.y);}
        self.moved_generation.fetch_add(1,Ordering::SeqCst);
        if self.move_worker_active.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err(){return;}
        // One worker for an entire drag; never start a new thread for every mouse pixel.
        thread::spawn(move||{
            let state=app.state::<WidgetViewState>();
            loop {
                let observed=state.moved_generation.load(Ordering::SeqCst);
                thread::sleep(Duration::from_millis(650));
                if state.moved_generation.load(Ordering::SeqCst)!=observed {continue;}
                if let Err(e)=state.persist(){eprintln!("widget position save failed: {e}");}
                state.move_worker_active.store(false,Ordering::SeqCst);
                // If a move raced with the worker ending, persist the latest view as well.
                if state.moved_generation.load(Ordering::SeqCst)!=observed {
                    if let Err(e)=state.persist(){eprintln!("widget position save failed: {e}");}
                }
                break;
            }
        });
    }
}

#[tauri::command]
pub fn get_widget_view(state:tauri::State<'_,WidgetViewState>)->Result<WidgetView,String>{state.current()}

#[tauri::command]
pub fn set_widget_view(zoom:f64,opacity:f64,app:AppHandle,state:tauri::State<'_,WidgetViewState>)->Result<WidgetView,String>{
    let win=app.get_webview_window("plant").ok_or("植物窗口未找到")?;
    state.change(&win,zoom,opacity)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn defaults_are_visible_and_full_size(){let v=WidgetView::default();assert_eq!(v.zoom,1.);assert_eq!(v.opacity,1.);}
    #[test] fn malformed_values_are_sanitized(){let mut v=WidgetView{zoom:f64::INFINITY,opacity:0.,x:None,y:None};v.sanitize();assert_eq!(v.zoom,1.);assert_eq!(v.opacity,0.25);}
}
