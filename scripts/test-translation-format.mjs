import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createReader} from '@keystatic/core/reader';
import YAML from 'yaml';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'.sandbox/translation-format'),{recursive:true});
const out=await mkdtemp(resolve(root,'.sandbox/translation-format/test-'));
async function compile(entry,name,plugins=[]){const target=resolve(out,name+'.mjs');await build({entryPoints:[resolve(root,entry)],outfile:target,bundle:true,packages:'external',platform:'node',format:'esm',define:{'import.meta.env':'{"PROD":true}'},plugins,logLevel:'error'});return import(pathToFileURL(target).href);}
const config=(await compile('keystatic.config.ts','config')).default;
const split=source=>{const match=source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);return {data:YAML.parse(match[1]),body:source.slice(match[0].length)};};
for(const portal of ['manager','keystatic'])test(`${portal} actual article/product save or approval keeps text dates and reopens in Keystatic`,async()=>{
  const env={PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/customer',MANAGER_DISPATCH_TOKEN:'fixture'};
  const api=await compile(`src/pages/api/${portal==='manager'?'manager/ai':'ai'}/drafts.ts`,portal,[{name:'isolated-saves',setup(builder){
    builder.onResolve({filter:/lib\/manager\/access$/},()=>({path:'access',namespace:'fixture'}));
    builder.onResolve({filter:/^astro:content$/},()=>({path:'content',namespace:'fixture'}));
    builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='access'?`export const getRuntimeEnv=()=>(${JSON.stringify(env)});export const requireManagerAccess=()=>({email:'editor@example.test'});`:args.path==='content'?'export const getCollection=async()=>[];':'export const env={};'}));
  }}]);
  for(const [type,collection] of [['blog','blogTranslations'],['product','productTranslations']]){
    let data,body='Fixture body with a useful paragraph.\n';
    for(const file of await readdir(resolve(root,'src/content',collection))){
      if(!file.endsWith('.mdoc')||file.includes('placeholder'))continue;
      const candidate=split(await readFile(resolve(root,'src/content',collection,file),'utf8'));
      if(candidate.data.sourceSlug&&candidate.data.locale){({data,body}=candidate);break;}
    }
    data={...(data||{title:'Fixture translation',sourceSlug:'fixture-source',sourceTitle:'Fixture source',locale:'es',published:false,description:'Fixture description',...(type==='blog'?{category:'Guides'}:{categoryName:'Products',series:'',applications:[],specs:[],specTables:[],highlights:[],faqs:[]})}),generatedAt:'2026-10-22T00:00:00.000Z'};
    if(portal==='keystatic')data.published=false;
    const id=`${data.locale}--${data.sourceSlug}`,path=`src/content/${collection}/${id}.mdoc`;
    const source=`---\n${YAML.stringify(data,{defaultStringType:'QUOTE_DOUBLE'})}---\n${body}`;
    let written='';const originalFetch=globalThis.fetch;
    globalThis.fetch=async(url,options={})=>{
      const address=String(url);
      if(address==='https://api.github.com/user')return Response.json({login:'fixture-editor'});
      if(address==='https://api.github.com/repos/fixture/customer/collaborators/fixture-editor/permission')return Response.json({permission:'write'});
      if(address==='https://api.github.com/repos/fixture/customer/git/ref/heads/main')return Response.json({object:{sha:'a'.repeat(40)}});
      if(address==='https://api.github.com/repos/fixture/customer/git/commits/'+'a'.repeat(40))return Response.json({tree:{sha:'b'.repeat(40)}});
      if(address==='https://api.github.com/repos/fixture/customer/git/blobs'){written=JSON.parse(options.body).content;return Response.json({sha:'c'.repeat(40)});}
      if(address==='https://api.github.com/repos/fixture/customer/git/trees')return Response.json({sha:'d'.repeat(40)});
      if(address==='https://api.github.com/repos/fixture/customer/git/commits')return Response.json({sha:'e'.repeat(40)});
      if(address==='https://api.github.com/repos/fixture/customer/git/refs/heads/main'){assert.equal(JSON.parse(options.body).force,false);return Response.json({});}
      assert.ok(address.startsWith('https://api.github.com/repos/fixture/customer/contents/'+path),address);
      if(options.method==='PUT'){const payload=JSON.parse(options.body);assert.equal(payload.sha,'a'.repeat(40));assert.equal(payload.branch,'main');written=Buffer.from(payload.content,'base64').toString('utf8');return Response.json({content:{sha:'b'.repeat(40)}});}
      return Response.json({encoding:'base64',sha:'a'.repeat(40),content:Buffer.from(source).toString('base64')});
    };
    try{
      const response=await (portal==='manager'?api.PUT:api.PATCH)({locals:{env},request:new Request('https://fixture.test/api/'+portal+'/drafts',{method:portal==='manager'?'PUT':'PATCH',headers:{'content-type':'application/json',cookie:'keystatic-gh-access-token=fixture'},body:JSON.stringify(portal==='manager'?{type,draftSlug:id,data:{title:data.title},body}:{type,drafts:[id]})})});
      assert.equal(response.status,200,await response.text());
    }finally{globalThis.fetch=originalFetch;}
    assert.ok(written);assert.deepEqual(split(written).data,portal==='keystatic'?{...data,published:true}:data);assert.equal(split(written).body,body);
    const fixture=resolve(out,portal,type);await mkdir(resolve(fixture,'src/content',collection),{recursive:true});await writeFile(resolve(fixture,path),written);
    const opened=await createReader(fixture,config).collections[collection].read(id);assert.ok(opened);assert.equal(opened.generatedAt,data.generatedAt);
  }
});
