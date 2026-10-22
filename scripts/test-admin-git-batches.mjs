import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('.sandbox/admin-git-batches');await mkdir(out,{recursive:true});
await build({entryPoints:['src/lib/site-git.ts','src/lib/site-release.ts'],outdir:out,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'cloudflare-fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};'}));}}]});
const {readGitBlobs,commitGitFiles}=await import(pathToFileURL(resolve(out,'site-git.js')));
const {readSiteRelease}=await import(pathToFileURL(resolve(out,'site-release.js')));
const ctx={repo:'fixture/batches',branch:'main',token:'isolated'};
const shas=Array.from({length:468},(_,i)=>(i+1).toString(16).padStart(40,'0'));
let calls=[],broken=false,checks=0;
const original=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input),body=init.body?JSON.parse(init.body):{};calls.push({url:url.pathname,...init,body});
 if(url.pathname==='/graphql'){
  const repository={nameWithOwner:ctx.repo};for(const [key,sha] of Object.entries(body.variables))if(key.startsWith('s'))repository[`b${key.slice(1)}`]={oid:sha,text:sha,byteSize:40,isBinary:false,isTruncated:broken};
  return Response.json({data:{repository}});
 }
 if(url.pathname.endsWith('/git/trees'))return Response.json({sha:'b'.repeat(40)});
 if(url.pathname.endsWith('/git/commits'))return Response.json({sha:'c'.repeat(40)});
 if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'a'.repeat(40)}});
 if(url.pathname.endsWith('/git/refs/heads/main')){assert.equal(body.force,false);return Response.json({});}
 if(url.pathname.endsWith('/site-publish.yml/runs'))return Response.json({workflow_runs:Array.from({length:30},(_,i)=>({id:30-i,run_attempt:1,event:'push',head_branch:'main',head_sha:(30-i).toString(16).padStart(40,'0'),status:'completed',conclusion:'success',updated_at:`2026-10-${String(30-i).padStart(2,'0')}T05:00:00Z`}))});
 if(url.pathname.endsWith('/actions/runs/30/jobs'))return Response.json({total_count:1,jobs:[{status:'completed',conclusion:'success',steps:[{name:'Build the Astro site',conclusion:'success'},{name:'Deploy the production Worker and static assets',status:'completed',conclusion:'success',completed_at:'2026-10-30T04:59:00Z'}]}]});
 throw new Error('Unexpected request '+url.pathname);
};
try{
 const bodies=await readGitBlobs(ctx,shas);assert.equal(bodies.size,468);assert.equal(calls.length,8);checks++;
 await commitGitFiles(ctx,'a'.repeat(40),'d'.repeat(40),shas.map((sha,i)=>({path:`src/content/productTranslations/es--product-${i}.mdoc`,content:bodies.get(sha)})),'Isolated batch');
 assert.equal(calls.length,12);assert.equal(calls.filter(x=>x.url.endsWith('/git/trees'))[0].body.tree.length,468);assert.ok(calls.every(x=>!x.url.endsWith('/git/blobs')));checks++;
 broken=true;calls=[];await assert.rejects(()=>readGitBlobs(ctx,shas),/读取不完整/);assert.equal(calls.length,1);checks++;
 broken=false;calls=[];const release=await readSiteRelease(ctx);assert.equal(release.runId,30);assert.equal(calls.length,2);checks++;
 calls=[];assert.equal((await readSiteRelease(ctx)).runId,30);assert.equal(calls.length,1);checks++;
 console.log(JSON.stringify({passed:checks,records:468,maxRequests:12,cloudWrites:'NONE'}));
}finally{globalThis.fetch=original;}
