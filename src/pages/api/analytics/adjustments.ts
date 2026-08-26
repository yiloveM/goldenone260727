import type { APIRoute } from 'astro';
import { ADMIN_PORTAL_HEADER, requireInternalPortalAccess } from '../../../lib/admin-portals';
import {
  deleteAnalyticsAdjustment,
  ensureAnalyticsSchema,
  getAnalyticsDb,
  readAnalyticsAdjustments,
  upsertAnalyticsAdjustment,
  type AnalyticsAdjustmentMetric,
} from '../../../lib/analytics/d1';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const prerender = false;

const jsonHeaders = {
  'cache-control': 'private, no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: jsonHeaders });

const isLoopbackRequest = (request: Request) => {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const requireOwner = (request: Request, env: ReturnType<typeof getRuntimeEnv>) => {
  if (!import.meta.env.PROD || isLoopbackRequest(request)) {
    return new URL(request.url).searchParams.get('surface') === 'manager'
      ? json(403, { ok: false, message: 'Only the owner portal can edit analytics adjustments.' })
      : null;
  }
  if (request.headers.get(ADMIN_PORTAL_HEADER) !== 'keystatic') {
    return json(404, { ok: false, message: 'Not found.' });
  }
  return requireInternalPortalAccess(request, env, 'keystatic');
};

const hasSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

const parseBody = async (request: Request) => {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8192) throw new Error('Request body is too large.');
  return request.json() as Promise<Record<string, unknown>>;
};

const cleanText = (value: unknown, maxLength: number) => String(value || '').trim().slice(0, maxLength);
const metricValues = new Set<AnalyticsAdjustmentMetric>(['pageviews', 'visitors', 'landings']);

const validDay = (value: unknown) => {
  const day = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return '';
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 5);
  return parsed >= earliest && parsed <= today ? day : '';
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const denied = requireOwner(request, env);
  if (denied) return denied;
  if (!hasSameOrigin(request)) return json(403, { ok: false, message: 'Cross-origin writes are not allowed.' });

  const db = getAnalyticsDb(env);
  if (!db) return json(503, { ok: false, message: 'Analytics database is not connected.' });

  try {
    const body = await parseBody(request);
    const day = validDay(body.day);
    const metric = cleanText(body.metric, 24) as AnalyticsAdjustmentMetric;
    const delta = Number(body.delta);
    const source = cleanText(body.source, 80);
    const note = cleanText(body.note, 240);
    const requestedId = cleanText(body.id, 64);

    if (!day) return json(400, { ok: false, message: 'Date must be today or within the last five years.' });
    if (!metricValues.has(metric)) return json(400, { ok: false, message: 'Unsupported adjustment metric.' });
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) {
      return json(400, { ok: false, message: 'Adjustment must be a non-zero integer between -10,000,000 and 10,000,000.' });
    }
    if (!source) return json(400, { ok: false, message: 'The paid data source is required.' });
    if (!note) return json(400, { ok: false, message: 'A reconciliation reason is required.' });
    if (requestedId && !/^[0-9a-f-]{36}$/i.test(requestedId)) {
      return json(400, { ok: false, message: 'Invalid adjustment identifier.' });
    }

    await ensureAnalyticsSchema(db);
    const now = Date.now();
    await upsertAnalyticsAdjustment(db, {
      id: requestedId || crypto.randomUUID(),
      day,
      metric,
      delta,
      source,
      note,
      createdAt: now,
      updatedAt: now,
    });
    return json(200, { ok: true, adjustments: await readAnalyticsAdjustments(db) });
  } catch (error) {
    console.error({
      event: 'analytics_adjustment_write_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return json(400, { ok: false, message: 'The analytics adjustment could not be saved.' });
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const denied = requireOwner(request, env);
  if (denied) return denied;
  if (!hasSameOrigin(request)) return json(403, { ok: false, message: 'Cross-origin writes are not allowed.' });

  const db = getAnalyticsDb(env);
  if (!db) return json(503, { ok: false, message: 'Analytics database is not connected.' });

  try {
    const body = await parseBody(request);
    const id = cleanText(body.id, 64);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { ok: false, message: 'Invalid adjustment identifier.' });
    await ensureAnalyticsSchema(db);
    const deleted = await deleteAnalyticsAdjustment(db, id);
    if (!deleted) return json(404, { ok: false, message: 'Analytics adjustment was not found.' });
    return json(200, { ok: true, adjustments: await readAnalyticsAdjustments(db) });
  } catch (error) {
    console.error({
      event: 'analytics_adjustment_delete_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return json(400, { ok: false, message: 'The analytics adjustment could not be deleted.' });
  }
};
