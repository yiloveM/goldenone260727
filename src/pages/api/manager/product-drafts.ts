import { reconcileDraftRecords, deleteDraftRecordRoute, canEditDraftRecord } from '../../../lib/manager/draft-records';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import productEditorSettings from '../../../data/product-editor-settings.json';
import { enforceProductEditorPolicy, productDraftReviewFields, retainUneditedProductReviews } from '../../../lib/product-editor.mjs';
import { reviewSystemEnabled } from '../../../data/customerReviews';
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
       ORDER BY CASE WHEN status = 'applied' THEN 1 ELSE 0 END, updated_at DESC
       LIMIT 50`
    )
    .all<ProductDraftRecord>();

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      drafts: (await reconcileDraftRecords(db, 'product', drafts.results || [], env)).map(productDraftToResponse),
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
    const input = body.payload as { productSlug?: string } | undefined;
    const product = (await getCollection('products')).find(item => item.id.replace(/\.mdoc$/, '') === input?.productSlug);
    payload = normalizeProductDraftPayload(productDraftReviewFields(
      enforceProductEditorPolicy(body.payload, productEditorSettings, product?.data), reviewSystemEnabled,
    ));
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
  const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1 || 0)).toISOString();
  const id = requestedId || createDraftId(payload.productSlug);
  if (requestedId && !await canEditDraftRecord(db,'product',requestedId,expectedUpdatedAt)) return new Response('草稿已更新或任务执行中，请刷新。',{status:409});
  if (requestedId) {
    const previous = await db.prepare('SELECT payload_json FROM manager_product_drafts WHERE id = ? AND product_slug = ?')
      .bind(id, payload.productSlug).first<{ payload_json: string }>();
    if (previous && JSON.parse(previous.payload_json).managerOrderBatch) return new Response('请在产品排序中整批管理这组草稿。', { status: 409 });
    if (previous) payload = retainUneditedProductReviews(payload, JSON.parse(previous.payload_json));
  }
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
        updated_at = excluded.updated_at
       WHERE manager_product_drafts.updated_at = ? AND manager_product_drafts.status NOT IN ('queued','dispatching','running')`
    )
    .bind(id, payload.productSlug, payload.title, payloadJson, access.email, access.email, now, now, expectedUpdatedAt)
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

  if (record?.updated_at !== now) return new Response('草稿已变化，请刷新后重试。',{status:409});
  return new Response(JSON.stringify({ draft: record ? productDraftToResponse(record) : null }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const DELETE: APIRoute = ({locals,request}) => deleteDraftRecordRoute(locals,request,'product');
