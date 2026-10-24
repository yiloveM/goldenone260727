import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateMediaRegistry,mediaPathJsonSchema,publicRegistryUrl,publicHostname,safeRegistryPath,entryMatches } from './media-path-registry.mjs';
import { checkMediaReferences,probeMedia,auditMediaPaths,collectMediaReferences,onlineMediaSamples } from './audit-media-paths.mjs';

const base='https://assets.businessmedia.com';
const entry=()=>({id:'product-media',category:'product',delivery:'r2-public',baseUrl:base,authority:'PUBLIC_R2_ASSET_BASE_URL',pathPrefix:'products/',purpose:'Product galleries and detail figures',references:[{path:'src/content/products/item.mdoc',field:'image/galleryImages/detailImages'}],lastVerifiedAt:null,verification:{sourceCommit:'a'.repeat(40),coverage:'source-only',result:'unverified',samples:[]}});
const registry=()=>({schemaVersion:1,repository:'customer/site',entries:[entry()]});
const temp=path.resolve('Temp/media-path-tests');fs.mkdirSync(temp,{recursive:true});

test('strict protocol and generated JSON Schema stay aligned',()=>{
  assert.deepEqual(mediaPathJsonSchema(),JSON.parse(fs.readFileSync('docs/schemas/media-paths.schema.json','utf8')));
  assert.equal(validateMediaRegistry(registry()).entries.length,1);
  assert.throws(()=>validateMediaRegistry({...registry(),secret:'never accepted'}));
  assert.throws(()=>validateMediaRegistry({...registry(),entries:[entry(),entry()]}));
  assert.throws(()=>validateMediaRegistry({...registry(),schemaVersion:2}));
});
test('verification cannot invent a dated pass or outside sample',()=>{
  for(const update of [{lastVerifiedAt:'2026-10-24T00:00:00Z'},{verification:{...entry().verification,result:'pass'}},{references:[{path:'../client/wrangler.toml',field:'image'}]},{authority:'SITE_URL'}])assert.throws(()=>validateMediaRegistry({...registry(),entries:[{...entry(),...update}]}));
  const proof={...entry(),lastVerifiedAt:'2026-10-24T00:00:00Z',verification:{...entry().verification,coverage:'sampled-http',result:'pass',samples:[{url:base+'/products/a.webp',httpStatus:200,contentType:'text/html'}]}};
  assert.throws(()=>validateMediaRegistry({...registry(),entries:[proof]}));
  proof.verification.samples[0].contentType='image/webp';assert.doesNotThrow(()=>validateMediaRegistry({...registry(),entries:[proof]}));
  proof.verification.samples[0].url='https://other.businessmedia.com/products/a.webp';assert.throws(()=>validateMediaRegistry({...registry(),entries:[proof]}));
});
test('URLs and paths reject private hosts, traversal, userinfo and credentials',()=>{
  for(const value of ['http://public.com/a.jpg','https://localhost/a.jpg','https://127.0.0.1/a.jpg','https://0x7f000001/a.jpg','https://[::1]/a.jpg','https://169.254.169.254/a.jpg','https://user:pass@public.com/a.jpg','https://public.com/a/../b.jpg','https://public.com/%252e%252e/a.jpg','https://public.com/a.jpg?token=secret','https://public.com/a.jpg#private','//public.com/a.jpg'])assert.equal(publicRegistryUrl(value),null,value);
  for(const value of ['../data','/absolute','C:/file','a/../../b','a\\b','%252e%252e/file'])assert.equal(safeRegistryPath(value),false);
  assert.ok(publicRegistryUrl(base+'/Banner/MODEL%20A.webp?w=800'));
  assert.equal(publicHostname('2606:4700:20::681a:abcd'),true);
  assert.equal(publicHostname('::ffff:127.0.0.1'),false);
});
test('category, case and path boundaries prevent accidental cross-site matching',()=>{
  assert.ok(entryMatches(entry(),base+'/products/a.webp','product'));
  assert.equal(entryMatches(entry(),base+'/products-other/a.webp','product'),false);
  assert.equal(entryMatches(entry(),base+'/Products/a.webp','product'),false);
  assert.equal(entryMatches(entry(),base+'/products/a.webp','banner'),false);
  assert.equal(entryMatches(entry(),'https://another.businessmedia.com/products/a.webp','product'),false);
});
test('real reference changes are detected without deletion or source mutation',()=>{
  const folder=fs.mkdtempSync(path.join(temp,'references-'));fs.mkdirSync(path.join(folder,'src/content/products'),{recursive:true});fs.writeFileSync(path.join(folder,'src/content/products/item.mdoc'),'fixture');
  const reference={value:base+'/products/a.webp',raw:'/r2/products/a.webp',source:'src/content/products/item.mdoc',field:'image',category:'product',state:'draft'};
  const inventory={references:[reference]};const vars={PUBLIC_R2_ASSET_BASE_URL:base};
  assert.deepEqual(checkMediaReferences(registry(),inventory,vars,'https://site.businessmedia.com',folder).errors,[]);
  assert.ok(checkMediaReferences(registry(),{references:[{...reference,category:'new-category'}]},vars,'https://site.businessmedia.com',folder).errors.length);
  assert.ok(checkMediaReferences(registry(),inventory,{PUBLIC_R2_ASSET_BASE_URL:'https://other.businessmedia.com'},'https://site.businessmedia.com',folder).errors.length);
  assert.equal(checkMediaReferences(registry(),{references:[]},vars,'https://site.businessmedia.com',folder).unused[0].action,'REVIEW_ONLY_NOT_DELETION');
  assert.equal(fs.readFileSync(path.join(folder,'src/content/products/item.mdoc'),'utf8'),'fixture');
});
test('saved drafts, detail images and native JSON media are conserved; unused catalog not presumed active',async()=>{
  const folder=fs.mkdtempSync(path.join(temp,'sources-'));fs.mkdirSync(path.join(folder,'src/content/products'),{recursive:true});fs.mkdirSync(path.join(folder,'src/content/blog'),{recursive:true});fs.mkdirSync(path.join(folder,'src/data'),{recursive:true});
  fs.writeFileSync(path.join(folder,'src/content/products/item.mdoc'),'\uFEFF---\npublished: false\nimage: /r2/products/a.webp\ngalleryImages: [/r2/products/b.webp]\ndetailImages:\n  - image: /r2/products/c.webp\n    title: Technical figure\n    caption: Keep this unit 10mm\n---\n![Original](/r2/products/d.webp)\n');
  fs.writeFileSync(path.join(folder,'src/content/blog/native.json'),JSON.stringify({published:true,images:[{sourceUrl:base+'/articles/a.jpg'}],body:'<img src="/r2/articles/body.jpg">'}));
  fs.writeFileSync(path.join(folder,'src/data/product-media-catalog.json'),JSON.stringify({media:[{publicUrl:base+'/unselected/archive.jpg'}]}));
  fs.writeFileSync(path.join(folder,'src/data/catalog-downloads.json'),JSON.stringify({enabled:false,documents:[]}));
  const inventory=await collectMediaReferences(folder,{PUBLIC_R2_ASSET_BASE_URL:base},'https://site.businessmedia.com');
  assert.equal(inventory.references.filter(ref=>ref.category==='product').length,4);
  assert.ok(inventory.references.filter(ref=>ref.category==='product').every(ref=>ref.state==='draft'));
  assert.equal(inventory.references.filter(ref=>ref.category==='blog').length,2);
  assert.equal(inventory.references.some(ref=>ref.value.includes('unselected')),false);
  assert.equal(inventory.cleanupAllowed,false);
});
test('network probes are explicit, bounded, credential-free and never follow redirects',async()=>{
  let calls=0;const dns=async()=>[{address:'93.184.216.34',family:4}];
  const fetcher=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.ok(options.dispatcher);assert.equal(options.headers.range,'bytes=0-511');return new Response(Buffer.from('524946460c0000005745425056503820','hex'),{status:206,headers:{'content-type':'image/webp'}});};
  assert.equal((await probeMedia(base+'/products/a.webp',[base],fetcher,dns)).passed,true);
  assert.equal(calls,1);
  await assert.rejects(probeMedia(base+'/products/a.webp',[base],fetcher,async()=>[{address:'10.0.0.1',family:4}]));assert.equal(calls,1);
  const redirect=async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/admin','content-type':'text/html'}});
  assert.equal((await probeMedia(base+'/products/a.webp',[base],redirect,dns)).passed,false);
  const spa=async()=>new Response('<!doctype html><html>SPA</html>',{headers:{'content-type':'image/webp'}});
  assert.equal((await probeMedia(base+'/products/a.webp',[base],spa,dns)).passed,false);
});

