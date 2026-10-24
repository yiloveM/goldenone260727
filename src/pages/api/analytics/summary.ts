import type { APIRoute } from 'astro';
import { ADMIN_PORTAL_HEADER, requireInternalPortalAccess } from '../../../lib/admin-portals';
import { getAnalyticsRuntimeStatus } from '../../../lib/analytics/capture';
import {
  ensureAnalyticsSchema,
  getAnalyticsDb,
  readAnalyticsAdjustments,
  readAnalyticsOverview,
  type AnalyticsPortalRole,
} from '../../../lib/analytics/d1';
import { getSearchConsoleAnalytics } from '../../../lib/analytics/google-search-console';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';

export const prerender = false;

const jsonHeaders = {
  'cache-control': 'private, no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
};

const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ ok: false, message }), { status, headers: jsonHeaders });

const isLoopbackRequest = (request: Request) => {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const getPortalRole = (request: Request): AnalyticsPortalRole | null => {
  if (!import.meta.env.PROD || isLoopbackRequest(request)) {
    return new URL(request.url).searchParams.get('surface') === 'manager' ? 'manager' : 'keystatic';
  }
  const role = request.headers.get(ADMIN_PORTAL_HEADER);
  return role === 'manager' || role === 'keystatic' ? role : null;
};

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const role = getPortalRole(request);
  if (!role) return jsonError(404, 'Not found.');

  if (import.meta.env.PROD && !isLoopbackRequest(request)) {
    if (role === 'manager') {
      const access = requireManagerAccess(request, env);
      if (access.response) return access.response;
    } else {
      const denied = requireInternalPortalAccess(request, env, 'keystatic');
      if (denied) return denied;
    }
  }

  const db = getAnalyticsDb(env);
  if (!db) return jsonError(503, 'Analytics database is not connected.');

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = [7, 30, 90, 180, 365].includes(requestedDays) ? requestedDays : 30;

  try {
    await ensureAnalyticsSchema(db);
    const [analytics, searchConsole, adjustments] = await Promise.all([
      readAnalyticsOverview(db, days, role),
      getSearchConsoleAnalytics(env, db, days),
      role === 'keystatic' ? readAnalyticsAdjustments(db) : Promise.resolve([]),
    ]);
    return new Response(
      JSON.stringify({
        ok: true,
        role,
        status: getAnalyticsRuntimeStatus(env),
        analytics,
        searchConsole,
        adjustments,
      }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error({
      event: 'analytics_dashboard_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(500, 'Analytics data could not be loaded.');
  }
};
