import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { getBranch, getDispatchToken, getRepoFullName } from '../../../lib/manager/github';
import { articleDeletionRoute } from '../../../lib/manager/article-deletion';
export const prerender = false;
const handle: APIRoute = async ({locals,request}) => {
  const env = getRuntimeEnv(locals), access = requireManagerAccess(request,env);
  if(access.response) return access.response;
  const token = getDispatchToken(env);
  if(!token) return new Response('文章管理服务暂不可用。',{status:503});
  return articleDeletionRoute(request,{repo:getRepoFullName(env),branch:getBranch(env),token},env);
};
export {handle as POST, handle as DELETE};
