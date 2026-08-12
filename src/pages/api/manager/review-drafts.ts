import type { APIRoute } from 'astro';
import reviewData from '../../../data/customer-reviews.json';
import { customerReviewSummary } from '../../../data/customerReviews';
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
const databaseUnavailable = () => new Response(
  'The review draft database is not connected. Ask the site owner to check the Manager configuration.',
  { status: 503 },
);

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  const db = getManagerDb(env);
  if (!db) return databaseUnavailable();

  await ensureManagerSchema(db);
  const drafts = await db.prepare(`SELECT ${selectFields} FROM manager_review_drafts ORDER BY updated_at DESC LIMIT 100`).all<ReviewDraftRecord>();
  return Response.json({
    manager: { email: access.email },
    settings: { enabled: reviewData.enabled, summary: customerReviewSummary },
    reviews: reviewData.reviews,
    drafts: (drafts.results || []).map(reviewDraftToResponse),
  }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  const db = getManagerDb(env);
  if (!db) return databaseUnavailable();

  let payload;
  let requestedId = '';
  try {
    const body = await request.json() as { id?: string; payload?: unknown };
    requestedId = String(body.id || '').trim();
    payload = normalizeReviewDraftPayload(body.payload);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad review draft payload.', { status: 400 });
  }
  if (requestedId && !/^review-[a-z0-9-]+-[a-z0-9]+$/.test(requestedId)) {
    return new Response('Bad review draft id.', { status: 400 });
  }

  await ensureManagerSchema(db);
  const now = new Date().toISOString();
  const id = requestedId || createReviewDraftId(payload.id);
  await db.prepare(
    `INSERT INTO manager_review_drafts
      (id, review_id, buyer_label, payload_json, status, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET review_id = excluded.review_id, buyer_label = excluded.buyer_label,
      payload_json = excluded.payload_json, status = 'draft', updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(id, payload.id, payload.buyerLabel || payload.id, JSON.stringify(payload), access.email, access.email, now, now).run();

  const record = await db.prepare(`SELECT ${selectFields} FROM manager_review_drafts WHERE id = ?`).bind(id).first<ReviewDraftRecord>();
  return Response.json({ draft: record ? reviewDraftToResponse(record) : null }, { headers: { 'cache-control': 'no-store' } });
};
