import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { ensureManagerSchema, getManagerDb } from '../../../lib/manager/d1';
import { managerVisualSlots, openVisualState, visualRecord, approveVisualDraft } from '../../../lib/manager/site-visuals';
import { mergeVisualPatch } from '../../../lib/site-visuals.mjs';
import { readSiteRelease } from '../../../lib/site-release';
import { readGitTree } from '../../../lib/site-git';
export const prerender = false;
const json = (value: any) => Response.json(value, { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
async function resources(locals: any, request: Request) {
  const env = getRuntimeEnv(locals), access = requireManagerAccess(request, env); if (access.response) return { response: access.response };
  const db: any = getManagerDb(env); if (!db) return { response: new Response('工作草稿暂时不可用。', { status: 503 }) };
  try { await ensureManagerSchema(db); } catch { return {response:new Response('工作草稿暂时无法连接，请稍后重试。',{status:503})}; } return { env, db, email: access.email, response: null };
}
const failure = (error: any) => new Response(error?.status === 409 ? error.message : '站点视觉暂时无法处理，请检查内容后重试。', { status: error?.status === 409 ? 409 : 400, headers: { 'cache-control': 'no-store' } });
export const GET: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const { env, db } = resource;
  try {
    const state = await openVisualState(env);
    await db!.prepare("UPDATE manager_site_visual_drafts SET status='applied', applied_at=CURRENT_TIMESTAMP WHERE status='queued' AND applied_content_sha=?").bind(state.sha).run();
    const rows = await db!.prepare('SELECT * FROM manager_site_visual_drafts ORDER BY updated_at DESC LIMIT 50').all();
    let deployedSha='',releaseKnown=false;
    if((rows.results||[]).some((row:any)=>row.status==='applied'))try{const release=await readSiteRelease(state.ctx);if(release.commit){const tree=await readGitTree(state.ctx,release.commit);deployedSha=tree.tree.find(item=>item.path==='src/data/site-visuals.json')?.sha||'';releaseKnown=true;}}catch{/* Unverified publication remains a visible pending record. */}
    // An older approved file is no longer pending once main has replaced it.
    // Keep that history distinct from proof that the exact file is now live.
    return json({ baseSha: state.sha, slots: managerVisualSlots(state), locales: state.policy.locales, primaryCta: { ...state.config.home.primaryCta, labels: state.config.home.primaryCta.labels.filter(item => state.policy.locales.includes(item.locale)) }, drafts: (rows.results || []).map((row:any)=>({...visualRecord(row),live:releaseKnown&&row.status==='applied'&&row.applied_content_sha===deployedSha,superseded:row.status==='applied'&&/^[a-f0-9]{40}$/.test(row.applied_content_sha||'')&&row.applied_content_sha!==state.sha&&row.applied_content_sha!==deployedSha,releaseKnown})) });
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const { env, db, email } = resource;
  try {
    if (Number(request.headers.get('content-length')) > 100000) return new Response('本次内容过多。', { status: 413 });
    const raw = await request.text(); if (raw.length > 100000) return new Response('本次内容过多。', { status: 413 });
    const body = JSON.parse(raw), state = await openVisualState(env);
    if (Object.keys(body).some(key => !['id', 'updatedAt', 'baseSha', 'payload'].includes(key))) return new Response('提交内容包含不允许的字段。', { status: 400 });
    if (body.baseSha !== state.sha) return new Response('正式内容已更新，请重新载入并核对。', { status: 409 });
    mergeVisualPatch(state.raw, body.payload, state.policy);
    const id = body.id || `visual-${crypto.randomUUID()}`, now = new Date().toISOString();
    if (!/^visual-[a-f0-9-]{36}$/.test(id)) return new Response('草稿信息不正确。', { status: 400 });
    if (body.id) {
      const result = await db!.prepare("UPDATE manager_site_visual_drafts SET payload_json=?, base_content_sha=?, status='draft', updated_by=?, updated_at=?, applied_at=NULL, applied_content_sha=NULL WHERE id=? AND updated_at=? AND base_content_sha=? AND status='draft'").bind(JSON.stringify(body.payload), state.sha, email, now, id, body.updatedAt || '', body.baseSha).run();
      if (result.meta?.changes !== 1) return new Response('草稿已更新或正在处理，请重新打开。', { status: 409 });
    } else await db!.prepare("INSERT INTO manager_site_visual_drafts (id,payload_json,base_content_sha,status,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,'draft',?,?,?,?)").bind(id, JSON.stringify(body.payload), state.sha, email, email, now, now).run();
    return json({ draft: visualRecord(await db!.prepare('SELECT * FROM manager_site_visual_drafts WHERE id=?').bind(id).first()) });
  } catch (error) { return failure(error); }
};
export const PATCH: APIRoute = async ({ locals, request }) => {
  const resource = await resources(locals, request); if (resource.response) return resource.response;
  const { env, db, email } = resource;
  try {
    const body = await request.json(); if (!/^visual-[a-f0-9-]{36}$/.test(body.id || '') || Object.keys(body).some(key => !['id', 'updatedAt'].includes(key))) return new Response('草稿信息不正确。', { status: 400 });
    const row = await db!.prepare('SELECT * FROM manager_site_visual_drafts WHERE id=?').bind(body.id).first(); if (!row) return new Response('找不到这条草稿。', { status: 404 });
    const result = await approveVisualDraft(db, await openVisualState(env), row, body.updatedAt, email!);
    return json({ ...result, message: '审核通过，等待发布网站更新。' });
  } catch (error) { return failure(error); }
};
export const DELETE: APIRoute = async ({locals,request})=>{
  const resource=await resources(locals,request);if(resource.response)return resource.response;
  try{const body=await request.json();if(body.confirmed!==true||!/^visual-[a-f0-9-]{36}$/.test(body.id||'')||typeof body.updatedAt!=='string')return new Response('请先核对要移除的草稿记录。',{status:400});
    const result=await resource.db.prepare("DELETE FROM manager_site_visual_drafts WHERE id=? AND updated_at=? AND status!='queued'").bind(body.id,body.updatedAt).run();
    if(result.meta?.changes!==1)return new Response('草稿已变化或仍在处理，记录未移除。',{status:409});return json({removed:1,message:'草稿记录已移除，正式图片与网站保持。'});
  }catch{return new Response('无法移除草稿记录，请重新载入后重试。',{status:400});}
};
