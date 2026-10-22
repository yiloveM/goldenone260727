import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { getDispatchToken } from '../../../lib/manager/github';
import { readArticleCatalog } from '../../../lib/manager/article-catalog';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const query = new URL(request.url).searchParams;
  try {
    const data = await readArticleCatalog(env, getDispatchToken(env), query.get('slug') || '', query.get('locale') || 'en');
    return Response.json({ manager: { email: access.email }, ...data }, { headers: { 'cache-control': 'no-store' } });
  } catch { return new Response('无法读取最新文章或目标语言未公开，请刷新后重试。', { status: 503, headers: { 'cache-control': 'no-store' } }); }
};
