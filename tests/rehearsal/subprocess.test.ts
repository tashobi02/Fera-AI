import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),'fera-child-'));dirs.push(root);mkdirSync(join(root,'scripts/rehearsal'),{recursive:true});mkdirSync(join(root,'node_modules/next/dist/bin'),{recursive:true});const wrapper=join(root,'scripts/rehearsal/launch-second-server.mjs');copyFileSync(resolve('scripts/rehearsal/launch-second-server.mjs'),wrapper);return{root,wrapper,next:join(root,'node_modules/next/dist/bin/next')};}
it('records a missing npx executable as a failed run',()=>{
 const root=mkdtempSync(join(tmpdir(),'fera-spawn-'));dirs.push(root);const script=join(root,'runner.mjs');
 writeFileSync(script,`import {runOnce} from ${JSON.stringify(pathToFileURL(resolve('scripts/rehearsal/run-automated-repeats.mjs')).href)};process.env.PATH='/nonexistent';const r=await runOnce(0,{config:'playwright.offline.config.ts',project:'offline-desktop'});if(r.code!==1||!r.spawnError||!/^fera_e2e_premainjourney_/.test(r.dbName))process.exit(9);console.log('failure recorded');`);
 const r=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:5000});expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('failure recorded');
});
it('propagates the actual child crash code through the second-server wrapper',()=>{
 const f=fixture();writeFileSync(f.next,'process.exit(7);\n');const r=spawnSync(process.execPath,[f.wrapper,'--port','3226','--log',join(f.root,'out.log')],{encoding:'utf8',timeout:5000});expect(r.status,r.stderr).toBe(7);
});
it('reaps an owned child that ignores SIGTERM before wrapper exit',async()=>{
 const f=fixture(),pidFile=join(f.root,'pid');writeFileSync(f.next,`require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},100);`);
 const child=spawn(process.execPath,[f.wrapper,'--port','3226','--log',join(f.root,'out.log')],{stdio:'ignore'});
 const closed=new Promise<number|null>(resolve=>child.once('close',resolve));let pid:number|undefined;
 try{for(let n=0;n<100&&!existsSync(pidFile);n++)await new Promise(resolve=>setTimeout(resolve,20));expect(existsSync(pidFile)).toBe(true);pid=Number(readFileSync(pidFile,'utf8'));child.kill('SIGTERM');await closed;expect(()=>process.kill(pid!,0)).toThrow();}
 finally{if(pid)try{process.kill(pid,'SIGKILL');}catch{}child.kill('SIGKILL');}
},10000);
