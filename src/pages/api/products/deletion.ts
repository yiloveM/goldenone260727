import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { keystaticGitAccess } from '../../../lib/keystatic-github';
import { readProductCatalog } from '../../../lib/manager/product-catalog';
import { formalContentDeletionRoute } from '../../../lib/manager/formal-content-deletion';
export const prerender = false;
const handle: APIRoute = async ({locals,request}) => {
  const env = getRuntimeEnv(locals);
  try {
    const access = await keystaticGitAccess(request,env);
    if(!access) return new Response('请先登录有写入权限的内容管理账号。',{status:401});
    return formalContentDeletionRoute(request,access,async head=>(await readProductCatalog(env,access.token,head)).products,'product');
  } catch {return new Response('暂时无法核验内容管理权限。',{status:502});}
};
export {handle as POST,handle as DELETE};
