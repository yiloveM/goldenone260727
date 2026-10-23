import type { APIRoute } from 'astro';
import { targetLocaleOptions } from '../../../../data/i18n';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import { managerTranslationScope } from '../../../../lib/manager/translation-scope';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  let active: string[];
  try { active = (await managerTranslationScope(env)).locales; } catch { return new Response('暂时无法确认本站开放的语言，请稍后重试。', { status: 503 }); }
  return new Response(JSON.stringify({ locales: targetLocaleOptions.filter(option => active.includes(option.value)) }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
