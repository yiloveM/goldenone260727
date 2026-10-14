const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const string = (env, key) => typeof env?.[key] === 'string' ? env[key].trim() : '';
const actions = new Set(['contact', 'download']);

export const turnstileConfiguration = (env, action, request) => {
  const sitekey = string(env, 'TURNSTILE_SITEKEY');
  const secret = string(env, 'TURNSTILE_SECRET');
  const hostname = new URL(request.url).hostname.toLowerCase();
  let expectedHostname;
  try { expectedHostname = new URL(string(env, 'SITE_URL')).hostname.toLowerCase(); }
  catch { return null; }
  if (!actions.has(action) || !sitekey || !secret) return null;
  if (string(env, 'DEPLOYMENT_CONTEXT') !== 'preview' && hostname !== expectedHostname) return null;
  return { sitekey, secret, action, hostname };
};

export const turnstilePublicConfiguration = (env, action, request) => {
  const config = turnstileConfiguration(env, action, request);
  return config ? { provider: 'turnstile', sitekey: config.sitekey, action: config.action } : null;
};

export const verifyTurnstile = async (env, action, request, token, send = fetch) => {
  if (string(env, 'DEPLOYMENT_CONTEXT') === 'preview') return { ok: false, status: 403 };
  const config = turnstileConfiguration(env, action, request);
  if (!config) return { ok: false, status: 503 };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, status: 400 };
  const body = new URLSearchParams({ secret: config.secret, response: token });
  const remoteip = request.headers.get('cf-connecting-ip');
  if (remoteip) body.set('remoteip', remoteip);
  try {
    const response = await send(siteverifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, status: 503 };
    const result = await response.json();
    return result?.success === true && result.action === config.action && result.hostname === config.hostname
      ? { ok: true, status: 200 }
      : { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 503 };
  }
};
