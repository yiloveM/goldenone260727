import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../../lib/manager/access';
import {
  blogDraftToResponse,
  ensureManagerSchema,
  getManagerDb,
  type BlogDraftRecord,
} from '../../../../../lib/manager/d1';
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

const WORKFLOW_FILE = 'manager-apply-blog-draft.yml';

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
  if (!/^blog-[a-z0-9-]+-[a-z0-9]+$/.test(draftId)) {
    return new Response('文章草稿信息不正确，请重新打开后重试。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const db = getManagerDb(env);
  if (!db) {
    return new Response('内容草稿服务暂时不可用，请稍后重试。', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const dispatchToken = getDispatchToken(env, 'manager');
  if (!dispatchToken) {
    return new Response('内容更新服务暂时不可用，请稍后重试。', {
      status: 500,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await ensureManagerSchema(db);
  const record = await db
    .prepare(
      `SELECT id, blog_slug, blog_title, payload_json, status, created_by, updated_by,
        created_at, updated_at, applied_at, workflow_request_id, workflow_url
       FROM manager_blog_drafts
       WHERE id = ?`
    )
    .bind(draftId)
    .first<BlogDraftRecord>();

  if (!record) {
    return new Response('找不到这条文章草稿。', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);
  const requestId = createRequestId('manager-blog');
  const actionsUrl = workflowRunsUrl(repoFullName, WORKFLOW_FILE);

  try {
    await dispatchWorkflow({
      accessToken: dispatchToken,
      repoFullName,
      branch,
      workflowFile: WORKFLOW_FILE,
      inputs: {
        requestId,
        draftId,
        blogSlug: record.blog_slug,
        payload: toBase64(record.payload_json),
      },
      userAgent: 'businessweb-manager-content-portal',
    });
  } catch (error) {
    void githubErrorText(error);
    return new Response('提交内容更新失败，请稍后重试。', {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await db
    .prepare(
      `UPDATE manager_blog_drafts
       SET status = 'queued',
        updated_by = ?,
        updated_at = ?,
        workflow_request_id = ?,
        workflow_url = ?
       WHERE id = ?`
    )
    .bind(access.email, new Date().toISOString(), requestId, actionsUrl, draftId)
    .run();

  return new Response(
    JSON.stringify({
      ok: true,
      requestId,
      draft: blogDraftToResponse({ ...record, status: 'queued', workflow_request_id: requestId, workflow_url: actionsUrl }),
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};
