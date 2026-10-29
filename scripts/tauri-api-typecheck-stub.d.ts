// Used only for static typechecking when @tauri-apps/api is not installed;
// actual Windows builds should resolve real upstream package types.
declare module '@tauri-apps/api/core' {export function invoke<T>(cmd:string,args?:Record<string,unknown>):Promise<T>;}
declare module '@tauri-apps/api/event' {export function listen<T>(name:string,cb:(event:{payload:T})=>void):Promise<()=>void>;}
declare module '@tauri-apps/api/window' {export function getAllWindows():Promise<Array<{label:string,show():Promise<void>,setFocus():Promise<void>}>>;export function getCurrentWindow():{hide():Promise<void>,startDragging():Promise<void>};}
declare module '@tauri-apps/api/menu' {
  export class Menu {
    static new(options: {items: Array<{id:string;text:string;action:()=>void}>}):Promise<Menu>;
    popup():Promise<void>;
  }
}
