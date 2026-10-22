import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
await mkdir('.sandbox/admin-widgets',{recursive:true});const output=await mkdtemp(resolve('.sandbox/admin-widgets/run-'));process.env.TEMP=output;process.env.TMP=output;
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{blogManagerField}from'./src/keystatic/blog-manager-field';import{productManagerField}from'./src/keystatic/product-manager-field';import{translationDraftReviewField}from'./src/keystatic/translation-draft-review-field';const kind=new URLSearchParams(location.search).get('kind');const field=kind==='blog'?blogManagerField():kind==='product'?productManagerField():translationDraftReviewField({type:'blog'});createRoot(document.getElementById('root')).render(React.createElement(field.Input));`,resolveDir:process.cwd(),loader:'tsx'},outfile:resolve(output,'widget.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
const records=Array.from({length:25},(_,i)=>({id:`item-${i}`,slug:`item-${i}`,title:`Article ${i}`,category:'technical-articles',locale:'en',collection:'blog',series:'Parts',sortOrder:i,published:true,sourcePath:`src/content/blog/item-${i}.mdoc`,sourceSha:(i+1).toString(16).padStart(40,'0'),publicUrl:`https://fixture.test/blog/item-${i}/`,translations:[]}));
records[0].translations=[{...records[0],id:'es--item-0',locale:'es',collection:'blogTranslations',sourcePath:'src/content/blogTranslations/es--item-0.mdoc',title:'Artículo 0'}];
const drafts=Array.from({length:3},(_,i)=>({draftSlug:`es--item-${i}`,sourceSha:'f'.repeat(40),locale:'es',title:`Draft ${i}`,sourceSlug:`item-${i}`,sourceTitle:`Article ${i}`,published:i===2,deleteAction:'delete',previewUrl:'/preview',editPath:'/branch/main/collection/blogTranslations/item/es--item-'+i}));
let writes=0;
const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/blog/manager')return res.end(JSON.stringify({posts:records,branch:'main'}));
 if(url.pathname==='/api/products/manager')return res.end(JSON.stringify({products:records,translations:[{...records[0].translations[0],series:'Parts',sortOrder:0,published:true}],categories:['technical-articles']}));
 if(url.pathname==='/api/ai/drafts')return res.end(JSON.stringify({drafts:drafts.filter(d=>url.searchParams.get('includePublished')==='true'||!d.published),counts:{pending:2,published:1,live:1}}));
 if(url.pathname.endsWith('/deletion')){if(req.method==='DELETE')writes++;return res.end(JSON.stringify({records:[{title:'Article 0',locale:'en',publicUrl:'https://fixture.test/blog/item-0/'}],message:'清单'}));}
 if(url.pathname==='/widget.js'){res.setHeader('content-type','text/javascript');return res.end(await readFile(resolve(output,'widget.js')));}
 res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:light-dark(white,#171923);color:light-dark(#172033,#f2f4f7);color-scheme:light dark}</style><div id="root"></div><script type="module" src="/widget.js"></script>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const executablePath=process.platform==='win32'?[resolve(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),resolve(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe')].find(existsSync):undefined;
const browser=await chromium.launch({executablePath,headless:true,env:{...process.env,TEMP:output,TMP:output}});let checks=0;const faults=[];
try{
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>faults.push(e.message));page.on('dialog',d=>{faults.push('native dialog');d.dismiss();});
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const kind of ['blog','product','draft']){
   await page.setViewportSize({width:1280,height:900});await page.goto(`http://127.0.0.1:${server.address().port}/11111111-2222-4333-8444-555555555555/?kind=${kind}`);
   const all=page.getByRole('checkbox',{name:/全选当前筛选/});await all.waitFor();await all.check();
   if(kind==='draft'){
    await page.getByText('已选 2 条',{exact:false}).waitFor();await page.getByRole('checkbox',{name:'显示已审核'}).check();await page.getByText('已选 0 条',{exact:false}).waitFor();await all.check();await page.getByText('已选 3 条',{exact:false}).waitFor();checks++;
   }else{
    await page.getByText('已选 25 项',{exact:false}).waitFor();await page.getByRole('button',{name:kind==='blog'?'删除选中文章':'删除选中产品'}).click();await page.locator('dialog[open]').waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(writes,0);checks++;
    const locale=page.getByLabel('内容语言');await locale.selectOption('es');assert.equal(await page.getByRole('checkbox',{name:/选择 /}).count(),1);assert.equal(await all.isChecked(),false);checks++;
   }
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(output,`${kind}-${theme}-mobile.png`),fullPage:true});checks++;
  }
 }
 assert.deepEqual(faults,[]);await writeFile(resolve(output,'result.json'),JSON.stringify({passed:checks,cloudWrites:'NONE',network:'LOOPBACK_ONLY'}));console.log(JSON.stringify({passed:checks,output,cloudWrites:'NONE'}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
