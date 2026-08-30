import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../../lib/manager/access';
import { ensureManagerSchema, getManagerDb, reviewDraftToResponse, type ReviewDraftRecord } from '../../../../../lib/manager/d1';
import {
  createRequestId,
  dispatchWorkflow,
  getBranch,
  getDispatchToken,
  getRepoFullName,
  githubErrorText,
  workflowRunsUrl,
} from '../../../../../lib/manager/github';

export const prerender = false;
const WORKFLOW_FILE = 'manager-apply-review-draft.yml';
const selectFields = `id, review_id, buyer_label, payload_json, status, created_by, updated_by,
  created_at, updated_at, applied_at, workflow_request_id, workflow_url`;
const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const POST: APIRoute = async ({ locals, request, params }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  const draftId = String(params.id || '').trim();
  if (!/^review-[a-z0-9-]+-[a-z0-9]+$/.test(draftId)) return new Response('评价草稿信息不正确，请重新打开后重试。', { status: 400 });
  const db = getManagerDb(env);
  if (!db) {
    return new Response('评价草稿服务暂时不可用，请稍后重试。', { status: 503 });
  }
  const token = getDispatchToken(env, 'manager');
  if (!token) {
    return new Response('评价更新服务暂时不可用，请稍后重试。', { status: 500 });
  }

  await ensureManagerSchema(db);
  const record = await db.prepare(`SELECT ${selectFields} FROM manager_review_drafts WHERE id = ?`).bind(draftId).first<ReviewDraftRecord>();
  if (!record) return new Response('找不到这条评价草稿。', { status: 404 });
  const repo = getRepoFullName(env);
  const branch = getBranch(env);
  const requestId = createRequestId('manager-review');
  const actionsUrl = workflowRunsUrl(repo, WORKFLOW_FILE);
  try {
    await dispatchWorkflow({
      accessToken: token,
      repoFullName: repo,
      branch,
      workflowFile: WORKFLOW_FILE,
      inputs: { requestId, draftId, reviewId: record.review_id, payload: toBase64(record.payload_json) },
      userAgent: 'businessweb-manager-review-portal',
    });
  } catch (error) {
    void githubErrorText(error);
    return new Response('提交评价更新失败，请稍后重试。', {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  await db.prepare(
    `UPDATE manager_review_drafts SET status = 'queued', updated_by = ?, updated_at = ?,
      workflow_request_id = ?, workflow_url = ? WHERE id = ?`
  ).bind(access.email, new Date().toISOString(), requestId, actionsUrl, draftId).run();
  return Response.json({
    ok: true,
    requestId,
    draft: reviewDraftToResponse({
      ...record,
      status: 'queued',
      workflow_request_id: requestId,
      workflow_url: actionsUrl,
    }),
  }, { headers: { 'cache-control': 'no-store' } });
};
