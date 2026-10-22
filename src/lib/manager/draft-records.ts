import { getManagerDb, ensureManagerSchema } from './d1';
import { getBranch, getDispatchToken, getRepoFullName, githubFetch } from './github';
import { getRuntimeEnv, requireManagerAccess } from './access';
import { mapGitItems } from '../site-git';
type Kind = 'product'|'blog'|'review';
export const recordBusy = (status:string) => ['queued','dispatching','running'].includes(status);
export async function reconcileDraftRecords(db:any,kind:Kind,records:any[],env:any) {
  if(!records.some(record=>recordBusy(record.status))) return records;
  const token=getDispatchToken(env),repo=getRepoFullName(env),branch=getBranch(env);
  if(!token) return records;
  try {
    const workflow=`manager-apply-${kind}-draft.yml`;
    const {workflow_runs:runs=[]}=await githubFetch<{workflow_runs:any[]}>(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100`,token);
    let inspected=0;
    return await mapGitItems(records,async record=>{
      if(!recordBusy(record.status)||!/^manager-[a-z0-9-]+$/.test(record.workflow_request_id||''))return record;
      const matching=runs.filter(run=>run.head_branch===branch && new RegExp(`(?:^|[^a-z0-9-])${record.workflow_request_id}(?=$|[^a-z0-9-])`,'i').test(run.display_title||run.name||''));
      if(matching.length!==1 || matching[0].status!=='completed')return record;
      // Reconcile in bounded batches so schema/read/CAS work and job reads
      // fit the existing Worker budgets. Unchecked records stay protected.
      if(inspected++>=16)return record;
      const run=matching[0];
      const {jobs=[],total_count=0}=await githubFetch<{jobs:any[];total_count?:number}>(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,token);
      if(total_count>jobs.length)return record;
      const steps=jobs.flatMap(job=>job.steps||[]);
      const success=run.conclusion==='success' && jobs.some(job=>job.conclusion==='success')
        && steps.some(step=>step.name===`Apply ${kind} draft`&&step.conclusion==='success')
        && steps.some(step=>step.name===`Commit ${kind} draft changes`&&step.conclusion==='success');
      if(run.conclusion==='success'&&!success)return record;
      const status=success?'applied':'failed',completed=jobs.find(job=>job.completed_at)?.completed_at||run.updated_at;
      const result=await db.prepare(`UPDATE manager_${kind}_drafts SET status = ?, applied_at = ?, workflow_url = ? WHERE id = ? AND status = ? AND updated_at = ? AND workflow_request_id = ?`)
        .bind(status,success?completed:null,run.html_url||record.workflow_url,record.id,record.status,record.updated_at,record.workflow_request_id).run();
      if(result.meta?.changes!==1)return await db.prepare(`SELECT * FROM manager_${kind}_drafts WHERE id = ?`).bind(record.id).first() || record;
      return {...record,status,applied_at:success?completed:null,workflow_url:run.html_url||record.workflow_url};
    });
  }catch {return records;}
}
export async function canEditDraftRecord(db:any,kind:Kind,id:string,expected:unknown) {
  const record=await db.prepare(`SELECT status, updated_at FROM manager_${kind}_drafts WHERE id = ?`).bind(id).first();
  return record && !recordBusy(record.status) && typeof expected==='string' && record.updated_at===expected;
}
export async function lockDraftRecord(db:any,kind:Kind,record:any,email:string,requestId:string,actionsUrl:string) {
  const now=new Date(Math.max(Date.now(), Date.parse(record.updated_at || '') + 1 || 0)).toISOString();
  const result=await db.prepare(`UPDATE manager_${kind}_drafts SET status = 'queued', updated_by = ?, updated_at = ?, workflow_request_id = ?, workflow_url = ? WHERE id = ? AND updated_at = ? AND status NOT IN ('queued','dispatching','running')`)
    .bind(email,now,requestId,actionsUrl,record.id,record.updated_at).run();
  return result.meta?.changes===1;
}
export async function markRejectedDispatch(db:any,kind:Kind,id:string,requestId:string,error:any) {
  // A network timeout may have dispatched successfully. Keep that request
  // protected until its exact workflow receipt is known.
  if(error?.status>=400&&error.status<500) await db.prepare(`UPDATE manager_${kind}_drafts SET status = 'failed' WHERE id = ? AND workflow_request_id = ? AND status = 'queued'`).bind(id,requestId).run();
}
export async function deleteDraftRecordRoute(locals:any,request:Request,kind:Kind) {
  const env=getRuntimeEnv(locals),access=requireManagerAccess(request,env);
  if(access.response)return access.response;
  const db=getManagerDb(env);
  if(!db)return new Response('工作草稿服务暂不可用。',{status:503});
  try {
    const payload=await request.json();
    const records=payload.records;
    if(payload.confirmed!==true||!Array.isArray(records)||!records.length||records.length>100) return new Response('请先核对要移除的工作草稿记录。',{status:400});
    const ids=new Set();
    for(const record of records) {
      if(!new RegExp(`^${kind}-[a-z0-9-]+-[a-z0-9]+$`).test(record?.id||'')||typeof record.updatedAt!=='string'||ids.has(record.id))return new Response('工作草稿选择信息已失效。',{status:400});
      ids.add(record.id);
    }
    await ensureManagerSchema(db);
    // One atomic SQL statement: either every selected non-running version still
    // matches, or none is removed. No schema changes or remote task cancellation.
    // Two bindings also support 100 selected records within D1's 100-parameter
    // limit. The same statement still validates the whole selection atomically.
    const query=`WITH selected AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.updatedAt') AS updated_at FROM json_each(?))
      DELETE FROM manager_${kind}_drafts WHERE (id,updated_at) IN (SELECT id,updated_at FROM selected)
      AND status NOT IN ('queued','dispatching','running') AND
      (SELECT COUNT(*) FROM manager_${kind}_drafts AS d JOIN selected AS s ON d.id=s.id AND d.updated_at=s.updated_at WHERE d.status NOT IN ('queued','dispatching','running')) = ?`;
    const result:any=await db.prepare(query).bind(JSON.stringify(records),records.length).run();
    if(result.meta?.changes!==records.length)return new Response('记录已变化或任务仍在执行，请刷新；本批未删除。',{status:409});
    return Response.json({removed:records.length,message:'工作记录已移除，正式网站内容保持。'},{headers:{'cache-control':'no-store'}});
  }catch {return new Response('无法移除工作草稿记录，请刷新后重试。',{status:502});}
}
