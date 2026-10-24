import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import YAML from 'yaml';
import {sitePolicyFixture} from './site-policy-test-fixture.mjs';
const parent=path.resolve('Temp/feature-access-tests');await fs.mkdir(parent,{recursive:true});const out=await fs.mkdtemp(path.join(parent,'run-'));
const internalHeader=(await fs.readFile('src/lib/admin-portals.ts','utf8')).match(/ADMIN_PORTAL_HEADER = '([^']+)'/)[1];
const derivationSalt=(await fs.readFile('src/lib/runtime-secret.ts','utf8')).match(/DERIVATION_SALT = encoder.encode\('([^']+)'\)/)[1];
const base=JSON.parse(await fs.readFile('src/data/site-config.json','utf8'));
base.locales.selected=['es','fr'];
const plugins=[sitePolicyFixture(base),{name:'platform-fixture-only',setup(b){
 b.onLoad({filter:/[\\/]data[\\/]site-visuals\.ts$/},async a=>({loader:'ts',contents:(await fs.readFile(a.path,'utf8')).replace(/const files\s*=.*?;\r?\n/,'const files={};\n')}));
 b.onResolve({filter:/^(astro:middleware|astro:content|virtual:site-build-identity|cloudflare:workers|@astrojs\/cloudflare\/entrypoints\/server)$/},a=>({path:a.path,namespace:'platform'}));
 b.onResolve({filter:/^\.\/pages\/api\/download$|^\.\/lib\/analytics\/capture$|^\.\/lib\/ai-discovery-response$/},a=>a.importer.endsWith('worker.ts')?{path:a.path,namespace:'platform'}:null);
 b.onLoad({filter:/.*/,namespace:'platform'},a=>({contents:a.path==='astro:middleware'?'export const defineMiddleware=x=>x;':a.path==='astro:content'?'export const getCollection=async()=>[];':a.path==='virtual:site-build-identity'?'export default {files:{}};':a.path==='cloudflare:workers'?'export const env={};':a.path.includes('entrypoints/server')?'export default {fetch:(...args)=>globalThis.__featureAstroFetch(...args)};':a.path.includes('analytics/capture')?'export const capturePublicPageView=async()=>{};':a.path.includes('ai-discovery')?'export const discoveryResponse=async()=>null;':'export const handleDownloadRequest=async()=>new Response("Fixture download");'}));
 }}];
