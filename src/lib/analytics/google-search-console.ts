import { getEnvString, type RuntimeEnv } from '../runtime-env';
import { readExternalCache, writeExternalCache, type AnalyticsDatabase } from './d1';

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type SearchConsoleRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchConsoleResponse = {
  rows?: SearchConsoleRow[];
};

export type SearchConsoleAnalytics = {
  configured: boolean;
  available: boolean;
  cached?: boolean;
  stale?: boolean;
  property?: string;
  range?: { start: string; end: string };
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
  timeseries?: Array<{ day: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queries?: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  pages?: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  message?: string;
};

const encoder = new TextEncoder();

const base64Url = (value: string | ArrayBuffer) => {
  const bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const pemBytes = (value: string) => {
  const body = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

const createAccessToken = async (credentials: ServiceAccountCredentials) => {
  const clientEmail = String(credentials.client_email || '').trim();
  const privateKey = String(credentials.private_key || '').trim();
  const tokenUri = String(credentials.token_uri || 'https://oauth2.googleapis.com/token').trim();
  if (!clientEmail || !privateKey) throw new Error('Search Console service account credentials are incomplete.');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Search Console authorization failed.');
  }
  return payload.access_token;
};

const querySearchConsole = async (
  token: string,
  property: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number
) => {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
        type: 'web',
        dataState: 'final',
      }),
    }
  );
  const text = await response.text();
  if (!response.ok) {
    let message = 'Search Console query failed.';
    try {
      const payload = JSON.parse(text) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      // Keep the bounded generic message when Google does not return JSON.
    }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : {}) as SearchConsoleResponse;
};

const metric = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export const getSearchConsoleAnalytics = async (
  env: RuntimeEnv,
  db: AnalyticsDatabase,
  days: number
): Promise<SearchConsoleAnalytics> => {
  const property = getEnvString(env, 'GSC_SITE_URL');
  const credentialsJson = getEnvString(env, 'GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON');
  if (!property || !credentialsJson) {
    return {
      configured: false,
      available: false,
      message: 'Google Search Console is not connected.',
    };
  }

  const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDate = dateKey(start);
  const endDate = dateKey(end);
  const cacheKey = `gsc:v1:${property}:${startDate}:${endDate}`;
  const cached = await readExternalCache<SearchConsoleAnalytics>(db, cacheKey);
  if (cached?.fresh) return { ...cached.value, cached: true };

  try {
    const credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
    const token = await createAccessToken(credentials);
    const [daily, queryRows, pageRows] = await Promise.all([
      querySearchConsole(token, property, startDate, endDate, ['date'], 2500),
      querySearchConsole(token, property, startDate, endDate, ['query'], 100),
      querySearchConsole(token, property, startDate, endDate, ['page'], 100),
    ]);

    const timeseries = (daily.rows || []).map(row => ({
      day: String(row.keys?.[0] || ''),
      clicks: metric(row.clicks),
      impressions: metric(row.impressions),
      ctr: metric(row.ctr),
      position: metric(row.position),
    }));
    const clicks = timeseries.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = timeseries.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPosition = timeseries.reduce((sum, row) => sum + row.position * row.impressions, 0);
    const analytics: SearchConsoleAnalytics = {
      configured: true,
      available: true,
      property,
      range: { start: startDate, end: endDate },
      totals: {
        clicks,
        impressions,
        ctr: impressions ? clicks / impressions : 0,
        position: impressions ? weightedPosition / impressions : 0,
      },
      timeseries,
      queries: (queryRows.rows || []).map(row => ({
        query: String(row.keys?.[0] || ''),
        clicks: metric(row.clicks),
        impressions: metric(row.impressions),
        ctr: metric(row.ctr),
        position: metric(row.position),
      })),
      pages: (pageRows.rows || []).map(row => ({
        page: String(row.keys?.[0] || ''),
        clicks: metric(row.clicks),
        impressions: metric(row.impressions),
        ctr: metric(row.ctr),
        position: metric(row.position),
      })),
    };
    await writeExternalCache(db, cacheKey, analytics, 6 * 60 * 60);
    return analytics;
  } catch (error) {
    if (cached) {
      return {
        ...cached.value,
        cached: true,
        stale: true,
        message: error instanceof Error ? error.message : 'Search Console refresh failed.',
      };
    }
    return {
      configured: true,
      available: false,
      property,
      message: error instanceof Error ? error.message : 'Search Console query failed.',
    };
  }
};
