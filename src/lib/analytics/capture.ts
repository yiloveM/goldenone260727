import { getEnvString, type RuntimeEnv } from '../runtime-env';
import { getScopedRuntimeSecret, hasScopedRuntimeSecret } from '../runtime-secret';
import {
  getAnalyticsDb,
  recordAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsIpMode,
} from './d1';

type AnalyticsRequestCf = {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  colo?: string;
};

const supportedLocales = new Set([
  'en',
  'zh',
  'ar',
  'hi',
  'es',
  'fr',
  'bn',
  'pt',
  'ru',
  'ur',
  'de',
  'tr',
  'fil',
  'ko',
  'uz',
]);

const botPattern = /bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|monitoring|uptime|curl\/|wget\//i;
const searchEngines: Array<{ pattern: RegExp; name: string; parameters: string[] }> = [
  { pattern: /(^|\.)google\./i, name: 'google', parameters: ['q'] },
  { pattern: /(^|\.)bing\.com$/i, name: 'bing', parameters: ['q'] },
  { pattern: /(^|\.)yahoo\./i, name: 'yahoo', parameters: ['p'] },
  { pattern: /(^|\.)duckduckgo\.com$/i, name: 'duckduckgo', parameters: ['q'] },
  { pattern: /(^|\.)baidu\.com$/i, name: 'baidu', parameters: ['wd', 'word'] },
  { pattern: /(^|\.)yandex\./i, name: 'yandex', parameters: ['text'] },
  { pattern: /(^|\.)ecosia\.org$/i, name: 'ecosia', parameters: ['q'] },
  { pattern: /(^|\.)naver\.com$/i, name: 'naver', parameters: ['query'] },
];

const trimValue = (value: unknown, maxLength = 160) => String(value || '').trim().slice(0, maxLength);

const getIpMode = (env: RuntimeEnv): AnalyticsIpMode => {
  const value = getEnvString(env, 'ANALYTICS_IP_MODE').toLowerCase();
  return value === 'none' || value === 'full' ? value : 'network';
};

const getRetentionDays = (env: RuntimeEnv, ipMode: AnalyticsIpMode) => {
  const parsed = Number(getEnvString(env, 'ANALYTICS_RETENTION_DAYS') || 365);
  const requested = Number.isFinite(parsed) ? Math.max(7, Math.min(365, Math.round(parsed))) : 365;
  return ipMode === 'full' ? Math.min(requested, 30) : requested;
};

const maskIpNetwork = (value: string) => {
  if (value.includes('.')) {
    const parts = value.split('.');
    if (parts.length !== 4 || !parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return '';
    return `${parts.slice(0, 3).map(part => String(Number(part))).join('.')}.0/24`;
  }

  if (value.includes(':')) {
    const normalized = value.toLowerCase();
    if ((normalized.match(/::/g) || []).length > 1) return '';
    const [left = '', right = ''] = normalized.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const validPart = (part: string) => /^[0-9a-f]{1,4}$/.test(part);
    if (!leftParts.every(validPart) || !rightParts.every(validPart)) return '';
    const missing = 8 - leftParts.length - rightParts.length;
    if (missing < 0 || (!normalized.includes('::') && missing !== 0)) return '';
    const parts = [...leftParts, ...Array.from({ length: missing }, () => '0'), ...rightParts];
    if (parts.length !== 8) return '';
    return `${parts.slice(0, 3).map(part => Number.parseInt(part, 16).toString(16)).join(':')}::/48`;
  }

  return '';
};

const base64Url = (bytes: ArrayBuffer) => {
  const data = new Uint8Array(bytes);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const createVisitorKey = async (env: RuntimeEnv, day: string, ip: string, userAgent: string) => {
  if (!ip) return '';
  const encoder = new TextEncoder();
  const payload = encoder.encode(`v1|${day}|${ip}|${userAgent.slice(0, 240)}`);
  const secret = await getScopedRuntimeSecret(env, 'analytics-visitor-identity');
  if (secret.length < 32) return '';
  const digest = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    payload
  );
  return base64Url(digest).slice(0, 24);
};

const classifyUserAgent = (userAgent: string) => {
  const device = /ipad|tablet|playbook|silk/i.test(userAgent)
    ? 'tablet'
    : /mobile|iphone|ipod|android/i.test(userAgent)
      ? 'mobile'
      : 'desktop';
  const browser = /edg\//i.test(userAgent)
    ? 'Edge'
    : /firefox\//i.test(userAgent)
      ? 'Firefox'
      : /chrome\//i.test(userAgent)
        ? 'Chrome'
        : /safari\//i.test(userAgent)
          ? 'Safari'
          : 'Other';
  const os = /windows/i.test(userAgent)
    ? 'Windows'
    : /android/i.test(userAgent)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(userAgent)
        ? 'iOS'
        : /mac os|macintosh/i.test(userAgent)
          ? 'macOS'
          : /linux/i.test(userAgent)
            ? 'Linux'
            : 'Other';
  return { device, browser, os };
};

const parseReferrer = (requestUrl: URL, rawReferrer: string) => {
  if (!rawReferrer) {
    return { host: '', source: 'direct', medium: 'none', query: '', external: true };
  }

  try {
    const referrer = new URL(rawReferrer);
    if (referrer.hostname.toLowerCase() === requestUrl.hostname.toLowerCase()) {
      return { host: referrer.hostname.toLowerCase(), source: 'internal', medium: 'internal', query: '', external: false };
    }

    const engine = searchEngines.find(item => item.pattern.test(referrer.hostname));
    const query = engine
      ? trimValue(engine.parameters.map(parameter => referrer.searchParams.get(parameter)).find(Boolean), 200)
      : '';
    return {
      host: referrer.hostname.toLowerCase().slice(0, 253),
      source: engine?.name || referrer.hostname.toLowerCase().slice(0, 120),
      medium: engine ? 'organic' : 'referral',
      query,
      external: true,
    };
  } catch {
    return { host: '', source: 'direct', medium: 'none', query: '', external: true };
  }
};

const isAllowedHost = (url: URL, env: RuntimeEnv) => {
  const configuredHosts = getEnvString(env, 'ANALYTICS_ALLOWED_HOSTS')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  if (configuredHosts.length) return configuredHosts.includes(url.hostname.toLowerCase());

  try {
    const siteUrl = getEnvString(env, 'SITE_URL');
    return !siteUrl || new URL(siteUrl).hostname.toLowerCase() === url.hostname.toLowerCase();
  } catch {
    return false;
  }
};

const shouldCapture = (request: Request, response: Response, env: RuntimeEnv) => {
  if (getEnvString(env, 'ANALYTICS_ENABLED').toLowerCase() === 'false') return false;
  if (request.method !== 'GET' || response.status < 200 || response.status >= 300) return false;
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return false;
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return false;

  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent || botPattern.test(userAgent)) return false;

  const url = new URL(request.url);
  if (!isAllowedHost(url, env)) return false;
  return !/^\/(?:api|r2|manager|keystatic|_astro)(?:\/|$)/.test(url.pathname);
};