test('legacy enabled-only and static catalogues stay protected even if JSON claims direct',async()=>{
  for(const withEnabled of [true,false]){
    const folder=fs.mkdtempSync(path.join(temp,'protected-downloads-'));fs.mkdirSync(path.join(folder,'src/data'),{recursive:true});fs.mkdirSync(path.join(folder,'src/pages'),{recursive:true});
    const url=base+'/catalogue.pdf';fs.writeFileSync(path.join(folder,'src/data/catalog-downloads.json'),JSON.stringify({enabled:true,mode:'direct',documents:[{url}]}));
    fs.writeFileSync(path.join(folder,'src/data/catalogDownloads.ts'),`${withEnabled?'export const catalogDownloadsEnabled=true;':''}export const catalogDownloads=[{url:${JSON.stringify(url)}}];`);
    fs.writeFileSync(path.join(folder,'src/pages/example.astro'),`<a href="${url}">Historical literal</a>`);
    const inventory=await collectMediaReferences(folder,{PUBLIC_R2_ASSET_BASE_URL:base},'https://site.businessmedia.com');
    assert.equal(inventory.references.some(ref=>ref.value===url),false);assert.equal(inventory.protectedReferences.length,1);assert.equal(inventory.protectedReferences[0].value,url);assert.equal(onlineMediaSamples({entries:[{...entry(),category:'download',pathPrefix:'catalogue.pdf'}]},inventory).values.length,0);assert.equal(inventory.cleanupAllowed,false);
  }
});

