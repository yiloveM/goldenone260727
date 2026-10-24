import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import YAML from 'yaml';
import { build } from 'esbuild';
import { parse } from 'parse5';
import { chromium } from 'playwright';
import { publicMediaUrl } from '../src/lib/public-media-url.mjs';
import { adminMediaUrl } from '../src/lib/admin-media-url.mjs';
import { productPreviewMedia, renderProductPreviewMedia } from '../src/lib/product-preview-media.mjs';
import { installMedia } from '../src/scripts/manager/media.mjs';

fs.mkdirSync('Temp',{recursive:true});
const output=fs.mkdtempSync(path.resolve('Temp/media-preview-tests-'));
const origin='https://public.businessmedia.com',base='https://media.businessmedia.com';
const media=value=>publicMediaUrl(value,base,origin);
const images=html=>{const results=[];const walk=node=>{if(node.tagName==='img')results.push(Object.fromEntries(node.attrs.map(a=>[a.name,a.value])));for(const child of node.childNodes||[])walk(child);};walk(parse(html));return results;};

test('private editors resolve public static paths, R2 and explicit object keys without changing saved data',()=>{
  const raw='/images/product.webp';assert.equal(adminMediaUrl(raw,base,origin),origin+raw);assert.equal(raw,'/images/product.webp');
  assert.equal(adminMediaUrl('/r2/products/a.webp',base+'/r2',origin),base+'/r2/products/a.webp');
  assert.equal(adminMediaUrl('r2/products/a.webp',base+'/r2',origin,{objectKey:true}),base+'/r2/products/a.webp');
  assert.equal(adminMediaUrl('products/model a.webp',base,origin,{objectKey:true}),base+'/products/model%20a.webp');
  assert.equal(adminMediaUrl('/favicon.png',base,origin),origin+'/favicon.png');
  assert.equal(adminMediaUrl('/images/missing-origin.webp','',''),'');
  for(const raw of ['javascript:alert(1)','//untrusted.com/a.webp','/r2/../private','/r2/%252e%252e/private','https://user:pass@public.com/a.webp','data:image/svg+xml,<svg></svg>'])assert.equal(adminMediaUrl(raw,base,origin),'');
  const blob='blob:https://private.businessmedia.com/uuid';assert.equal(adminMediaUrl(blob,base,origin),'');assert.equal(adminMediaUrl(blob,base,origin,{temporary:true}),blob);
});
test('galleries preserve public cover order; complete detail groups retain duplicates, captions and escape text',()=>{
  const source={title:'Model "A"',image:'/r2/products/a.webp',galleryImages:['/r2/products/a.webp','/images/b.webp'],detailImages:[{image:'/r2/products/detail.jpg',title:'10mm <guide>',caption:'First line\n<script>bad()</script>'},{image:'/r2/products/detail.jpg',title:'Same figure, second use',caption:'Keep 20kg'}]};
  const before=structuredClone(source),value=productPreviewMedia(source,media),html=renderProductPreviewMedia(source,media);
  assert.deepEqual(value.gallery,[origin+'/images/b.webp']);assert.equal(value.details.length,2);assert.equal(images(html).length,4);assert.match(html,/10mm &lt;guide&gt;/);assert.match(html,/Keep 20kg/);assert.doesNotMatch(html,/<script>/);assert.equal(images(renderProductPreviewMedia(source,media,{includeCover:false})).length,3);assert.deepEqual(source,before);
  assert.equal(images(renderProductPreviewMedia({detailImages:source.detailImages},media)).length,2);
  assert.equal(images(renderProductPreviewMedia({detailImages:[{image:'javascript:bad'}]},media)).length,0);
});