export const capturePublicPageView = async (request: Request, response: Response, env: RuntimeEnv) => {
  if (!shouldCapture(request, response, env)) return;
  const db = getAnalyticsDb(env);
  if (!db) return;

  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const ip = trimValue(request.headers.get('cf-connecting-ip'), 64);
  const ipMode = getIpMode(env);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const referrer = parseReferrer(url, request.headers.get('referer') || '');
  const source = trimValue(url.searchParams.get('utm_source'), 120) || referrer.source;
  const medium = trimValue(url.searchParams.get('utm_medium'), 80) || referrer.medium;
  const campaign = trimValue(url.searchParams.get('utm_campaign'), 160);
  const term = trimValue(url.searchParams.get('utm_term'), 200);
  const path = `${url.pathname || '/'}`.replace(/\/{2,}/g, '/').slice(0, 512);
  const firstSegment = path.split('/').filter(Boolean)[0] || 'en';
  const cf = (request as Request & { cf?: AnalyticsRequestCf }).cf;
  const client = classifyUserAgent(userAgent);

  const event: AnalyticsEvent = {
    id: crypto.randomUUID(),
    occurredAt: now,
    day,
    visitorKey: await createVisitorKey(env, day, ip, userAgent),
    path,
    locale: supportedLocales.has(firstSegment) ? firstSegment : 'en',
    isLanding: referrer.external,
    source,
    medium,
    campaign,
    term,
    searchQuery: referrer.query,
    referrerHost: referrer.host,
    ipAddress: ipMode === 'full' ? ip : ipMode === 'network' ? maskIpNetwork(ip) : '',
    ipMode,
    country: trimValue(cf?.country, 8),
    region: trimValue(cf?.region, 120),
    city: trimValue(cf?.city, 120),
    timezone: trimValue(cf?.timezone, 80),
    colo: trimValue(cf?.colo, 16),
    device: client.device,
    browser: client.browser,
    os: client.os,
  };

  await recordAnalyticsEvent(db, event, getRetentionDays(env, ipMode));
};

export const getAnalyticsRuntimeStatus = (env: RuntimeEnv) => {
  const ipMode = getIpMode(env);
  return {
    enabled: getEnvString(env, 'ANALYTICS_ENABLED').toLowerCase() !== 'false',
    databaseBound: Boolean(getAnalyticsDb(env)),
    ipMode,
    retentionDays: getRetentionDays(env, ipMode),
    visitorIdentity: hasScopedRuntimeSecret(env) ? 'hmac' : 'disabled',
  };
};
