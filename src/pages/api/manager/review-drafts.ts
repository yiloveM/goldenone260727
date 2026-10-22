import { reconcileDraftRecords, deleteDraftRecordRoute, canEditDraftRecord } from '../../../lib/manager/draft-records';
import type { APIRoute } from 'astro';
import reviewData from '../../../data/customer-reviews.json';
import { allCustomerReviews, customerReviewSummary } from '../../../data/customerReviews';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import {
  createReviewDraftId,
  ensureManagerSchema,
  getManagerDb,
  normalizeReviewDraftPayload,
  reviewDraftToResponse,
  type ReviewDraftRecord,
} from '../../../lib/manager/d1';

export const prerender = false;
const selectFields = `id, review_id, buyer_label, payload_json, status, created_by, updated_by,
  created_at, updated_at, applied_at, workflow_request_id, workflow_url`;
const databaseUnavailable = () => new Response('评价草稿服务暂时不可用，请稍后重试。', { status: 503 });

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  const db = getManagerDb(env);
  if (!db) return databaseUnavailable();
  await ensureManagerSchema(db);
  const drafts = await db.prepare(`SELECT ${selectFields} FROM manager_review_drafts ORDER BY CASE WHEN status = 'applied' THEN 1 ELSE 0 END, updated_at DESC LIMIT 100`).all<ReviewDraftRecord>();
  return Response.json({
    manager: { email: access.email },
    settings: { enabled: reviewData.enabled, summary: customerReviewSummary },
    reviews: allCustomerReviews.filter(review => !review.productSlugs.length),
    drafts: (await reconcileDraftRecords(db, 'review', drafts.results || [], env)).map(reviewDraftToResponse),
  }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  const db = getManagerDb(env);
  if (!db) return databaseUnavailable();
  try {
    const body = await request.json() as { id?: string; updatedAt?: string; payload?: unknown };
    const requestedId = String(body.id || '').trim();
    const payload = normalizeReviewDraftPayload(body.payload);
    if (requestedId && !/^review-[a-z0-9-]+-[a-z0-9]+$/.test(requestedId)) return new Response('评价草稿信息不正确，请重新打开后重试。', { status: 400 });
    await ensureManagerSchema(db);
    const now = new Date(Math.max(Date.now(), Date.parse(body.updatedAt || '') + 1 || 0)).toISOString();
    const id = requestedId || createReviewDraftId(payload.id);
    if (requestedId && !await canEditDraftRecord(db,'review',requestedId,body.updatedAt)) return new Response('草稿已更新或任务执行中，请刷新。',{status:409});
    await db.prepare(
      `INSERT INTO manager_review_drafts
        (id, review_id, buyer_label, payload_json, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET review_id = excluded.review_id, buyer_label = excluded.buyer_label,
        payload_json = excluded.payload_json, status = 'draft', updated_by = excluded.updated_by, updated_at = excluded.updated_at
       WHERE manager_review_drafts.updated_at = ? AND manager_review_drafts.status NOT IN ('queued','dispatching','running')`
    ).bind(id, payload.id, payload.buyerLabel || payload.id, JSON.stringify(payload), access.email, access.email, now, now, body.updatedAt || '').run();
    const record = await db.prepare(`SELECT ${selectFields} FROM manager_review_drafts WHERE id = ?`).bind(id).first<ReviewDraftRecord>();
    if (record?.updated_at !== now) return new Response('草稿已变化，请刷新后重试。',{status:409});
    return Response.json({ draft: record ? reviewDraftToResponse(record) : null }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    void error;
    return new Response('评价草稿内容不完整，请检查后重试。', { status: 400 });
  }
};

export const DELETE: APIRoute = ({locals,request}) => deleteDraftRecordRoute(locals,request,'review');