const products=fs.readdirSync('src/content/products').filter(name=>name.endsWith('.mdoc')).map(name=>{
  const raw=fs.readFileSync('src/content/products/'+name,'utf8'),text=raw.replace(/^\uFEFF/,''),m=/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if(!m)throw Error('Invalid real product fixture: '+name);
  return {slug:name.slice(0,-5),raw,data:YAML.parse(m[1]),body:m[2]||''};
});
test('actual Manager thumbnail and enlarged-image consumer uses the public origin for every real static cover',()=>{
  const context={publicSiteOrigin:origin,publicR2AssetBaseUrl:base,escapeHtml:String};installMedia(context);
  for(const product of products.filter(item=>String(item.data.image||'').startsWith('/images/')))assert.equal(context.normalizeThumbnailUrl(product.data.image),origin+product.data.image);
  assert.equal(context.normalizeThumbnailUrl('/images/product.webp'),origin+'/images/product.webp');assert.match(context.thumbnailMarkup('/images/product.webp'),/referrerpolicy="no-referrer"/);
});
async function handler(relative) {
  const destination=path.join(output,relative.replace(/^src\/pages\/api\//,'').replace(/[/.]/g,'-')+'.mjs');
  await build({entryPoints:[relative],outfile:destination,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({PUBLIC_R2_ASSET_BASE_URL:base,SITE_URL:origin})},logLevel:'error',plugins:[{name:'isolated-handler-environment',setup(b){
    b.onResolve({filter:/^(?:astro:content|cloudflare:workers)$|\/lib\/(?:manager\/(?:access|d1|site-visuals|github)|runtime-env)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:
      args.path==='astro:content'?'export const getCollection=async name=>globalThis.__mediaPreviewCollections?.[name]||[];':
      args.path==='cloudflare:workers'?'export const env={};':
      args.path.endsWith('/runtime-env')?'export const getRuntimeEnv=locals=>locals.env;':
      args.path.endsWith('/access')?'export const getRuntimeEnv=locals=>locals.env;export const requireManagerAccess=(request,env)=>env.deny?{response:new Response("Login required",{status:401})}:{email:"fixture@local.invalid"};':
      args.path.endsWith('/d1')?'export const getManagerDb=env=>env.MANAGER_DB;export const ensureManagerSchema=async()=>{};':
      args.path.endsWith('/github')?'export const getDispatchToken=env=>env.DISPATCH||"";export const getRepoFullName=()=>"fixture/site";export const getBranch=()=>"main";export const encodeGitHubPath=value=>value;export const githubHeaders=()=>({});':
      'export const openVisualState=async()=>{throw Error("Unexpected visual branch")};export const managerVisualSlots=()=>[];'}));
  }}]});
  return (await import(pathToFileURL(destination))).GET;
}
test('real saved product handler renders every real gallery/detail, preserves version checks and refuses unauthorized requests',async()=>{
  const GET=await handler('src/pages/api/manager/content-preview.ts'),stamp='2026-10-24T00:00:00Z',results=[];
  for(const product of products){
    const db={prepare(sql){assert.match(sql,/^SELECT /);return{bind(){return{first:async()=>({payload_json:JSON.stringify({...product.data,productSlug:product.slug,content:product.body}),updated_at:stamp})};}};}};
    const url=new URL('https://private.businessmedia.com/api/manager/content-preview?'+new URLSearchParams({kind:'product',id:'product-'+product.slug,version:stamp})),env={MANAGER_DB:db,PUBLIC_R2_ASSET_BASE_URL:base};
    const context={locals:{env},request:new Request(url),url};const response=await GET(context);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
    const html=await response.text();assert.match(html,/<meta name="referrer" content="no-referrer">/);const actual=images(html),expected=productPreviewMedia(product.data,value=>publicMediaUrl(value,base,JSON.parse(fs.readFileSync('src/data/site-origin.json','utf8')).productionUrl||origin));
    for(const src of [expected.cover,...expected.gallery,...expected.details.map(item=>item.src)].filter(Boolean))assert.ok(actual.some(image=>image.src===src),product.slug+' lost '+src);
    for(const detail of expected.details)if(detail.caption)assert.ok(html.includes(String(detail.caption).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))));
    if(!product.data.image&&(product.data.detailImages||[]).length)assert.ok(actual.length>0,'detail-only product must show its own figures');
    assert.equal((await GET({...context,locals:{env:{...env,deny:true}}})).status,401);
    const changed=new URL(url);changed.searchParams.set('version','stale');assert.equal((await GET({...context,url:changed,request:new Request(changed)})).status,409);
    results.push({slug:product.slug,gallery:expected.gallery.length,details:expected.details.length,images:actual.length});
  }
  fs.writeFileSync(path.join(output,'real-products.json'),JSON.stringify({products:results,network:'NONE',cloudWrites:'NONE'},null,2));
});
test('both real translation preview handlers render source gallery/details and explain missing source',async()=>{
  const source=products.find(p=>(p.data.detailImages||[]).length)||products[0];assert.ok(source);
  const slug='es--'+source.slug,draft={title:'Translated product',description:'Review',sourceSlug:source.slug,locale:'es',applications:[],specs:[],specTables:[],highlights:[],faqs:[]},draftText='---\n'+YAML.stringify(draft)+'---\nTranslated body';
  globalThis.__mediaPreviewCollections={productTranslations:[{id:slug+'.mdoc',data:draft,body:'Translated body'}],products:[{id:source.slug+'.mdoc',data:source.data}]};
  const manager=await handler('src/pages/api/manager/ai/draft-preview.ts');
  const url=new URL('https://private.businessmedia.com/api/manager/ai/draft-preview?type=product&draft='+slug),context={locals:{env:{PUBLIC_R2_ASSET_BASE_URL:base}},request:new Request(url),url};
  const response=await manager(context);assert.equal(response.status,200);const managerHtml=await response.text();assert.match(managerHtml,/<meta name="referrer" content="no-referrer">/);assert.ok(images(managerHtml).length>=(source.data.detailImages||[]).length);
  globalThis.__mediaPreviewCollections.products=[];assert.equal((await manager(context)).status,503);assert.equal((await manager({...context,locals:{env:{deny:true}}})).status,401);
  const owner=await handler('src/pages/api/ai/draft-preview.ts'),originalFetch=globalThis.fetch;let missing=false,requests=0;
  globalThis.fetch=async(input,init)=>{requests++;assert.ok(!init?.method||init.method==='GET');const value=String(input);assert.ok(value.startsWith('https://api.github.com/'));if(value.endsWith('/user'))return Response.json({login:'fixture'});if(value.endsWith('/permission'))return Response.json({permission:'write'});if(value.includes('/productTranslations/'))return Response.json({encoding:'base64',content:Buffer.from(draftText).toString('base64')});if(value.includes('/products/'))return missing?new Response('',{status:404}):Response.json({encoding:'base64',content:Buffer.from(source.raw).toString('base64')});throw Error('Unexpected fixture request');};
  try{const request=new Request(url,{headers:{cookie:'keystatic-gh-access-token=fixture-token'}}),args={locals:{env:{PUBLIC_R2_ASSET_BASE_URL:base}},request,url};const result=await owner(args);assert.equal(result.status,200);const ownerHtml=await result.text();assert.match(ownerHtml,/<meta name="referrer" content="no-referrer">/);assert.ok(images(ownerHtml).length>=(source.data.detailImages||[]).length);missing=true;assert.equal((await owner(args)).status,503);assert.equal((await owner({...args,request:new Request(url)})).status,401);assert.ok(requests>0);}finally{globalThis.fetch=originalFetch;delete globalThis.__mediaPreviewCollections;}
});

