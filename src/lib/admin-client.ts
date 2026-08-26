const PORTAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const currentPortalPrefix = () => {
  if (typeof window === 'undefined') return [];
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return PORTAL_UUID_PATTERN.test(firstSegment) ? [firstSegment] : [];
};

export const adminApiUrl = (resource: string) => {
  const value = String(resource || '').trim();
  const suffixIndex = value.search(/[?#]/);
  const resourcePath = suffixIndex >= 0 ? value.slice(0, suffixIndex) : value;
  const suffix = suffixIndex >= 0 ? value.slice(suffixIndex) : '';
  const resourceSegments = resourcePath.split('/').filter(Boolean);
  if (resourceSegments[0] === 'api') resourceSegments.shift();

  return `/${[...currentPortalPrefix(), 'api', ...resourceSegments].join('/')}${suffix}`;
};

const responseMessage = (body: string) => {
  const text = body.trim();
  if (!text) return '';

  try {
    const payload = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  } catch {
    // Plain-text API errors are handled below.
  }

  if (text.startsWith('Admin portal configuration is unavailable')) {
    return '后台入口配置不可用。请检查 Cloudflare 中两套后台域名、两个 UUID 和 ADMIN_PORTAL_SESSION_SECRET，然后重新打开秘密入口。';
  }
  if (text === 'Not found.') {
    return '后台会话已失效或入口地址不正确。请关闭此页，并从完整的后台秘密入口重新进入。';
  }
  return text;
};

export const readAdminJson = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const body = await response.text();
  const message = responseMessage(body);

  if (!response.ok) {
    throw new Error(message || `${fallbackMessage}（HTTP ${response.status}）`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      message && message !== body.trim()
        ? message
        : `${fallbackMessage}：后台返回了非 JSON 响应。请重新打开完整的后台秘密入口；若仍出现，请确认最新 Worker 已部署。`
    );
  }
};
