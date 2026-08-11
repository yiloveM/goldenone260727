import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';
import { ensureManagerSchema, getManagerDb } from '../../../lib/manager/d1';
import { getDispatchToken } from '../../../lib/manager/github';

export const prerender = false;

type BindingStatus = {
  ok: boolean;
  label: string;
  detail: string;
};

const status = (ok: boolean, label: string, detail: string): BindingStatus => ({ ok, label, detail });

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const db = getManagerDb(env);
  let d1 = status(Boolean(db), 'Draft database', db ? 'Draft database is bound.' : 'Draft database is not connected.');
  if (db) {
    try {
      await ensureManagerSchema(db);
      d1 = status(true, 'Draft database', 'Draft database is connected and ready for content drafts.');
    } catch (error) {
      d1 = status(false, 'Draft database', error instanceof Error ? error.message : 'Draft database initialization failed.');
    }
  }

  const r2 = status(Boolean(env?.CONTENT_BUCKET), 'Image bucket', env?.CONTENT_BUCKET ? 'Image bucket is connected.' : 'Image bucket is not connected.');
  const dispatchToken = getDispatchToken(env, 'manager');

  return new Response(
    JSON.stringify({
      ok: d1.ok && r2.ok,
      manager: { email: access.email },
      checks: [
        status(true, 'Portal access', 'Dedicated domain and signed portal session are verified.'),
        d1,
        r2,
        status(Boolean(dispatchToken), 'Task authorization', dispatchToken ? 'Publish, translation, and write-back token is configured.' : 'Missing backend task token.'),
      ],
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};