test('actual Keystatic image field and Markdoc node load public-origin images without rewriting stored values in light/dark mobile/desktop',async()=>{
  const start=async server=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return'http://127.0.0.1:'+server.address().port;};
  const publicRequests=[],server=createServer((req,res)=>{publicRequests.push(req.url);if(req.headers.referer){res.writeHead(403,{'content-type':'text/html'});return res.end('<!doctype html>Untrusted referrer');}res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#138477"/></svg>');});const publicOrigin=await start(server);
  // Generated browser bytes are not project source. A visible Temp/*.js would
  // otherwise enter Astro's **/* allowJs type scan on the next full build.
  const widget=path.join(output,'image-widget.txt');
  await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{r2ImageUrlField}from'./src/keystatic/r2-image-url-field';import{r2MarkdocComponents}from'./src/keystatic/r2-markdoc-components';const field=r2ImageUrlField({label:'Image'});const Node=r2MarkdocComponents.r2Image.NodeView;function App(){const[value,setValue]=React.useState('/images/product.svg');return <><field.Input value={value} onChange={setValue}/><output id="stored">{value}</output><Node value={{src:'/r2/products/detail.svg',alt:'Original 10mm',caption:'Figure caption'}} onChange={()=>{}} onRemove={()=>{}} isSelected={false}/></>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},outfile:widget,bundle:true,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({PUBLIC_R2_ASSET_BASE_URL:publicOrigin+'/r2'})},logLevel:'error',plugins:[{name:'explicit-public-origin-fixture',setup(b){b.onLoad({filter:/[\\/]site-origin\.json$/},()=>({loader:'json',contents:JSON.stringify({productionUrl:publicOrigin,retiredHosts:[]})}));}}]});
  const privateRequests=[],portal=createServer((req,res)=>{privateRequests.push(req.url);if(req.url==='/widget.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(widget));}res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;color-scheme:light dark}</style><div id="root"></div><script type="module" src="/widget.js"></script>');});const privateOrigin=await start(portal);
  const executablePath=process.platform==='win32'?['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync):undefined;
  const browser=await chromium.launch({executablePath,headless:true,env:{...process.env,TEMP:output,TMP:output}});
  try{const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());const page=await context.newPage(),faults=[];page.on('pageerror',error=>faults.push(error.message));for(const theme of ['light','dark'])for(const width of [1280,390]){await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(privateOrigin);await page.waitForFunction(()=>document.querySelectorAll('img').length===2&&[...document.images].every(image=>image.naturalWidth>0));assert.equal(await page.locator('#stored').textContent(),'/images/product.svg');assert.ok((await page.locator('.r2-url-field img').getAttribute('src')).startsWith(publicOrigin+'/images/'));assert.ok((await page.locator('.r2-markdoc-image img').getAttribute('src')).startsWith(publicOrigin+'/r2/'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,`keystatic-images-${theme}-${width}.png`),fullPage:true});}assert.deepEqual(faults,[]);assert.ok(publicRequests.includes('/images/product.svg'));assert.ok(publicRequests.includes('/r2/products/detail.svg'));assert.equal(privateRequests.some(url=>url.startsWith('/images/')||url.startsWith('/r2/')),false);}finally{await browser.close();await new Promise(resolve=>portal.close(resolve));await new Promise(resolve=>server.close(resolve));}
});
