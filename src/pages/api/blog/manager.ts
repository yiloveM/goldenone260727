import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { requireInternalPortalAccess } from '../../../lib/admin-portals';
import { readArticleCatalog } from '../../../lib/manager/article-catalog';
export const prerender = false;
export const GET: APIRoute = async ({ locals, request, cookies }) => {
  const env = getRuntimeEnv(locals);
  const denied = requireInternalPortalAccess(request, env, 'keystatic');
  if (denied) return denied;
  try {
    const data = await readArticleCatalog(env, cookies.get('keystatic-gh-access-token')?.value || '');
    return Response.json(data, { headers: { 'cache-control': 'no-store' } });
  } catch { return new Response('文章目录暂时无法读取，请刷新后重试。', { status: 503 }); }
};
