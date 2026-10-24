import { defineMiddleware } from 'astro:middleware';
import { requireInternalPortalAccess } from './lib/admin-portals';
import { getRuntimeEnv } from './lib/runtime-env';
import {requireManagerAccess} from './lib/manager/access';
import {readFeatureState,ownerFeatureState,requireFeature,featureResponse} from './lib/manager/features';
import {registeredManagerFeature} from './lib/feature-registry.mjs';

const isKeystaticProtectedApi = (pathname: string) =>
  /^\/api\/(?:keystatic(?:\/|$)|ai(?:\/|$)|deploy\/site$|products\/(manager|deletion)$|blog\/(manager|deletion)$|r2\/assets$)/.test(pathname);

export const onRequest = defineMiddleware(async(context, next) => {
  const path=context.url.pathname.replace(/\/+$/,''),env=getRuntimeEnv(context.locals);
  if(path.startsWith('/api/manager/')){
    const access=requireManagerAccess(context.request,env);if(access.response)return access.response;
    try{const feature=registeredManagerFeature(path,context.request.method);if(feature||path==='/api/manager/workspace'){const state=await readFeatureState(env);(context.locals as any).featureState=state;const denied=requireFeature(state,feature);if(denied)return denied;}}catch{return featureResponse(503);}
    return next();
  }
  if (!import.meta.env.PROD) return next();
  if (!isKeystaticProtectedApi(path)) return next();

  const denied = requireInternalPortalAccess(context.request, getRuntimeEnv(context.locals), 'keystatic', {
    allowKeystaticOAuthCallback: true,
  });
  if (denied) return denied;
  const ownerFeature=path.startsWith('/api/products/')?'products':path.startsWith('/api/blog/')?'articles':path==='/api/r2/assets'?'media':path==='/api/ai/translations'||path==='/api/ai/translation-status'?'translations':null;
  if(ownerFeature){try{const state=await ownerFeatureState(env,context.request);(context.locals as any).featureState=state;const denied=requireFeature(state,ownerFeature);if(denied)return denied;}catch{return featureResponse(503);}}
  return next();
});
