// Build an offline browser-only preview without npm install, using installed tsc.
// Real Tauri builds use Vite and the upstream @tauri-apps/api.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);let ts;
try{ts=require('typescript')}catch{ts=require(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(import.meta.dirname,'..');const out=path.join(root,'browser_preview');
fs.mkdirSync(path.join(out,'src'),{recursive:true});
for(const name of ['plant','settings','bridge']){
 let js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 js=js.replaceAll("from './bridge'","from './bridge.js'");
 fs.writeFileSync(path.join(out,'src',name+'.js'),js);
}
fs.copyFileSync(path.join(root,'src/styles.css'),path.join(out,'src/styles.css'));
for(const name of ['index','settings']){
 let html=fs.readFileSync(path.join(root,name+'.html'),'utf8').replaceAll(`src="/src/${name==='index'?'plant':'settings'}.ts"`,`src="./src/${name==='index'?'plant':'settings'}.js"`).replace('href="/src/styles.css"','href="./src/styles.css"');
 fs.writeFileSync(path.join(out,name+'.html'),html);
}
fs.cpSync(path.join(root,'public/plant-assets'),path.join(out,'plant-assets'),{recursive:true,force:true});
console.log('Browser preview available at browser_preview/index.html and settings.html');
