import { defineMiddleware } from 'astro:middleware';
import { requireInternalPortalAccess } from './lib/admin-portals';
import { getRuntimeEnv } from './lib/runtime-env';

const isKeystaticProtectedApi = (pathname: string) =>
  /^\/api\/(?:keystatic(?:\/|$)|ai(?:\/|$)|deploy\/site$|products\/manager$|r2\/assets$)/.test(pathname);

export const onRequest = defineMiddleware((context, next) => {
  if (!import.meta.env.PROD) return next();
  if (!isKeystaticProtectedApi(context.url.pathname)) return next();

  const denied = requireInternalPortalAccess(context.request, getRuntimeEnv(context.locals), 'keystatic', {
    allowKeystaticOAuthCallback: true,
  });
  if (denied) return denied;

  return next();
});
