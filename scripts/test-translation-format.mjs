import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createReader} from '@keystatic/core/reader';
import YAML from 'yaml';
import {canonicalArticleCategory} from '../src/lib/article-categories.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'.sandbox/translation-format'),{recursive:true});
const out=await mkdtemp(resolve(root,'.sandbox/translation-format/test-'));
async function compile(entry,name,plugins=[]){const target=resolve(out,name+'.mjs');await build({entryPoints:[resolve(root,entry)],outfile:target,bundle:true,packages:'external',platform:'node',format:'esm',define:{'import.meta.env':'{"PROD":true}'},plugins,logLevel:'error'});return import(pathToFileURL(target).href);}
const config=(await compile('keystatic.config.ts','config')).default;
const split=source=>{const match=source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);return {data:YAML.parse(match[1]),body:source.slice(match[0].length)};};
for(const portal of ['manager','keystatic'])test(portal+' real article/product writer preserves types and links and reopens in Keystatic',async()=>{
 const env={PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/customer',MANAGER_DISPATCH_TOKEN:'fixture'};
 const api=await compile('src/pages/api/'+(portal==='manager'?'manager/ai':'ai')+'/drafts.ts',portal,[{name:'isolated-saves',setup(b){
  b.onResolve({filter:/lib\/manager\/access$/},()=>({path:'access',namespace:'fixture'}));
  b.onResolve({filter:/^virtual:site-build-identity$/},()=>({path:'identity',namespace:'fixture'}));
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='access'?'export const getRuntimeEnv=()=>('+JSON.stringify(env)+');export const requireManagerAccess=()=>({email:"editor@example.test"});':args.path==='identity'?'export default {commit:"",files:{}};':'export const env={};'}));
 }}]);
 for(const [type,collection] of [['blog','blogTranslations'],['product','productTranslations']]){
  let data;
  for(const file of await readdir(resolve(root,'src/content',collection))){if(file.endsWith('.mdoc')&&!file.includes('placeholder')){data=split(await readFile(resolve(root,'src/content',collection,file),'utf8')).data;if(data.sourceSlug&&data.locale)break;}}
  data ||= {title:'Fixture translation',sourceSlug:'fixture-source',sourceTitle:'Fixture source',locale:'es',published:false,description:'Fixture description',...(type==='blog'?{category:'technical-articles'}:{categoryName:'Products',series:'',applications:[],specs:[],specTables:[],highlights:[],faqs:[]})};
  data={...data,published:false,generatedAt:'2026-10-22T00:00:00.000Z',...(type==='blog'?{category:canonicalArticleCategory(data.category)}:{})};
  const body='Useful [**product**](/products/part.html) and [contact](mailto:buyer@example.com).\n',id=data.locale+'--'+data.sourceSlug,path='src/content/'+collection+'/'+id+'.mdoc',head='a'.repeat(40),sha=(type==='blog'?'b':'7').repeat(40);
  const sourceSha=(type==='blog'?'c':'8').repeat(40),settingsSha=(type==='blog'?'d':'9').repeat(40),localesSha=(type==='blog'?'e':'0').repeat(40);
  const documents={
   [sha]:'---\n'+YAML.stringify(data,{defaultStringType:'QUOTE_DOUBLE'})+'---\n'+body,
   [sourceSha]:'---\ntitle: Source\npublished: true\ncategory: '+(type==='blog'?data.category:'Products')+'\n---\nSource\n',
   [settingsSha]:JSON.stringify({enabledLocales:{[data.locale]:true}}),
   [localesSha]:JSON.stringify({requiredPhraseKeys:['a'],requiredFaqCount:1,locales:{[data.locale]:{approved:true,phrases:{a:'ready'},faqs:[{question:'Q',answer:'A'}]}}})
  };
  const languageSha=(type==='blog'?'2':'3').repeat(40);documents[languageSha]="export const supportedLocales = ['en','"+data.locale+"'] as const;";
  const paths={'src/data/i18n.ts':languageSha,[path]:sha,['src/content/'+(type==='blog'?'blog':'products')+'/'+data.sourceSlug+'.mdoc']:sourceSha,'src/data/site-language-settings.json':settingsSha,'src/data/site-locales.json':localesSha};
  let written='',original=globalThis.fetch;
  globalThis.fetch=async(input,options={})=>{
   const url=new URL(input),payload=options.body?JSON.parse(options.body):{};
   if(url.pathname==='/user')return Response.json({login:'fixture-editor'});
   if(url.pathname.endsWith('/permission'))return Response.json({permission:'write'});
   if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}});
   if(url.pathname.includes('/git/trees/'))return Response.json({sha:head,tree:Object.entries(paths).map(([path,sha])=>({path,sha,type:'blob'}))});
   if(url.pathname.includes('/git/blobs/'))return Response.json({encoding:'base64',content:Buffer.from(documents[url.pathname.split('/').at(-1)]).toString('base64')});
   if(url.pathname.endsWith('/site-publish.yml/runs'))return Response.json({workflow_runs:[]});
   if(url.pathname.endsWith('/git/trees')){assert.equal(payload.tree.length,1);assert.equal(payload.tree[0].path,path);written=payload.tree[0].content;return Response.json({sha:'f'.repeat(40)});}
   if(url.pathname.endsWith('/git/commits'))return Response.json({sha:'1'.repeat(40)});
   if(url.pathname.endsWith('/git/refs/heads/main')){assert.equal(payload.force,false);return Response.json({});}
   throw new Error('Unexpected fixture request '+url.pathname);
  };
  try{
   const url=new URL('https://fixture.test/api/'+portal+'/drafts'),save=portal==='manager';
   const response=await (save?api.PUT:api.PATCH)({locals:{env},url,request:new Request(url,{method:save?'PUT':'PATCH',headers:{'content-type':'application/json',cookie:'keystatic-gh-access-token=fixture'},body:JSON.stringify(save?{type,draftSlug:id,sourceSha:sha,data:{title:data.title},body}:{type,drafts:[{draftSlug:id,sourceSha:sha}]})})});
   assert.equal(response.status,200,await response.text());
  }finally{globalThis.fetch=original;}
  assert.ok(written);assert.deepEqual(split(written).data,portal==='keystatic'?{...data,published:true}:data);assert.equal(split(written).body,body);
  const fixture=resolve(out,portal,type);await mkdir(resolve(fixture,'src/content',collection),{recursive:true});await writeFile(resolve(fixture,path),written);
  const opened=await createReader(fixture,config).collections[collection].read(id);assert.ok(opened);assert.equal(opened.generatedAt,data.generatedAt);
 }
});
