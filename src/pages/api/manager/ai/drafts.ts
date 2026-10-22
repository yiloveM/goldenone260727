import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';
import { getBranch, getDispatchToken, getRepoFullName } from '../../../../lib/manager/github';
import { translationDraftRoute } from '../../../../lib/draft-lifecycle';
export const prerender = false;
const handle: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;
  return translationDraftRoute(request, url, { repo: getRepoFullName(env), branch: getBranch(env), token: getDispatchToken(env, 'translation') }, 'manager');
};
export { handle as GET, handle as PUT, handle as PATCH, handle as DELETE };
