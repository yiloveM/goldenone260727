import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
await mkdir('.sandbox/llms-ui',{recursive:true});const output=await mkdtemp(resolve('.sandbox/llms-ui/run-'));
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{LlmsStatusInput}from'./src/keystatic/llms-status-field';createRoot(document.getElementById('root')).render(React.createElement(LlmsStatusInput));`,resolveDir:process.cwd(),loader:'tsx'},outfile:resolve(output,'widget.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
let pending=false,failed=false,reads=0;const faults=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/widget.js'){res.setHeader('content-type','text/javascript');res.end(await readFile(resolve(output,'widget.js')));return;}
  if(req.url==='/api/keystatic/llms-status'){reads++;res.setHeader('content-type','application/json');if(failed){res.statusCode=503;res.end('{}');return;}res.end(JSON.stringify({enabled:true,matchesCurrent:!pending,locales:[{locale:'en',entries:42,markdown:40},{locale:'ar',entries:30,markdown:28,fullTruncated:true}],skipped:{policy:3},limits:[]}));return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><style>body{color-scheme:light dark;background:Canvas;color:CanvasText;font:16px system-ui;margin:20px}button,a{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/widget.js"></script></body></html>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TMP:output,TEMP:output}});let checks=0;
try{
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>faults.push(e.message));
  for(const theme of ['light','dark'])for(const width of [1440,390]){
    pending=false;failed=false;await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText(/与已保存设置一致/).waitFor();checks++;
    pending=true;await page.getByRole('button',{name:'刷新生成状态'}).click();await page.getByText(/已保存设置尚未发布/).waitFor();checks++;
    failed=true;await page.getByRole('button',{name:'刷新生成状态'}).click();await page.getByText(/暂时无法读取生成状态/).waitFor();checks++;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(output,`${theme}-${width}.png`),fullPage:true});checks++;
  }
  assert.deepEqual(faults,[]);assert.equal(reads,12);console.log(JSON.stringify({passed:checks,output,network:'LOOPBACK_ONLY',cloudWrites:'NONE'}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
