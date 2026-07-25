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
    return new Response('草稿库未连接，请联系站长检查后台配置。', {
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
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all<BlogDraftRecord>();

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      drafts: (drafts.results || []).map(blogDraftToResponse),
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
    return new Response('草稿库未连接，请联系站长检查后台配置。', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  let payload;
  let requestedId = '';

  try {
    const body = (await request.json()) as { id?: string; payload?: unknown };
    requestedId = String(body.id || '').trim();
    payload = normalizeBlogDraftPayload(body.payload);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad blog draft payload.', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (requestedId && !/^blog-[a-z0-9-]+-[a-z0-9]+$/.test(requestedId)) {
    return new Response('Bad blog draft id.', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await ensureManagerSchema(db);
  const now = new Date().toISOString();
  const id = requestedId || createBlogDraftId(payload.blogSlug);
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
        updated_at = excluded.updated_at`
    )
    .bind(id, payload.blogSlug, payload.title, payloadJson, access.email, access.email, now, now)
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

  return new Response(JSON.stringify({ draft: record ? blogDraftToResponse(record) : null }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
