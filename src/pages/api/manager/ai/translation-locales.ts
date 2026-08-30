import type { APIRoute } from 'astro';
import { targetLocaleOptions } from '../../../../data/i18n';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';

export const prerender = false;

export const GET: APIRoute = ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  return new Response(JSON.stringify({ locales: targetLocaleOptions }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
