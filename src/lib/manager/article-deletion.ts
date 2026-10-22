import { readArticleCatalog } from './article-catalog';
import { formalContentDeletionRoute } from './formal-content-deletion';
import type { GitContext } from '../site-git';
import type { RuntimeEnv } from '../runtime-env';
export const articleDeletionRoute=(request:Request,ctx:GitContext,env:RuntimeEnv)=>formalContentDeletionRoute(request,ctx,async head=>(await readArticleCatalog(env,ctx.token,'','en',head)).posts || [],'article');
