import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const output=resolve('.sandbox/manager-record-tests');await mkdir(output,{recursive:true});
await build({entryPoints:['src/lib/manager/draft-records.ts','src/lib/manager/d1.ts'],outdir:output,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'isolated-access',setup(b){
  b.onResolve({filter:/^(cloudflare:workers|\.\/access)$/},args=>({path:args.path,namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='cloudflare:workers'?'export const env={};':'export const getRuntimeEnv=locals=>locals.env;export const requireManagerAccess=(request,env)=>env.denied?{response:new Response("Unauthorized",{status:401})}:{email:"fixture@example.test"};'}));
}}]});
const {deleteDraftRecordRoute,lockDraftRecord,reconcileDraftRecords}=await import(pathToFileURL(resolve(output,'draft-records.js')));
const {ensureManagerSchema}=await import(pathToFileURL(resolve(output,'d1.js')));
const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){const statement=sqlite.prepare(sql);const bound=values=>({async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};}});return {bind:(...values)=>bound(values),...bound([])};}};
await ensureManagerSchema(db);
const env={MANAGER_DB:db,PUBLIC_KEYSTATIC_GITHUB_REPO:'fixture/site',KEYSTATIC_GITHUB_BRANCH:'main',MANAGER_DISPATCH_TOKEN:'fixture'};
const date='2026-10-22T00:00:00.000Z';
function insert(kind,id,status='draft'){const slug=kind==='review'?'review_id':`${kind}_slug`,title=kind==='review'?'buyer_label':`${kind}_title`;sqlite.prepare(`INSERT INTO manager_${kind}_drafts(id,${slug},${title},payload_json,status,created_by,updated_by,created_at,updated_at)VALUES(?,?,?,'{}',?,'fixture','fixture',?,?)`).run(id,'fixture','Fixture',status,date,date);}
const request=records=>new Request('https://fixture.test/api/manager/product-drafts',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true,records})});
let checks=0;
for(const kind of ['product','blog','review']){
  const id=`${kind}-fixture-a`,queued=`${kind}-fixture-b`;insert(kind,id);insert(kind,queued,'queued');
  let response=await deleteDraftRecordRoute({env},request([{id,updatedAt:date},{id:queued,updatedAt:date}]),kind);assert.equal(response.status,409);assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM manager_${kind}_drafts`).get().n,2);checks++;
  response=await deleteDraftRecordRoute({env},request([{id,updatedAt:'stale'}]),kind);assert.equal(response.status,409);checks++;
  response=await deleteDraftRecordRoute({env},request([{id,updatedAt:date}]),kind);assert.equal(response.status,200);assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM manager_${kind}_drafts`).get().n,1);checks++;
  const lockId=`${kind}-fixture-c`;insert(kind,lockId);const record=sqlite.prepare(`SELECT * FROM manager_${kind}_drafts WHERE id=?`).get(lockId);
  assert.equal(await lockDraftRecord(db,kind,record,'editor','manager-fixture','https://github.com/fixture/site/actions'),true);assert.equal(await lockDraftRecord(db,kind,record,'editor','manager-again','url'),false);checks++;
  const batch=Array.from({length:100},(_,i)=>({id:`${kind}-bulk-${i}`,updatedAt:date}));for(const item of batch)insert(kind,item.id);
  const bounded={prepare(sql){const prepared=db.prepare(sql);return {...prepared,bind(...values){assert.ok(values.length<=100,'D1 binding budget');return prepared.bind(...values);}};}};
  response=await deleteDraftRecordRoute({env:{...env,MANAGER_DB:bounded}},request(batch),kind);assert.equal(response.status,200);assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM manager_${kind}_drafts WHERE id LIKE ?`).get(`${kind}-bulk-%`).n,0);checks++;
}
let response=await deleteDraftRecordRoute({env:{...env,denied:true}},request([{id:'product-fixture-b',updatedAt:date}]),'product');assert.equal(response.status,401);checks++;
const originalFetch=globalThis.fetch;let jobsMode='success';
globalThis.fetch=async url=>{
  if(String(url).includes('/actions/workflows/'))return Response.json({workflow_runs:[{id:7,head_branch:'main',event:'workflow_dispatch',display_title:'Apply / manager-fixture',status:'completed',conclusion:'success',html_url:'https://github.com/fixture/site/actions/runs/7'}]});
  if(String(url).includes('/actions/runs/7/jobs'))return Response.json({total_count:1,jobs:[{status:'completed',conclusion:'success',completed_at:date,steps:[{name:'Apply product draft',conclusion:'success'},{name:'Commit product draft changes',conclusion:jobsMode}]}]});
  throw new Error('Unexpected external fixture request');
};
try{
  const record=sqlite.prepare('SELECT * FROM manager_product_drafts WHERE id=?').get('product-fixture-c');
  let reconciled=await reconcileDraftRecords(db,'product',[record],env);
  if(reconciled[0].status!=='applied')throw new Error('Fixture token does not match manager token contract or receipt was not accepted.');
  assert.equal(reconciled[0].status,'applied');assert.equal(reconciled[0].updated_at,record.updated_at);checks++;
  response=await deleteDraftRecordRoute({env},request([{id:record.id,updatedAt:record.updated_at}]),'product');assert.equal(response.status,200);checks++;
  const many=Array.from({length:40},(_,i)=>({id:`product-budget-${i}`,requestId:`manager-budget-${i}`}));
  for(const item of many){insert('product',item.id,'queued');sqlite.prepare('UPDATE manager_product_drafts SET workflow_request_id=? WHERE id=?').run(item.requestId,item.id);}
  let calls=0;
  globalThis.fetch=async url=>{calls++;if(String(url).includes('/actions/workflows/'))return Response.json({workflow_runs:many.map((item,i)=>({id:i+100,head_branch:'main',display_title:`Apply / ${item.requestId}`,status:'completed',conclusion:'success',html_url:'https://fixture.test/run'}))});return Response.json({total_count:1,jobs:[{status:'completed',conclusion:'success',completed_at:date,steps:[{name:'Apply product draft',conclusion:'success'},{name:'Commit product draft changes',conclusion:'success'}]}]});};
  const bounded=await reconcileDraftRecords(db,'product',many.map(item=>sqlite.prepare('SELECT * FROM manager_product_drafts WHERE id=?').get(item.id)),env);
  assert.equal(calls,17);assert.equal(bounded.filter(row=>row.status==='applied').length,16);assert.equal(bounded.filter(row=>row.status==='queued').length,24);checks++;
}finally{globalThis.fetch=originalFetch;sqlite.close();}
console.log(`PASS ${checks} actual SQLite record deletion, all-or-none CAS, queued locks, authorization and exact workflow receipt checks`);
