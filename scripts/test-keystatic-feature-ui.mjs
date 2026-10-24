import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {createReader} from '@keystatic/core/reader';
import {makeGenericAPIRouteHandler} from '@keystatic/core/api/generic';
import {chromium} from 'playwright';
import {sitePolicyFixture} from './site-policy-test-fixture.mjs';
import {featurePolicy} from '../src/lib/feature-policy.mjs';
import {auditFeatureContract} from './audit-feature-contract.mjs';
import {singletonFeatures,collectionFeatures} from '../src/lib/feature-registry.mjs';

const parent=path.resolve('Temp/keystatic-feature-ui-tests');await fs.mkdir(parent,{recursive:true});const output=await fs.mkdtemp(path.join(parent,'run-'));
const base=JSON.parse(await fs.readFile('src/data/site-config.json','utf8'));
const asV1=()=>{const c=structuredClone(base);c.schemaVersion=1;delete c.features.manager;delete c.features.visuals;delete c.features.articlePublisher.research;delete c.features.articlePublisher.bodyImage;delete c.features.aiDiscovery.include;return c;};
const definitions={'import.meta.env':JSON.stringify({DEV:true,PROD:false,PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/site'}),'process.env.NODE_ENV':'"production"'};
// Public local storage mode exercises the real UI/API without GitHub credentials.
const localMode={name:'native-local-mode',setup(b){b.onLoad({filter:/[\\/]keystatic\.config\.ts$/},async a=>({loader:'ts',contents:(await fs.readFile(a.path,'utf8')).replace("const isProduction = process.env.NODE_ENV === 'production';",'const isProduction = false;')}));}};
const nodeConfig=path.join(output,'config.mjs');
await build({entryPoints:['keystatic.config.ts'],outfile:nodeConfig,bundle:true,platform:'node',format:'esm',packages:'external',define:definitions,logLevel:'error',plugins:[sitePolicyFixture(base),localMode]});
const {createKeystaticConfig}=await import(pathToFileURL(nodeConfig));let checks=0;
function retained(actual,expected,label){if(Array.isArray(expected)){assert.equal(actual.length,expected.length,label);expected.forEach((v,i)=>retained(actual[i],v,label+'.'+i));}else if(expected&&typeof expected==='object'){for(const [key,value]of Object.entries(expected))retained(actual[key],value,label+'.'+key);}else assert.deepEqual(actual,expected,label);}
auditFeatureContract();checks++;
const stored=path.join(output,'native-content');await fs.mkdir(stored,{recursive:true});
const modes=base.scope==='features'?[['features',base],['legacy',null]]:[['v2',base],['features',{schemaVersion:2,scope:'features',features:base.features,locales:base.locales}],['v1',asV1()],['legacy',null]];
for(const [mode,c]of modes){
 const config=createKeystaticConfig(c),root=path.join(stored,mode);await fs.mkdir(root,{recursive:true});
 for(const key of Object.keys(config.singletons))assert.ok(Object.hasOwn(singletonFeatures,key),'Registered singleton '+key);for(const key of Object.keys(config.collections))assert.ok(Object.hasOwn(collectionFeatures,key),'Registered collection '+key);
 for(const [id,singleton]of Object.entries(config.singletons)){
  const file=singleton.path+'.json',dest=path.join(root,file);await fs.mkdir(path.dirname(dest),{recursive:true});
  let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;assert.equal(await createReader(root,config).singletons[id].read(),null);text='{}';}
  if(id==='siteConfig'){if(!c&&base.scope==='features'){assert.equal(await createReader(root,config).singletons[id].read(),null);checks++;continue;}text=JSON.stringify(c||asV1());}
  await fs.writeFile(dest,text);const first=await createReader(root,config).singletons[id].read();
  // Non-data custom notices are omitted by native serialization, not persisted
  // into strict customer config. Every underlying actual data value is retained.
  const raw=JSON.parse(text);retained(first,raw,mode+' '+id);
  await fs.writeFile(dest,JSON.stringify(first));assert.deepEqual(await createReader(root,config).singletons[id].read(),first);checks++;
 }
 for(const [id,collection]of Object.entries(config.collections)){
  const directory=collection.path.split('*')[0];let names=[];try{names=(await fs.readdir(directory)).filter(n=>/\.(mdoc|json)$/.test(n));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of names){const dest=path.join(root,directory,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(directory,name),dest);}
  const list=await createReader(root,config).collections[id].all();assert.equal(list.length,names.length);checks++;
 }
}
const content=path.join(stored,base.scope==='features'?'features':'v2'),settingsPath=path.join(content,'src/data/site-config.json');
// Reader notices are nonpersistent; seed true native input, never Reader output.
await fs.writeFile(settingsPath,JSON.stringify(base));
const bundle=path.join(output,'native-ui.txt');
await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import FeatureApp from './src/keystatic/feature-app';createRoot(document.getElementById('root')).render(<FeatureApp/>);",resolveDir:process.cwd(),loader:'tsx'},outfile:bundle,bundle:true,platform:'browser',format:'esm',jsx:'automatic',define:definitions,logLevel:'error',plugins:[sitePolicyFixture(base),localMode],loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
let policyUnavailable=false,featureReads=0,nativeWrites=0;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/native-ui.js'){res.setHeader('content-type','text/javascript');return res.end(await fs.readFile(bundle));}
 if(url.pathname==='/native-ui.css'){res.setHeader('content-type','text/css');return res.end(existsSync(bundle.replace(/\.txt$/,'.css'))?await fs.readFile(bundle.replace(/\.txt$/,'.css')):'');}
 if(url.pathname==='/api/keystatic/features'){featureReads++;res.setHeader('content-type','application/json');if(policyUnavailable){res.statusCode=503;return res.end('{}');}const c=JSON.parse(await fs.readFile(settingsPath,'utf8'));return res.end(JSON.stringify({features:featurePolicy(c),schemaVersion:c.schemaVersion,scope:c.scope,revision:String(featureReads)}));}
 if(url.pathname.startsWith('/api/keystatic/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body})});
  const handler=makeGenericAPIRouteHandler({config:createKeystaticConfig(JSON.parse(await fs.readFile(settingsPath,'utf8'))),localBaseDirectory:content});const result=await handler(request);
  if(req.method==='POST'&&result.status===200)nativeWrites++;
  res.writeHead(result.status||200,result.headers);return res.end(result.body);
 }
 res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/native-ui.css"><style>body{margin:0;background:light-dark(#fff,#202124);color:light-dark(#172033,#f4f4f5);color-scheme:light dark}dialog::backdrop{background:#0008}</style><div id="root"></div><script type="module" src="/native-ui.js"></script>');
 }catch(e){res.writeHead(500);res.end('Native fixture error: '+e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const executablePath=process.platform==='win32'?['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync):undefined;
const browser=await chromium.launch({executablePath,headless:true,env:{...process.env,TEMP:output,TMP:output}}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});context.setDefaultTimeout(20000);await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('Unexpected native browser dialog');void d.dismiss();});
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin+'/keystatic/singleton/siteConfig');
 await page.getByRole('checkbox',{name:'开放媒体管理',exact:true}).waitFor();checks++;
 // Native inputs and native update API, not an imitation settings form.
 await page.getByRole('checkbox',{name:'开放媒体管理',exact:true}).uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Saved')||!document.querySelector('button[type="submit"]')?.disabled);
 for(let i=0;i<50;i++){if(!JSON.parse(await fs.readFile(settingsPath,'utf8')).features.manager.media)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(JSON.parse(await fs.readFile(settingsPath,'utf8')).features.manager.media,false);assert.ok(nativeWrites>0);checks++;
 await page.goto(origin+'/keystatic/singleton/imagePool');await page.getByRole('heading',{name:'此功能暂未开放'}).waitFor();assert.ok(await page.getByRole('link',{name:'前往功能总成'}).isVisible());checks++;
 await page.goto(origin+'/keystatic/singleton/siteConfig');await page.getByRole('checkbox',{name:'开放媒体管理',exact:true}).check();await page.getByRole('button',{name:'Save',exact:true}).click();
 for(let i=0;i<50;i++){if(JSON.parse(await fs.readFile(settingsPath,'utf8')).features.manager.media)break;await new Promise(r=>setTimeout(r,100));}assert.equal(JSON.parse(await fs.readFile(settingsPath,'utf8')).features.manager.media,true);checks++;
 // A policy change in another owner session must not discard this native edit.
 const ready=page.waitForResponse(r=>r.url().endsWith('/api/keystatic/features')&&r.status()===200);await page.goto(origin+'/keystatic/singleton/siteConfig');await ready;
 await page.getByRole('checkbox',{name:'开放媒体管理',exact:true}).waitFor();await page.waitForFunction(()=>!document.body.textContent.includes('正在核验本站已保存的功能设置'));
 const field=base.scope==='features'?page.getByRole('checkbox',{name:'开放站点视觉',exact:true}):page.getByLabel('强调色 #RRGGBB',{exact:true});if(base.scope==='features')await field.uncheck();else await field.fill('#123456');
 const unchanged=async()=>base.scope==='features'?assert.equal(await field.isChecked(),false):assert.equal(await field.inputValue(),'#123456');
 const external=JSON.parse(await fs.readFile(settingsPath,'utf8'));external.features.manager.media=false;await fs.writeFile(settingsPath,JSON.stringify(external));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'更新配置入口',exact:true}).first().waitFor();await unchanged();
 await page.getByRole('button',{name:'更新配置入口',exact:true}).first().click();await page.getByRole('dialog',{name:'更新配置入口'}).waitFor();await page.getByRole('button',{name:'返回继续编辑',exact:true}).click();await unchanged();assert.equal(await page.getByRole('dialog',{name:'更新配置入口'}).isVisible(),false);checks++;
 // Save the actual parameter through the native API before continuing navigation.
 const saved=async()=>{const c=JSON.parse(await fs.readFile(settingsPath,'utf8'));return base.scope==='features'?c.features.manager.visuals===false:c.design.accentColor==='#123456';};
 await page.getByRole('button',{name:'Save',exact:true}).click();for(let i=0;i<50;i++){if(await saved())break;await new Promise(r=>setTimeout(r,100));}assert.ok(await saved());checks++;
 const discovery=JSON.parse(await fs.readFile(settingsPath,'utf8'));discovery.features.aiDiscovery.enabled=false;await fs.writeFile(settingsPath,JSON.stringify(discovery));await page.goto(origin+'/keystatic/singleton/aiSeo');await page.getByRole('heading',{name:'此功能暂未开放'}).waitFor();checks++;
 for(const theme of ['light','dark'])for(const width of [1440,390]){await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(origin+'/keystatic/singleton/siteConfig');await page.getByRole('checkbox',{name:'开放媒体管理',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,`assembly-${theme}-${width}.png`),fullPage:true});checks++;}
 policyUnavailable=true;await page.goto(origin+'/keystatic/singleton/imagePool');await page.getByRole('heading',{name:'此功能暂未开放'}).waitFor();assert.match(await page.locator('body').innerText(),/暂时无法核验/);checks++;
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'result.json'),JSON.stringify({checks,nativeWrites,featureReads,cloudWrites:'NONE',scope:'REAL_CORE_UI_API_READER_LOCAL_ONLY'},null,2));console.log(JSON.stringify({passed:checks,nativeWrites,output,cloudWrites:'NONE'}));
}catch(e){await fs.writeFile(path.join(output,'failure.txt'),String(e.stack));throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
