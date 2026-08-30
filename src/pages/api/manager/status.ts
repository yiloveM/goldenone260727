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
  let d1 = status(Boolean(db), '内容草稿', db ? '内容草稿服务已连接。' : '内容草稿服务暂时不可用。');
  if (db) {
    try {
      await ensureManagerSchema(db);
      d1 = status(true, '内容草稿', '内容草稿服务已就绪。');
    } catch (error) {
      void error;
      d1 = status(false, '内容草稿', '内容草稿服务暂时不可用。');
    }
  }

  const r2 = status(Boolean(env?.CONTENT_BUCKET), '图片管理', env?.CONTENT_BUCKET ? '图片管理服务已连接。' : '图片管理服务暂时不可用。');
  const dispatchToken = getDispatchToken(env, 'manager');

  return new Response(
    JSON.stringify({
      ok: d1.ok && r2.ok,
      manager: { email: access.email },
      checks: [
        status(true, '登录状态', '当前登录状态正常。'),
        d1,
        r2,
        status(Boolean(dispatchToken), '内容处理', dispatchToken ? '内容处理服务已就绪。' : '内容处理服务暂时不可用。'),
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
