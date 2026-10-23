import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadWranglerVars} from './load-wrangler-vars.mjs';
const blob=value=>createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0${value}`).digest('hex');
const docs={
 'src/data/site-language-settings.json':JSON.stringify({enabledLocales:{es:true,de:false}}),
 'src/data/site-locales.json':JSON.stringify({requiredPhraseKeys:['a'],requiredFaqCount:1,locales:{es:{approved:true,phrases:{a:'ready'},faqs:[{question:'Q',answer:'A'}]}}}),
 'src/data/i18n.ts':"export const supportedLocales = ['en','es','de'] as const;",
 'src/content/blog/fixture.mdoc':'---\ntitle: Source article\ndescription: Description\npublished: true\ncategory: company-news\npublishDate: "2026-10-22T00:00:00Z"\n---\n[Part](/products/fixture/)\n',
 'src/content/products/fixture.mdoc':'---\ntitle: Source product\ncategory: Products\npublished: true\n---\nUseful product body.\n',
 'src/content/blogTranslations/es--fixture.mdoc':'---\ntitle: Artículo\nlocale: es\nsourceSlug: fixture\npublished: true\ncategory: other-articles\n---\n[Parte](/es/products/fixture/)\n',
 'src/content/productTranslations/es--fixture.mdoc':'---\ntitle: Producto\nlocale: es\nsourceSlug: fixture\npublished: true\n---\nDescripción.\n'
};
const files=Object.fromEntries(Object.entries(docs).map(([path,text])=>[path,blob(text)])),contents=Object.fromEntries(Object.entries(docs).map(([,text])=>[blob(text),text]));
const data={blog:[{id:'fixture.mdoc',data:{title:'Source article',category:'company-news',published:true,publishDate:new Date('2026-10-22')},body:'[Part](/products/fixture/)'}],products:[{id:'fixture.mdoc',data:{title:'Source product',description:'Product description',category:'Products',series:'',published:true,image:'',galleryImages:[],applications:[],specs:[],specTables:[],highlights:[],faqs:[],reviews:[]},body:'Useful product body.'}],blogTranslations:[]};
const metadata=Object.fromEntries(Object.entries(files).filter(([path])=>path.endsWith('.mdoc')).map(([path,sha])=>[path,{sha,data:path.includes('Translations')?{title:path.includes('blog')?'Artículo':'Producto',locale:'es',sourceSlug:'fixture',published:true,category:'other-articles'}:{title:'Source',published:true,category:path.includes('blog')?'company-news':'Products'}}]));
await mkdir('.sandbox/admin-catalog',{recursive:true});const out=await mkdtemp(resolve('.sandbox/admin-catalog/run-'));
await build({entryPoints:['src/lib/manager/article-catalog.ts','src/lib/manager/product-catalog.ts'],outdir:out,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify(loadWranglerVars(process.cwd()))},logLevel:'error',plugins:[{name:'isolated-catalog',setup(b){
 b.onLoad({filter:/[\\/]src[\\/]data[\\/]site-visuals\.ts$/},async args=>({loader:'ts',contents:(await readFile(args.path,'utf8')).replace("import.meta.glob('./site-visuals.json', { eager: true, import: 'default' })",JSON.stringify({'./site-visuals.json':JSON.parse(await readFile('src/data/site-visuals.json','utf8'))}))}));
 b.onResolve({filter:/^astro:content$/},()=>({path:'content',namespace:'fixture'}));b.onResolve({filter:/^virtual:site-build-identity$/},()=>({path:'identity',namespace:'fixture'}));b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='content'?`export const getCollection=async name=>(${JSON.stringify(data)})[name] || [];`:args.path==='identity'?`export default {commit:'',files:${JSON.stringify(metadata)}};`:'export const env={};'}));
 }}]});
const {readArticleCatalog}=await import(pathToFileURL(resolve(out,'article-catalog.js'))),{readProductCatalog}=await import(pathToFileURL(resolve(out,'product-catalog.js')));
const env={PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/catalog',KEYSTATIC_GITHUB_BRANCH:'main'},head='a'.repeat(40);let offline=false,checks=0;
const original=globalThis.fetch;globalThis.fetch=async(input)=>{
 if(offline)throw new Error('Isolated unavailable');const url=new URL(input);
 assert.ok(url.pathname.startsWith('/repos/fixture/catalog/'));
 if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}});
 if(url.pathname.includes('/git/trees/'))return Response.json({sha:head,tree:Object.entries(files).map(([path,sha])=>({path,sha,type:'blob'}))});
 if(url.pathname.includes('/git/blobs/'))return Response.json({encoding:'base64',content:Buffer.from(contents[url.pathname.split('/').at(-1)]).toString('base64')});
 if(url.pathname.endsWith('/site-publish.yml/runs'))return Response.json({workflow_runs:[{id:1,event:'push',head_branch:'main',head_sha:head,status:'completed',conclusion:'success'}]});
 if(url.pathname.endsWith('/actions/runs/1/jobs'))return Response.json({jobs:[{status:'completed',conclusion:'success',steps:[{name:'Build the Astro site',conclusion:'success'},{name:'Deploy the production Worker and static assets',status:'completed',conclusion:'success',completed_at:'2026-10-22T06:00:00Z'}]}]});
 throw new Error('Unexpected request '+url.pathname);
};
try{
 const articles=await readArticleCatalog(env,'fixture');assert.equal(articles.posts.length,1);const source=articles.posts[0];assert.equal(source.sourceSha,files['src/content/blog/fixture.mdoc']);assert.equal(source.translations.length,1);assert.equal(source.translations[0].category,'company-news');assert.equal(new URL(source.translations[0].publicUrl).pathname,'/es/blog/fixture/');checks++;
 const full=await readArticleCatalog(env,'fixture','fixture');assert.match(full.post.body,/\[Part\]/);checks++;
 const localized=await readArticleCatalog(env,'fixture','fixture','es');assert.match(localized.post.body,/\[Parte\]/);assert.equal(localized.post.category,'company-news');checks++;
 const products=await readProductCatalog(env,'fixture');assert.equal(products.products.length,1);assert.equal(products.translations.length,1);assert.equal(products.products[0].content,'Useful product body.');assert.equal(new URL(products.translations[0].publicUrl).pathname,'/es/products/fixture/');checks++;
 offline=true;assert.equal((await readArticleCatalog(env,'fixture')).posts.length,1);await assert.rejects(()=>readArticleCatalog(env,'fixture','fixture'));checks++;
 console.log(JSON.stringify({passed:checks,cloudWrites:'NONE',actualSiteRoutes:true}));
}finally{globalThis.fetch=original;}