await build({entryPoints:['src/middleware.ts','src/worker.ts','src/lib/draft-lifecycle.ts','src/lib/site-git.ts','src/pages/api/manager/content-preview.ts','src/pages/api/manager/features.ts','src/pages/api/keystatic/features.ts'],outdir:out,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({PROD:true,DEV:false,PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/site'})},plugins,logLevel:'error'});
const mod=async file=>import(pathToFileURL(path.join(out,file)));
const {onRequest}=await mod('middleware.js'),worker=(await mod('worker.js')).default,lifecycle=await mod('lib/draft-lifecycle.js'),git=await mod('lib/site-git.js'),preview=await mod('pages/api/manager/content-preview.js'),manager=await mod('pages/api/manager/features.js'),owner=await mod('pages/api/keystatic/features.js');
const hash=text=>createHash('sha1').update(text).digest('hex'),blob=text=>hash(`blob ${Buffer.byteLength(text)}\0${text}`),objects=new Map(),snapshots=new Map();let head='',sequence=0,gitWrites=0,sinkCalls=0,unavailable=false,reads=0;
const put=text=>{const sha=blob(text);objects.set(sha,text);return sha;};
const mdoc=data=>'---\n'+YAML.stringify(data)+'---\nRetained [link](/contact/)\n';
const files={
 'src/data/site-language-settings.json':put(JSON.stringify({enabledLocales:{es:true,fr:true}})),
 'src/data/site-locales.json':put(JSON.stringify({requiredPhraseKeys:[],requiredFaqCount:0,locales:{es:{approved:true,phrases:{},faqs:[]},fr:{approved:true,phrases:{},faqs:[]}}})),
 'src/content/blog/article.mdoc':put(mdoc({title:'Article',category:'technical-articles',published:true})),
 'src/content/blogTranslations/es--article.mdoc':put(mdoc({title:'Artículo',sourceSlug:'article',locale:'es',published:true,generatedAt:'2026-10-24T00:00:00Z'})),
 'src/content/blogTranslations/fr--article.mdoc':put(mdoc({title:'Brouillon',sourceSlug:'article',locale:'fr',published:false,generatedAt:'2026-10-24T00:00:00Z'})),
};
const deployed=hash('deployed');snapshots.set(deployed,{...files});delete snapshots.get(deployed)['src/content/blogTranslations/fr--article.mdoc'];
function save(c){const next={...(head?snapshots.get(head):files),'src/data/site-config.json':put(typeof c==='string'?c:JSON.stringify(c))};head=hash('head'+(++sequence));snapshots.set(head,next);return head;}
save(base);
let previewHead='';const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 reads++;if(unavailable)throw Error('Unavailable fixture');const url=new URL(input);assert.equal(url.origin,'https://api.github.com');assert.equal(init.redirect,'manual');const p=url.pathname.replace('/repos/fixture/site',''),body=init.body?JSON.parse(init.body):{};
 if(p==='/git/ref/heads/main')return Response.json({object:{sha:head}});
 if(p==='/git/ref/heads/preview/feature')return Response.json({object:{sha:previewHead}});
 if(p.startsWith('/git/trees/')&&!init.method){const values=snapshots.get(p.split('/').at(-1));assert.ok(values);return Response.json({sha:p.split('/').at(-1),tree:Object.entries(values).map(([path,sha])=>({path,sha,type:'blob'}))});}
 if(p.startsWith('/git/blobs/')){const value=objects.get(p.split('/').at(-1));assert.equal(typeof value,'string');return Response.json({encoding:'base64',content:Buffer.from(value).toString('base64')});}
 if(p==='/git/trees'&&init.method==='POST'){gitWrites++;const values={...snapshots.get(body.base_tree)};for(const row of body.tree){if(row.sha===null)delete values[row.path];else values[row.path]=row.content===undefined?row.sha:put(row.content);}const sha=hash('tree'+sequence+gitWrites);snapshots.set(sha,values);return Response.json({sha});}
 if(p==='/git/commits'&&init.method==='POST'){gitWrites++;const sha=hash('commit'+sequence+gitWrites);snapshots.set(sha,snapshots.get(body.tree));return Response.json({sha});}
 if(p==='/git/refs/heads/main'&&init.method==='PATCH'){gitWrites++;assert.equal(body.force,false);head=body.sha;return Response.json({object:{sha:head}});}
 if(p.includes('/actions/workflows/site-publish.yml/runs'))return Response.json({workflow_runs:[{id:1,head_branch:'main',head_sha:deployed,event:'push',status:'completed',conclusion:'success',updated_at:'2026-10-24T00:02:00Z'}]});
 if(p.includes('/actions/runs/1/jobs'))return Response.json({total_count:1,jobs:[{status:'completed',conclusion:'success',steps:[{name:'Build the Astro site',conclusion:'success'},{name:'Deploy the production Worker and static assets',status:'completed',conclusion:'success',completed_at:'2026-10-24T00:01:00Z'}]}]});
 throw Error('Unexpected feature fixture '+p);
};
const uuid='11111111-2222-4333-8444-555555555555',ownerUuid='22222222-2222-4333-8444-555555555555';
const env={PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/site',KEYSTATIC_GITHUB_BRANCH:'main',MANAGER_DISPATCH_TOKEN:'fixture-not-a-token',KEYSTATIC_PORTAL_HOST:'owner.fixture.test',KEYSTATIC_PORTAL_UUID:ownerUuid,MANAGER_PORTAL_HOST:'manager.fixture.test',MANAGER_PORTAL_UUID:uuid,KEYSTATIC_SECRET:'not-real-fixture-password-'.repeat(2),KEYSTATIC_GITHUB_CLIENT_SECRET:'not-real-fixture-root-'.repeat(2),PUBLIC_KEYSTATIC_GITHUB_APP_SLUG:'fixture-app'};
const request=(route,method='GET',role='manager',body)=>new Request('https://manager.fixture.test'+route,{method,headers:{[internalHeader]:role,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function invoke(route,method='GET',role='manager',handler=null,body){const req=request(route,method,role,body),ctx={request:req,url:new URL(req.url),locals:{env}};return onRequest(ctx,()=>handler?handler({...ctx}):(sinkCalls++,new Response('Allowed')));}
let checks=0;
try{
 for(const [route,method]of [['/api/manager/products','GET'],['/api/manager/blog-drafts','POST'],['/api/manager/r2/assets','POST'],['/api/manager/deploy/site','POST']]){const before=reads;assert.equal((await invoke(route,method,'')).status,403);assert.equal(reads,before);checks++;}
 const closed=structuredClone(base);for(const key of Object.keys(closed.features.manager))closed.features.manager[key]=false;closed.features.reviews.enabled=false;closed.features.managerAnalytics.visible=false;save(closed);
 for(const [route,method]of [['/api/manager/products','GET'],['/api/manager/product-drafts','POST'],['/api/manager/product-order','PATCH'],['/api/manager/product-deletion','DELETE'],['/api/manager/blog','GET'],['/api/manager/blog-drafts','POST'],['/api/manager/blog-deletion','DELETE'],['/api/manager/review-drafts','POST'],['/api/manager/site-visuals','PATCH'],['/api/manager/r2/assets','POST'],['/api/manager/ai/translations','POST'],['/api/manager/ai/translation-status','GET'],['/api/manager/deploy/site','POST']]){const before=sinkCalls;assert.equal((await invoke(route,method)).status,403,route);assert.equal(sinkCalls,before);checks++;}
 assert.equal((await invoke('/api/manager/deploy/site','GET')).status,200);checks++;
 assert.equal((await invoke('/api/manager/unknown','POST')).status,503);assert.equal(gitWrites,0);checks++;
 const response=await invoke('/api/manager/features','GET','manager',manager.GET),projection=await response.json();assert.equal(Object.keys(projection.features).length,11);assert.ok(!JSON.stringify(projection).includes('fixture/site'));checks++;
 assert.equal((await invoke('/api/keystatic/features','POST','manager')).status,404);assert.equal(owner.POST,undefined);checks++;
 const ownerEnv={...env};delete ownerEnv.MANAGER_DISPATCH_TOKEN;
 const ownerRead=async(query='')=>{const url=new URL('https://owner.fixture.test/api/keystatic/features'+query),req=new Request(url,{headers:{[internalHeader]:'keystatic',cookie:'keystatic-gh-access-token=fixture-owner-session'}});return owner.GET({request:req,url,locals:{env:ownerEnv}});};
 assert.equal((await ownerRead()).status,200);checks++;
 const priorReads=reads;assert.equal((await ownerRead('?branch=../main')).status,503);assert.equal(reads,priorReads);checks++;
 previewHead=hash('preview-policy');snapshots.set(previewHead,{...snapshots.get(head),'src/data/site-config.json':put(JSON.stringify(base))});assert.equal((await(await ownerRead('?branch=preview%2Ffeature')).json()).features.products,true);assert.equal((await(await ownerRead()).json()).features.products,false);checks++;
 unavailable=true;assert.equal((await invoke('/api/manager/products')).status,503);unavailable=false;save('{');assert.equal((await invoke('/api/manager/products')).status,503);checks++;
 const mixed=structuredClone(base);mixed.features.manager.products=false;save(mixed);let dbReads=0;env.MANAGER_DB={prepare(){dbReads++;throw Error('Disallowed table read');}};
 assert.equal((await invoke('/api/manager/content-preview?kind=product&id=draft-a&version=one','GET','manager',preview.GET)).status,403);assert.equal(dbReads,0);checks++;
 const translations=structuredClone(base);translations.features.manager.translations=false;save(translations);const ctx={repo:'fixture/site',branch:'main',token:'fixture'};
 const translatedRoute=async(method,query='',body)=>{const url=new URL('https://manager.fixture.test/api/manager/ai/drafts?type=blog&'+query);return lifecycle.translationDraftRoute(new Request(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),url,ctx,'manager');};
 let value=await(await translatedRoute('GET','scope=formal')).json();assert.deepEqual(value.drafts.map(d=>d.draftSlug),['es--article']);assert.equal(value.counts.pending,0);checks++;
 assert.equal((await translatedRoute('GET','scope=formal&draft=fr--article')).status,403);checks++;
 const before=gitWrites;assert.equal((await translatedRoute('PATCH','',{type:'blog',drafts:[{draftSlug:'fr--article',sourceSha:files['src/content/blogTranslations/fr--article.mdoc']}]})).status,403);assert.equal(gitWrites,before);checks++;
 value=await(await translatedRoute('GET','draft=es--article')).json();const formal=value.draft;const saved=await translatedRoute('PUT','',{type:'blog',draftSlug:formal.draftSlug,sourceSha:formal.sourceSha,data:{title:'Updated formal translation'},body:'Preserved link [Contact](/contact/)'});assert.equal(saved.status,200);assert.match(objects.get(snapshots.get(head)['src/content/blogTranslations/es--article.mdoc']),/Updated formal translation/);checks++;
 const state=await lifecycle.openDraftState(ctx);save(closed);const n=gitWrites;await assert.rejects(()=>git.commitGitFiles(ctx,state.head,state.tree.sha,[{path:'src/content/blog/article.mdoc',content:'blocked'}],'Stale'),/变化/);assert.equal(gitWrites,n);checks++;
 // The outer Worker really verifies a signed host-bound session and strips
 // spoofed internal headers before the real middleware/handler dispatch.
 const secretEnv={...env};delete secretEnv.MANAGER_DB;globalThis.__featureAstroFetch=async(req,runtime)=>onRequest({request:req,url:new URL(req.url),locals:{env:runtime}},()=>new Response('Allowed internal fixture'));
 const context={waitUntil(){},passThroughOnException(){}};
 const cookie=async(name,host)=>{const encoder=new TextEncoder(),root=await crypto.subtle.importKey('raw',encoder.encode(env.KEYSTATIC_GITHUB_CLIENT_SECRET),'HKDF',false,['deriveBits']),bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:encoder.encode(derivationSalt),info:encoder.encode('admin-portal-session')},root,256),derived=Buffer.from(bits).toString('base64url'),key=await crypto.subtle.importKey('raw',encoder.encode(derived+':'+env.KEYSTATIC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),expiry=Math.floor(Date.now()/1000)+60,sig=await crypto.subtle.sign('HMAC',key,encoder.encode(`v1|${name}|${host}|${expiry}`));return `__Host-businessweb-portal=v1.${name}.${expiry}.${Buffer.from(sig).toString('base64url')}`;};
 const signed=await cookie('manager','manager.fixture.test');
 for(const url of [`https://manager.fixture.test/${uuid}/api/manager/products`,`https://manager.fixture.test/${uuid}/analytics/`,`https://manager.fixture.test/${uuid}/reviews/`]){assert.equal((await worker.fetch(new Request(url,{headers:{cookie:signed}}),secretEnv,context)).status,403);checks++;}
 assert.equal((await worker.fetch(new Request(`https://manager.fixture.test/${uuid}/api/manager/products`,{headers:{[internalHeader]:'manager'}}),secretEnv,context)).status,404);checks++;
 assert.equal((await worker.fetch(new Request('https://public.fixture.test/api/manager/products',{headers:{cookie:signed,[internalHeader]:'manager'}}),secretEnv,context)).status,404);checks++;
 assert.equal((await worker.fetch(new Request(`https://manager.fixture.test/${ownerUuid}/api/manager/products`,{headers:{cookie:signed}}),secretEnv,context)).status,404);checks++;
 save(base);assert.equal((await invoke('/api/manager/products')).status,200);checks++;
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:checks,gitWrites,sinkCalls,reads,scope:'REAL_WORKER_AUTH_MIDDLEWARE_HANDLERS_MOCK_GIT_NO_CLOUD'},null,2));console.log(JSON.stringify({passed:checks,output:out,cloudWrites:'NONE'}));
}finally{globalThis.fetch=originalFetch;delete globalThis.__featureAstroFetch;}
