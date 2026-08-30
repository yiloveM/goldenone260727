import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import {
  createDraftId,
  ensureManagerSchema,
  getManagerDb,
  normalizeProductDraftPayload,
  productDraftToResponse,
  type ProductDraftRecord,
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
      `SELECT id, product_slug, product_title, payload_json, status, created_by, updated_by,
        created_at, updated_at, applied_at, workflow_request_id, workflow_url
       FROM manager_product_drafts
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all<ProductDraftRecord>();

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      drafts: (drafts.results || []).map(productDraftToResponse),
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

  try {
    const body = (await request.json()) as { id?: string; payload?: unknown };
    requestedId = String(body.id || '').trim();
    payload = normalizeProductDraftPayload(body.payload);
  } catch (error) {
    void error;
    return new Response('产品草稿内容不完整，请检查后重试。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (requestedId && !/^product-[a-z0-9-]+-[a-z0-9]+$/.test(requestedId)) {
    return new Response('产品草稿信息不正确，请重新打开后重试。', {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await ensureManagerSchema(db);
  const now = new Date().toISOString();
  const id = requestedId || createDraftId(payload.productSlug);
  const payloadJson = JSON.stringify(payload);

  await db
    .prepare(
      `INSERT INTO manager_product_drafts
        (id, product_slug, product_title, payload_json, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        product_slug = excluded.product_slug,
        product_title = excluded.product_title,
        payload_json = excluded.payload_json,
        status = 'draft',
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at`
    )
    .bind(id, payload.productSlug, payload.title, payloadJson, access.email, access.email, now, now)
    .run();

  const record = await db
    .prepare(
      `SELECT id, product_slug, product_title, payload_json, status, created_by, updated_by,
        created_at, updated_at, applied_at, workflow_request_id, workflow_url
       FROM manager_product_drafts
       WHERE id = ?`
    )
    .bind(id)
    .first<ProductDraftRecord>();

  return new Response(JSON.stringify({ draft: record ? productDraftToResponse(record) : null }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
