import type { APIRoute } from 'astro';
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic';
import config from '../../../../keystatic.config';
import { getEnvString, getRuntimeEnv } from '../../../lib/runtime-env';

export const prerender = false;

export const ALL: APIRoute = async ({ locals, request }) => {
  const runtimeEnv = getRuntimeEnv(locals);
  const credentials = {
    clientId: getEnvString(runtimeEnv, 'KEYSTATIC_GITHUB_CLIENT_ID'),
    clientSecret: getEnvString(runtimeEnv, 'KEYSTATIC_GITHUB_CLIENT_SECRET'),
    secret: getEnvString(runtimeEnv, 'KEYSTATIC_SECRET'),
  };

  if (config.storage.kind === 'github') {
    const missing = [
      !credentials.clientId && 'KEYSTATIC_GITHUB_CLIENT_ID',
      !credentials.clientSecret && 'KEYSTATIC_GITHUB_CLIENT_SECRET',
      !credentials.secret && 'KEYSTATIC_SECRET',
    ].filter(Boolean);

    if (missing.length) {
      throw new Error(`Missing Keystatic Worker secrets: ${missing.join(', ')}`);
    }
  }

  const handler = makeGenericAPIRouteHandler(
    {
      config,
      ...(config.storage.kind === 'github' ? credentials : {}),
    },
    { slugEnvName: 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG' }
  );
  const { body, headers, status } = await handler(request);

  return new Response(body as BodyInit | null, { status, headers });
};