test('public catalogue scope follows the actual direct-mode consumer instead of stale JSON flags',async()=>{
  const folder=fs.mkdtempSync(path.join(temp,'direct-downloads-'));fs.mkdirSync(path.join(folder,'src/data'),{recursive:true});const url=base+'/catalogue.pdf';
  fs.writeFileSync(path.join(folder,'src/data/catalog-downloads.json'),JSON.stringify({enabled:false,mode:'protected',documents:[{url:base+'/private-old.pdf'}]}));
  fs.writeFileSync(path.join(folder,'src/data/catalogDownloads.ts'),`export const catalogDownloadMode='direct';export const catalogDownloads=[{url:${JSON.stringify(url)}}];`);
  const inventory=await collectMediaReferences(folder,{PUBLIC_R2_ASSET_BASE_URL:base},'https://site.businessmedia.com');assert.deepEqual(inventory.references.map(r=>r.value),[url]);assert.deepEqual(inventory.protectedReferences,[]);
});
test('existing CSS asset imports are not confused with public R2 paths or browser traversal URLs',async()=>{
  const folder=fs.mkdtempSync(path.join(temp,'css-'));fs.mkdirSync(path.join(folder,'src/styles'),{recursive:true});fs.mkdirSync(path.join(folder,'node_modules/flags'),{recursive:true});fs.writeFileSync(path.join(folder,'node_modules/flags/en.svg'),'<svg/>');fs.writeFileSync(path.join(folder,'src/styles/flags.css'),'a{background:url("../../node_modules/flags/en.svg")}b{background:url("/r2/company/banner.webp")}');
  const inventory=await collectMediaReferences(folder,{PUBLIC_R2_ASSET_BASE_URL:base},originForCss());
  assert.equal(inventory.buildManagedAssets.length,1);assert.equal(inventory.references.length,1);assert.equal(inventory.references[0].value,base+'/company/banner.webp');
});
function originForCss(){return 'https://site.businessmedia.com';}
test('unreviewed and translated records protect references but never become automatic public probe targets',()=>{
  const ref={value:base+'/products/a.webp',category:'product',state:'draft',source:'src/content/products/item.mdoc'};
  assert.deepEqual(onlineMediaSamples(registry(),{references:[ref]}),{values:[],unprobedEntries:['product-media']});
  assert.deepEqual(onlineMediaSamples(registry(),{references:[{...ref,state:'source-published',source:'src/content/productTranslations/es--item.mdoc'}]}).values,[]);
  assert.deepEqual(onlineMediaSamples(registry(),{references:[{...ref,state:'source-published'}]}).values,[ref.value]);
});
test('current repository registry is independently bound and all recognized uses are registered',async()=>{
  const result=await auditMediaPaths(process.cwd()),local=JSON.parse(fs.readFileSync('docs/media-paths.json','utf8'));
  assert.equal(result.repository,local.repository);assert.deepEqual(result.errors,[]);
  assert.equal(result.status,local.repository==='ironstraight/businessweb'?'TEMPLATE_EMPTY':'SOURCE_CHECKED');
  if(local.repository==='ironstraight/businessweb')assert.equal(local.entries.length,0);else assert.ok(local.entries.length>0);
});

test('production build entry runs the readonly registry check first',()=>{const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));assert.ok(pkg.scripts.build.startsWith('node scripts/audit-media-paths.mjs && '));assert.ok(pkg.scripts.build.includes('verified-build'));});
