import { reconcileDraftRecords, deleteDraftRecordRoute, canEditDraftRecord } from '../../../lib/manager/draft-records';
import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import {
  blogDraftToResponse,
  createBlogDraftId,
  ensureManagerSchema,
  getManagerDb,
  normalizeBlogDraftPayload,
  type BlogDraftRecord,
} from '../../../lib/manager/d1';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const db = getManagerDb(env);
  if (!db) {
    return new Response('内容草稿服务暂时不可用，请稍后重试。', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await ensureManagerSchema(db);
  const drafts = await db
    .prepare(
      `SELECT id, blog_slug, blog_title, payload_json, status, created_by, updated_by,
        created_at, updated_at, applied_at, workflow_request_id, workflow_url
       FROM manager_blog_drafts
       ORDER BY CASE WHEN status = 'applied' THEN 1 ELSE 0 END, updated_at DESC
       LIMIT 50`
    )
    .all<BlogDraftRecord>();

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      drafts: (await reconcileDraftRecords(db, 'blog', drafts.results || [], env)).map(blogDraftToResponse),
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const db = getManagerDb(env);
  if (!db) {
    return new Response('内容草稿服务暂时不可用，请稍后重试。', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  let payload;
  let requestedId = '';
  let expectedUpdatedAt = '';

  try {
    const body = (await request.json()) as { id?: string; updatedAt?: string; payload?: unknown };
    requestedId = String(body.id || '').trim();
    expectedUpdatedAt = String(body.updatedAt || '');
    payload = normalizeBlogDraftPayload(body.payload);
  } catch (error) {
    void error;
    return new Response('文章草稿内容不完整，请检查后重试。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (requestedId && !/^blog-[a-z0-9-]+-[a-z0-9]+$/.test(requestedId)) {
    return new Response('文章草稿信息不正确，请重新打开后重试。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await ensureManagerSchema(db);
  const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1 || 0)).toISOString();
  const id = requestedId || createBlogDraftId(payload.blogSlug);
  if (requestedId && !await canEditDraftRecord(db,'blog',requestedId,expectedUpdatedAt)) return new Response('草稿已更新或任务执行中，请刷新。',{status:409});
  const payloadJson = JSON.stringify(payload);

  await db
    .prepare(
      `INSERT INTO manager_blog_drafts
        (id, blog_slug, blog_title, payload_json, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        blog_slug = excluded.blog_slug,
        blog_title = excluded.blog_title,
        payload_json = excluded.payload_json,
        status = 'draft',
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
       WHERE manager_blog_drafts.updated_at = ? AND manager_blog_drafts.status NOT IN ('queued','dispatching','running')`
    )
    .bind(id, payload.blogSlug, payload.title, payloadJson, access.email, access.email, now, now, expectedUpdatedAt)
    .run();

  const record = await db
    .prepare(
      `SELECT id, blog_slug, blog_title, payload_json, status, created_by, updated_by,
        created_at, updated_at, applied_at, workflow_request_id, workflow_url
       FROM manager_blog_drafts
       WHERE id = ?`
    )
    .bind(id)
    .first<BlogDraftRecord>();

  if (record?.updated_at !== now) return new Response('草稿已变化，请刷新后重试。',{status:409});
  return new Response(JSON.stringify({ draft: record ? blogDraftToResponse(record) : null }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const DELETE: APIRoute = ({locals,request}) => deleteDraftRecordRoute(locals,request,'blog');
