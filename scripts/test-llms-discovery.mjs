import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { generateDiscovery, fingerprint } from './llms-discovery/generate.mjs';
import { defaults, validateConfig, publicPath } from './llms-discovery/config.mjs';
import { readPage } from './llms-discovery/html.mjs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { pathToFileURL } from 'node:url';
import { createReader } from '@keystatic/core/reader';

const origin='https://fixture.example';
test('redirect and incomplete metadata pages are safely skipped by the real-route adapter',async()=>{
  const f=await fixture();f.manifest.discoverStructuredPages=true;
  const redirect='/retired/',incomplete='/incomplete/';f.routes.push(redirect,incomplete);
  await mkdir(dirname(file(f.root,redirect)),{recursive:true});await writeFile(file(f.root,redirect),'<!doctype html><meta http-equiv="refresh" content="0;url=/">');
  await mkdir(dirname(file(f.root,incomplete)),{recursive:true});await writeFile(file(f.root,incomplete),html(incomplete).replace(/<link rel="canonical"[^>]+>/,''));
  f.manifest.entries.push({path:incomplete,locale:'en',kind:'company',eligible:true});
  const report=await f.generate();assert.equal(report.skipped.canonical,1);assert.equal(await present(file(f.root,redirect+'index.md')),false);assert.equal(await present(file(f.root,incomplete+'index.md')),false);
  assert.equal(readPage('<!doctype html><title>Redirect</title>',origin).canonical,'');
});
const labels={products:'Products and services',categories:'Categories',articles:'Articles',company:'Company information',resources:'Technical resources',contact:'Business inquiries'};
const settings={...defaults,enabled:true,multilingual:true,markdown:true};
const html=(path,title='Precise model 20',lang='en',extra='',body='')=>`<!doctype html><html lang="${lang}"><head><title>${title}</title><meta name="description" content="Published information for commercial buyers: dimensions, models, units and project use."><link rel="canonical" href="${origin}${path}"><link rel="alternate" hreflang="en" href="${origin}/">${extra}</head><body><nav>Navigation only</nav><main><h1>${title}</h1><p>Model X20 operates at 2.5 MPa and 20 °C. The exact dimensions and source information are maintained by the business.</p>${body}<form>Private form values</form><script>alert(1)</script></main><footer>Footer only</footer></body></html>`;
const file=(root,path)=>resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
async function fixture(){
  await mkdir('.sandbox/llms-tests',{recursive:true});const root=await mkdtemp(resolve('.sandbox/llms-tests/run-'));
  const manifest={version:1,name:'Fixture Business',defaultLocale:'en',locales:[{code:'en',htmlLang:'en',root:'/',labels},{code:'es',htmlLang:'es',root:'/es/',labels}],entries:[{path:'/',locale:'en',kind:'company',eligible:true},{path:'/products/model.html',locale:'en',kind:'products',eligible:true},{path:'/es/products/model.html',locale:'es',kind:'products',eligible:true}]};
  const routes=manifest.entries.map(e=>e.path);
  for(const entry of manifest.entries){await mkdir(dirname(file(root,entry.path)),{recursive:true});await writeFile(file(root,entry.path),html(entry.path,entry.locale==='es'?'Modelo X20':'Model X20',entry.locale));}
  const generate=(config=settings)=>generateDiscovery({outputDir:root,manifest,routePaths:routes,settings:config,origin});
  return {root,manifest,routes,generate};
}
const present=async path=>{try{return (await stat(path)).isFile();}catch{return false;}};
test('v2 uses actual language titles, descriptions, scopes and live Markdown alternate resources',async()=>{
  const f=await fixture(),report=await f.generate();assert.equal(report.locales.length,2);assert.equal(report.markdown,3);
  const nav=await readFile(resolve(f.root,'es/llms.txt'),'utf8');assert.match(nav,/^# Fixture Business\n\n> /);assert.match(nav,/## Products and services/);assert.match(nav,/\[Modelo X20\].*https:\/\/fixture.example\/es\/products\/model.html.md/);assert.doesNotMatch(nav,/\[Model X20\]/);
  const page=await readFile(file(f.root,'/es/products/model.html'),'utf8');assert.match(page,/rel="describedby" href="\/es\/llms.txt"/);assert.match(page,/type="text\/markdown" href="\/es\/products\/model.html.md"/);assert.match(page,/rel="canonical" href="https:\/\/fixture.example\/es\/products\/model.html"/);assert.match(page,/hreflang="en"/);
  const md=await readFile(resolve(f.root,'es/products/model.html.md'),'utf8');assert.match(md,/2.5 MPa and 20 °C/);assert.doesNotMatch(md,/Navigation only|Footer only|Private form values|alert\(1\)/);
});
test('same data generates identical bytes, without duplicate discovery links',async()=>{
  const f=await fixture();await f.generate();const before=await readFile(resolve(f.root,'llms.txt'),'utf8'),page=await readFile(file(f.root,'/'),'utf8');
  await f.generate();assert.equal(await readFile(resolve(f.root,'llms.txt'),'utf8'),before);assert.equal(await readFile(file(f.root,'/'),'utf8'),page);
});
test('drafts, unpublished variants, noindex, wrong language, foreign canonical and unbuilt routes are excluded',async()=>{
  const f=await fixture();
  for(const [name,extra,lang] of [['noindex','<meta name="robots" content="noindex,follow">','en'],['language','','es'],['canonical','','en'],['draft','','en'],['missing','','en']]){
    const path=`/${name}.html`;f.manifest.entries.push({path,kind:'articles',locale:'en',eligible:name!=='draft'});
    if(name!=='missing'){f.routes.push(path);let body=html(path,name,lang,extra);if(name==='canonical')body=body.replace(origin+path,'https://another.example/x');await writeFile(file(f.root,path),body);}
  }
  await f.generate();const nav=await readFile(resolve(f.root,'llms.txt'),'utf8');for(const name of ['noindex','language','canonical','draft','missing'])assert.ok(!nav.includes(`/${name}.html`));
});
test('closed/unready or untranslatable languages cannot acquire entries from existing files',async()=>{
  const f=await fixture();f.manifest.locales=f.manifest.locales.filter(l=>l.code!=='es');f.manifest.entries.find(e=>e.locale==='es').eligible=false;
  await f.generate();assert.equal(await present(resolve(f.root,'es/llms.txt')),false);assert.equal(await present(resolve(f.root,'es/products/model.html.md')),false);
});
test('single-language mode, exact exclusions and type toggles follow current settings',async()=>{
  const f=await fixture();await f.generate({...settings,multilingual:false,excludePaths:['/products/model.html']});assert.equal(await present(resolve(f.root,'es/llms.txt')),false);assert.equal(await present(resolve(f.root,'products/model.html.md')),false);
  await f.generate({...settings,include:{...defaults.include,products:false}});assert.equal(await present(resolve(f.root,'products/model.html.md')),false);
});
test('OFF, empty and re-enable remove stale output and tags without deleting authoritative HTML',async()=>{
  const f=await fixture();await f.generate();await f.generate({...settings,enabled:false});
  for(const path of ['llms.txt','es/llms.txt','index.md','products/model.html.md'])assert.equal(await present(resolve(f.root,path)),false);
  assert.doesNotMatch(await readFile(file(f.root,'/'),'utf8'),/data-llms-discovery/);
  f.manifest.entries.forEach(e=>e.eligible=false);await f.generate();assert.equal(await present(resolve(f.root,'llms.txt')),false);
  f.manifest.entries.forEach(e=>e.eligible=true);await f.generate();assert.equal(await present(resolve(f.root,'llms.txt')),true);
});
test('add/edit/remove content is reflected by the next build source and actual route',async()=>{
  const f=await fixture();await f.generate();const path='/new.html';f.manifest.entries.push({path,locale:'en',kind:'articles',eligible:true});f.routes.push(path);await writeFile(file(f.root,path),html(path,'New article'));
  await f.generate();assert.match(await readFile(resolve(f.root,'llms.txt'),'utf8'),/New article/);
  await writeFile(file(f.root,path),html(path,'Edited article'));await f.generate();assert.match(await readFile(resolve(f.root,'llms.txt'),'utf8'),/Edited article/);
  f.routes.splice(f.routes.indexOf(path),1);await f.generate();assert.doesNotMatch(await readFile(resolve(f.root,'llms.txt'),'utf8'),/Edited article/);assert.equal(await present(resolve(f.root,'new.html.md')),false);
});
test('limits are deterministic, optional full text is bounded by complete sections',async()=>{
  const f=await fixture();await f.generate({...settings,maxEntries:1});assert.equal((await readFile(resolve(f.root,'llms.txt'),'utf8')).split('\n- ').length-1,1);
  await writeFile(file(f.root,'/'),' '+html('/','Big article','en','',`<p>${'A'.repeat(70000)}</p>`));
  const report=await f.generate({...settings,llmsFull:true,maxFullBytes:65536});assert.ok(report.limits.length);assert.ok((await stat(resolve(f.root,'llms-full.txt'))).size<=65536);
  await assert.rejects(()=>f.generate({...settings,llmsFull:true,markdown:false}),/requires Markdown/);
});
test('Markdown preserves tables, spanning headers, units, images and safe links; strips injection',()=>{
  const page=readPage(html('/','X','en','',`<table><tr><th>Pressure</th><th>Model</th></tr><tr><td>2.5 MPa</td><td>X20</td></tr></table><table><tr><th colspan="2" onclick="bad()">Dimensions</th></tr><tr><td>20 mm</td><td>30 mm</td></tr></table><a href="/real.html">Real link</a><a href="javascript:alert(1)">Unsafe</a><img src="https://cdn.example/x.webp" alt="X20"><iframe src="https://bad.example"></iframe>`),origin);
  assert.match(page.content,/\| 2.5 MPa \| X20 \|/);assert.match(page.content,/<th colspan="2">Dimensions<\/th>/);assert.match(page.content,/20 mm/);assert.match(page.content,/\[Real link\]\(<https:\/\/fixture.example\/real.html>\)/);assert.match(page.content,/cdn.example\/x.webp/);assert.doesNotMatch(page.content,/javascript:|onclick=|iframe|bad.example/);
});
test('escaped titles cannot inject links, headings or HTML',async()=>{
  const f=await fixture();await writeFile(file(f.root,'/'),html('/','[Injected] &lt;script&gt;','en'));await f.generate();assert.match(await readFile(resolve(f.root,'llms.txt'),'utf8'),/\\\[Injected\\\]/);
});
test('technical exponents, captions and real ordered steps retain meaning',()=>{
  const page=readPage(html('/','X','en','',`<p>Area: 20 mm<sup>2</sup>, H<sub>2</sub>O</p><ol start="3"><li>Check model</li><li>Check size</li></ol><table><caption>Reference values at 20 °C</caption><tr><th>Unit</th></tr><tr><td>MPa</td></tr></table>`),origin);
  assert.match(page.content,/20 mm<sup>2<\/sup>/);assert.match(page.content,/H<sub>2<\/sub>O/);assert.match(page.content,/3\. Check model\n4\. Check size/);assert.match(page.content,/Reference values at 20 °C/);
});
test('configuration refuses traversal, external URLs, private paths, unknown fields and wrong types',()=>{
  for(const value of ['//bad.example/a','/../secret','/%2e%2e/secret','/a\\secret','/api/private','/manager/','/page?x=1','/a#b'])assert.equal(publicPath(value),false,value);
  for(const value of [{enabled:'true'},{maxEntries:2001},{surprise:true},{excludePaths:['/../secret']},{include:{danger:true}},{summaries:[{locale:'es',text:'a'},{locale:'es',text:'b'}]}])assert.throws(()=>validateConfig(value));
  assert.equal(fingerprint(settings),fingerprint(JSON.parse(JSON.stringify(settings))));
});
test('cross-site canonical and conflicting record identity never mix customer data',async()=>{
  const f=await fixture();await writeFile(file(f.root,'/'),html('/').replace(origin+'/"','https://other.example/"'));await f.generate();assert.doesNotMatch(await readFile(resolve(f.root,'llms.txt'),'utf8'),/other.example/);
  f.manifest.entries.push({...f.manifest.entries[1],locale:'es'});await assert.rejects(()=>f.generate(),/Conflicting discovery identity/);
});
test('authored Markdown collision aborts rather than overwriting the file',async()=>{
  const f=await fixture();await writeFile(resolve(f.root,'index.md'),'Owner document');await assert.rejects(()=>f.generate(),/collides/);assert.equal(await readFile(resolve(f.root,'index.md'),'utf8'),'Owner document');
});
test('generic adapters discover core pages from built JSON-LD without inventing URLs or overriding CMS drafts',async()=>{
  const f=await fixture();f.manifest.discoverStructuredPages=true;
  for(const [path,type] of [['/business-inquiries/','ContactPage'],['/company/','AboutPage']]){
    f.routes.push(path);await mkdir(dirname(file(f.root,path)),{recursive:true});await writeFile(file(f.root,path),html(path,type,'en',`<script type="application/ld+json">{"@type":"${type}"}</script>`));
  }
  f.manifest.entries.push({path:'/company/',locale:'en',kind:'company',eligible:false});
  await f.generate();const nav=await readFile(resolve(f.root,'llms.txt'),'utf8');assert.match(nav,/business-inquiries\/index.md/);assert.doesNotMatch(nav,/company\/index.md/);
});
test('real Keystatic reader accepts settings and keeps new policy owner-only',async()=>{
  const f=await fixture(),out=resolve(f.root,'config.mjs');
  await build({entryPoints:['keystatic.config.ts'],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{"PROD":true}'},logLevel:'silent'});
  const {default:config}=await import(pathToFileURL(out));const source=await createReader(process.cwd(),config).singletons.aiSeo.read();
  assert.equal(typeof source.enabled,'boolean');assert.ok(config.ui.navigation['AI & SEO Settings'].includes('aiSeo'));if(config.singletons.articlePublisher)assert.ok(config.singletons.articlePublisher.path.includes('article-publisher-settings'));else assert.equal(config.ui.navigation['AI & SEO Settings'].includes('articlePublisher'),false);
});
test('real settings reader reopens ON/OFF/empty/re-enabled values and retains localized arrays',async()=>{
  const f=await fixture(),out=resolve(f.root,'settings-reader.mjs');
  await build({entryPoints:['keystatic.config.ts'],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{"PROD":true}'},logLevel:'silent'});
  const {default:config}=await import(pathToFileURL(out));await mkdir(resolve(f.root,'src/data'),{recursive:true});
  const states=[{...settings,summaries:[{locale:'es',text:'Información comercial verificada.'}],excludePaths:['/private-offer/']},{...settings,enabled:false},{...defaults},{...settings}];
  for(const state of states){await writeFile(resolve(f.root,'src/data/ai-seo-settings.json'),JSON.stringify(state));const reopened=await createReader(f.root,config).singletons.aiSeo.read();assert.equal(reopened.enabled,state.enabled);assert.equal(reopened.markdown,state.markdown);assert.deepEqual(reopened.summaries,state.summaries||[]);assert.deepEqual(reopened.excludePaths,state.excludePaths||[]);}
});
test('actual Workers ASSETS response never substitutes SPA HTML and has correct MIME/HEAD/OFF',async()=>{
  const code=await build({stdin:{contents:`import { discoveryResponse } from './src/lib/ai-discovery-response.ts';export default {async fetch(request){const u=new URL(request.url);return await discoveryResponse(request,{fetch:async()=>new Response(u.searchParams.has('spa')?'<!doctype html>Fallback':u.searchParams.has('authored')?'# Existing authored document\\n':u.pathname.endsWith('.md')?'<!-- businessweb-ai-discovery:v2 -->\\n<!-- discovery-scope:/es/llms.txt -->\\n# Model\\n':'# Site\\n')},{enabled:!u.searchParams.has('off'),markdown:true,llmsFull:false})||new Response('Other');}};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'neutral',logLevel:'silent'});
  const mf=new Miniflare({modules:true,script:code.outputFiles[0].text,compatibilityDate:'2026-05-15'});
  try{
    const md=await mf.dispatchFetch('http://localhost/es/model.html.md');assert.equal(md.status,200);assert.match(md.headers.get('content-type'),/^text\/markdown/);assert.match(md.headers.get('link'),/\/es\/llms.txt/);
    assert.match((await mf.dispatchFetch('http://localhost/llms.txt')).headers.get('content-type'),/^text\/plain/);
    assert.equal((await mf.dispatchFetch('http://localhost/model.md?spa')).status,404);assert.equal((await mf.dispatchFetch('http://localhost/model.md?off')).status,404);assert.equal((await mf.dispatchFetch('http://localhost/llms-full.txt')).status,404);
    const head=await mf.dispatchFetch('http://localhost/model.md',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    const authored=await mf.dispatchFetch('http://localhost/manual.md?authored&off');assert.equal(authored.status,200);assert.equal(await authored.text(),'# Existing authored document\n');
  }finally{await mf.dispose();}
});
test('status endpoint denies public/Manager access and detects saved settings awaiting release',async()=>{
  const f=await fixture(),out=resolve(f.root,'status.mjs');
  const portalHeader=(await readFile(resolve(process.cwd(),'src/lib/admin-portals.ts'),'utf8')).match(/export const ADMIN_PORTAL_HEADER = '([^']+)'/)[1];
  await build({entryPoints:['src/pages/api/keystatic/llms-status.ts'],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'cloudflare-fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};'}));}}]});
  const {GET}=await import(pathToFileURL(out));let assetReads=0;
  const env={KEYSTATIC_PORTAL_HOST:'owner.example',MANAGER_PORTAL_HOST:'editor.example',KEYSTATIC_PORTAL_UUID:'11111111-2222-4333-8444-555555555555',MANAGER_PORTAL_UUID:'66666666-7777-4888-8999-aaaaaaaaaaaa',PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/own',ASSETS:{fetch:async()=>{assetReads++;return globalThis.Response.json({enabled:true,configHash:fingerprint(settings),locales:[],limits:[],skipped:{}});}}};
  const context=(host,portal)=>({locals:{env},request:new Request(`https://${host}/api/keystatic/llms-status`,{headers:portal?{[portalHeader]:portal}:{}}),cookies:{get:()=>({value:'isolated'})}});
  assert.equal((await GET(context('public.example'))).status,404);assert.equal((await GET(context('editor.example','manager'))).status,404);assert.equal(assetReads,0);
  const original=globalThis.fetch;
  try{let current=settings;globalThis.fetch=async(url,init)=>{assert.match(url,/repos\/fixture\/own\/contents\/src\/data\/ai-seo-settings.json/);assert.equal(init.redirect,'manual');return globalThis.Response.json({encoding:'base64',content:Buffer.from(JSON.stringify(current)).toString('base64')});};
    const ready=await GET(context('owner.example','keystatic'));assert.equal(ready.status,200);assert.equal((await ready.json()).matchesCurrent,true);
    current={...settings,maxEntries:42};const pending=await GET(context('owner.example','keystatic'));assert.equal((await pending.json()).matchesCurrent,false);
  }finally{globalThis.fetch=original;}
});
