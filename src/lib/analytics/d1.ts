import type { RuntimeEnv } from '../runtime-env';

export type AnalyticsIpMode = 'none' | 'network' | 'full';
export type AnalyticsPortalRole = 'keystatic' | 'manager';
export type AnalyticsAdjustmentMetric = 'pageviews' | 'visitors' | 'landings';

export type AnalyticsAdjustment = {
  id: string;
  day: string;
  metric: AnalyticsAdjustmentMetric;
  delta: number;
  source: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};
export type AnalyticsEvent = {
  id: string;
  occurredAt: number;
  day: string;
  visitorKey: string;
  path: string;
  locale: string;
  isLanding: boolean;
  source: string;
  medium: string;
  campaign: string;
  term: string;
  searchQuery: string;
  referrerHost: string;
  ipAddress: string;
  ipMode: AnalyticsIpMode;
  country: string;
  region: string;
  city: string;
  timezone: string;
  colo: string;
  device: string;
  browser: string;
  os: string;
};

type NumericRow = Record<string, string | number | null>;

type AnalyticsD1Result<T = unknown> = {
  results?: T[];
};

type AnalyticsD1Statement = {
  bind: (...values: unknown[]) => AnalyticsD1Statement;
  run: () => Promise<AnalyticsD1Result>;
  first: <T = unknown>() => Promise<T | null>;
};

export type AnalyticsDatabase = {
  prepare: (query: string) => AnalyticsD1Statement;
  batch: <T = unknown>(statements: AnalyticsD1Statement[]) => Promise<Array<AnalyticsD1Result<T>>>;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS site_analytics_events (
    id TEXT PRIMARY KEY,
    occurred_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    visitor_key TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    is_landing INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'direct',
    medium TEXT NOT NULL DEFAULT 'none',
    campaign TEXT NOT NULL DEFAULT '',
    term TEXT NOT NULL DEFAULT '',
    search_query TEXT NOT NULL DEFAULT '',
    referrer_host TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    ip_mode TEXT NOT NULL DEFAULT 'none',
    country TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    colo TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT 'unknown',
    browser TEXT NOT NULL DEFAULT 'unknown',
    os TEXT NOT NULL DEFAULT 'unknown'
  )`,
  'CREATE INDEX IF NOT EXISTS idx_site_analytics_events_day ON site_analytics_events(day)',
  'CREATE INDEX IF NOT EXISTS idx_site_analytics_events_occurred_at ON site_analytics_events(occurred_at DESC)',
  `CREATE TABLE IF NOT EXISTS site_analytics_adjustments (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('pageviews', 'visitors', 'landings')),
    delta INTEGER NOT NULL CHECK (delta <> 0),
    source TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_site_analytics_adjustments_day ON site_analytics_adjustments(day DESC)',
  `CREATE TABLE IF NOT EXISTS site_analytics_adjustment_audit (
    audit_id TEXT PRIMARY KEY,
    adjustment_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    payload_json TEXT NOT NULL,
    recorded_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_site_analytics_adjustment_audit_recorded_at ON site_analytics_adjustment_audit(recorded_at DESC)',
  `CREATE TABLE IF NOT EXISTS site_analytics_maintenance (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS site_analytics_external_cache (
    key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

let schemaReady: Promise<void> | null = null;

export const getAnalyticsDb = (env: RuntimeEnv) => env?.MANAGER_DB as AnalyticsDatabase | undefined;

export const ensureAnalyticsSchema = async (db: AnalyticsDatabase) => {
  if (!schemaReady) {
    schemaReady = db.batch(schemaStatements.map(statement => db.prepare(statement))).then(() => undefined);
  }
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
};

const isMissingSchemaError = (error: unknown) =>
  /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));

const insertEvent = (db: AnalyticsDatabase, event: AnalyticsEvent) =>
  db
    .prepare(
      `INSERT INTO site_analytics_events (
        id, occurred_at, day, visitor_key, path, locale, is_landing,
        source, medium, campaign, term, search_query, referrer_host,
        ip_address, ip_mode, country, region, city, timezone, colo,
        device, browser, os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.occurredAt,
      event.day,
      event.visitorKey,
      event.path,
      event.locale,
      event.isLanding ? 1 : 0,
      event.source,
      event.medium,
      event.campaign,
      event.term,
      event.searchQuery,
      event.referrerHost,
      event.ipAddress,
      event.ipMode,
      event.country,
      event.region,
      event.city,
      event.timezone,
      event.colo,
      event.device,
      event.browser,
      event.os,
    )
    .run();

const pruneExpiredEvents = async (db: AnalyticsDatabase, day: string, retentionDays: number) => {
  const gate = await db
    .prepare(
      `INSERT INTO site_analytics_maintenance (key, value, updated_at)
       VALUES ('last-retention-prune', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE site_analytics_maintenance.value < excluded.value
       RETURNING value`,
    )
    .bind(day, Date.now())
    .first<{ value: string }>();

  if (!gate) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await db.prepare('DELETE FROM site_analytics_events WHERE occurred_at < ?').bind(cutoff).run();
  await db.prepare('DELETE FROM site_analytics_external_cache WHERE expires_at < ?').bind(Date.now()).run();
};

export const recordAnalyticsEvent = async (db: AnalyticsDatabase, event: AnalyticsEvent, retentionDays: number) => {
  try {
    await insertEvent(db, event);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    await ensureAnalyticsSchema(db);
    await insertEvent(db, event);
  }

  await pruneExpiredEvents(db, event.day, retentionDays);
};

const numberValue = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const startOfUtcDay = (date: Date) => {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const rowsFrom = <T>(result: AnalyticsD1Result<T> | undefined): T[] => result?.results || [];

export const readAnalyticsOverview = async (db: AnalyticsDatabase, days: number, _role: AnalyticsPortalRole) => {
  const today = startOfUtcDay(new Date());
  const currentStart = new Date(today);
  currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);
  const currentDay = dayKey(currentStart);
  const previousDay = dayKey(previousStart);
  const endDay = dayKey(today);

  const statements = [
    db
      .prepare(
        `SELECT
          SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS pageviews,
          COUNT(DISTINCT CASE WHEN day >= ? THEN NULLIF(visitor_key, '') END) AS visitors,
          SUM(CASE WHEN day >= ? THEN is_landing ELSE 0 END) AS landings,
          SUM(CASE WHEN day >= ? AND day < ? THEN 1 ELSE 0 END) AS previous_pageviews,
          COUNT(DISTINCT CASE WHEN day >= ? AND day < ? THEN NULLIF(visitor_key, '') END) AS previous_visitors,
          SUM(CASE WHEN day >= ? AND day < ? THEN is_landing ELSE 0 END) AS previous_landings
         FROM site_analytics_events
         WHERE day >= ?`,
      )
      .bind(
        currentDay,
        currentDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
      ),
    db
      .prepare(
        `SELECT day, COUNT(*) AS pageviews,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors,
          SUM(is_landing) AS landings
         FROM site_analytics_events WHERE day >= ?
         GROUP BY day ORDER BY day ASC`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT path AS label, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY path ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT path AS label, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ? AND is_landing = 1
         GROUP BY path ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT source AS label, medium AS secondary, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY source, medium ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(search_query, ''), term) AS label,
          source AS secondary, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events
         WHERE day >= ? AND (search_query <> '' OR term <> '')
         GROUP BY label, source ORDER BY value DESC LIMIT 20`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS label, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY label ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT device AS label, browser AS secondary, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY device, browser ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(locale, ''), 'en') AS label, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY label ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(referrer_host, ''), 'Direct') AS label,
          source AS secondary, COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events WHERE day >= ?
         GROUP BY label, source ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT campaign AS label,
          source || CASE WHEN medium <> '' AND medium <> 'none' THEN ' / ' || medium ELSE '' END AS secondary,
          COUNT(*) AS value,
          COUNT(DISTINCT NULLIF(visitor_key, '')) AS visitors
         FROM site_analytics_events
         WHERE day >= ? AND campaign <> ''
         GROUP BY campaign, source, medium ORDER BY value DESC LIMIT 12`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT occurred_at, path, source, medium, campaign, ip_address,
          country, region, city, device, browser, visitor_key
         FROM site_analytics_events
         WHERE day >= ? ORDER BY occurred_at DESC LIMIT 40`,
      )
      .bind(currentDay),
    db
      .prepare(
        `SELECT
          SUM(CASE WHEN day >= ? AND metric = 'pageviews' THEN delta ELSE 0 END) AS pageviews,
          SUM(CASE WHEN day >= ? AND metric = 'visitors' THEN delta ELSE 0 END) AS visitors,
          SUM(CASE WHEN day >= ? AND metric = 'landings' THEN delta ELSE 0 END) AS landings,
          SUM(CASE WHEN day >= ? AND day < ? AND metric = 'pageviews' THEN delta ELSE 0 END) AS previous_pageviews,
          SUM(CASE WHEN day >= ? AND day < ? AND metric = 'visitors' THEN delta ELSE 0 END) AS previous_visitors,
          SUM(CASE WHEN day >= ? AND day < ? AND metric = 'landings' THEN delta ELSE 0 END) AS previous_landings
         FROM site_analytics_adjustments WHERE day >= ?`,
      )
      .bind(
        currentDay,
        currentDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
        currentDay,
        previousDay,
      ),
    db
      .prepare(
        `SELECT day,
          SUM(CASE WHEN metric = 'pageviews' THEN delta ELSE 0 END) AS pageviews,
          SUM(CASE WHEN metric = 'visitors' THEN delta ELSE 0 END) AS visitors,
          SUM(CASE WHEN metric = 'landings' THEN delta ELSE 0 END) AS landings
         FROM site_analytics_adjustments WHERE day >= ?
         GROUP BY day ORDER BY day ASC`,
      )
      .bind(currentDay),
  ];

  const results = await db.batch<NumericRow>(statements);
  const summaryRow = rowsFrom(results[0])[0] || {};
  const adjustmentRow = rowsFrom(results[12])[0] || {};
  const raw = {
    pageviews: numberValue(summaryRow.pageviews),
    visitors: numberValue(summaryRow.visitors),
    landings: numberValue(summaryRow.landings),
    previous: {
      pageviews: numberValue(summaryRow.previous_pageviews),
      visitors: numberValue(summaryRow.previous_visitors),
      landings: numberValue(summaryRow.previous_landings),
    },
  };
  const adjustments = {
    pageviews: numberValue(adjustmentRow.pageviews),
    visitors: numberValue(adjustmentRow.visitors),
    landings: numberValue(adjustmentRow.landings),
    previous: {
      pageviews: numberValue(adjustmentRow.previous_pageviews),
      visitors: numberValue(adjustmentRow.previous_visitors),
      landings: numberValue(adjustmentRow.previous_landings),
    },
  };
  const pageviews = Math.max(0, raw.pageviews + adjustments.pageviews);
  const visitors = Math.max(0, raw.visitors + adjustments.visitors);
  const landings = Math.max(0, raw.landings + adjustments.landings);

  const mapRankedRows = (result: AnalyticsD1Result<NumericRow> | undefined) =>
    rowsFrom(result).map(row => ({
      label: String(row.label || ''),
      secondary: String(row.secondary || ''),
      value: numberValue(row.value),
      visitors: numberValue(row.visitors),
    }));

  return {
    generatedAt: new Date().toISOString(),
    range: { days, start: currentDay, end: endDay },
    summary: {
      pageviews,
      visitors,
      landings,
      pagesPerVisitor: visitors ? pageviews / visitors : 0,
      previous: {
        pageviews: Math.max(0, raw.previous.pageviews + adjustments.previous.pageviews),
        visitors: Math.max(0, raw.previous.visitors + adjustments.previous.visitors),
        landings: Math.max(0, raw.previous.landings + adjustments.previous.landings),
      },
      raw,
      adjustments,
    },
    timeseries: (() => {
      const rawByDay = new Map(rowsFrom(results[1]).map(row => [String(row.day || ''), row]));
      const adjustmentsByDay = new Map(rowsFrom(results[13]).map(row => [String(row.day || ''), row]));
      return Array.from({ length: days }, (_value, index) => {
        const date = new Date(currentStart);
        date.setUTCDate(date.getUTCDate() + index);
        const day = dayKey(date);
        const rawDay = rawByDay.get(day) || {};
        const adjustmentDay = adjustmentsByDay.get(day) || {};
        return {
          day,
          pageviews: Math.max(0, numberValue(rawDay.pageviews) + numberValue(adjustmentDay.pageviews)),
          visitors: Math.max(0, numberValue(rawDay.visitors) + numberValue(adjustmentDay.visitors)),
          landings: Math.max(0, numberValue(rawDay.landings) + numberValue(adjustmentDay.landings)),
        };
      });
    })(),
    topPages: mapRankedRows(results[2]),
    landingPages: mapRankedRows(results[3]),
    sources: mapRankedRows(results[4]),
    keywords: mapRankedRows(results[5]),
    countries: mapRankedRows(results[6]),
    devices: mapRankedRows(results[7]),
    locales: mapRankedRows(results[8]),
    referrers: mapRankedRows(results[9]),
    campaigns: mapRankedRows(results[10]),
    recent: rowsFrom(results[11]).map(row => ({
      occurredAt: numberValue(row.occurred_at),
      path: String(row.path || ''),
      source: String(row.source || ''),
      medium: String(row.medium || ''),
      campaign: String(row.campaign || ''),
      ipAddress: String(row.ip_address || ''),
      country: String(row.country || ''),
      region: String(row.region || ''),
      city: String(row.city || ''),
      device: String(row.device || ''),
      browser: String(row.browser || ''),
      visitorKey: String(row.visitor_key || '').slice(0, 12),
    })),
  };
};

const adjustmentFromRow = (row: NumericRow): AnalyticsAdjustment => ({
  id: String(row.id || ''),
  day: String(row.day || ''),
  metric: String(row.metric || 'pageviews') as AnalyticsAdjustmentMetric,
  delta: numberValue(row.delta),
  source: String(row.source || ''),
  note: String(row.note || ''),
  createdAt: numberValue(row.created_at),
  updatedAt: numberValue(row.updated_at),
});

export const readAnalyticsAdjustments = async (db: AnalyticsDatabase, limit = 100) => {
  const result = await db
    .prepare(
      `SELECT id, day, metric, delta, source, note, created_at, updated_at
       FROM site_analytics_adjustments ORDER BY day DESC, updated_at DESC LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(200, Math.round(limit))))
    .run();
  return rowsFrom(result as AnalyticsD1Result<NumericRow>).map(adjustmentFromRow);
};

export const upsertAnalyticsAdjustment = async (db: AnalyticsDatabase, adjustment: AnalyticsAdjustment) => {
  const existing = await db
    .prepare(
      `SELECT id, day, metric, delta, source, note, created_at, updated_at
       FROM site_analytics_adjustments WHERE id = ?`,
    )
    .bind(adjustment.id)
    .first<NumericRow>();
  const persisted = existing ? { ...adjustment, createdAt: numberValue(existing.created_at) } : adjustment;
  const upsert = db
    .prepare(
      `INSERT INTO site_analytics_adjustments (
        id, day, metric, delta, source, note, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        day = excluded.day,
        metric = excluded.metric,
        delta = excluded.delta,
        source = excluded.source,
        note = excluded.note,
        updated_at = excluded.updated_at`,
    )
    .bind(
      persisted.id,
      persisted.day,
      persisted.metric,
      persisted.delta,
      persisted.source,
      persisted.note,
      persisted.createdAt,
      persisted.updatedAt,
    );
  const audit = db
    .prepare(
      `INSERT INTO site_analytics_adjustment_audit (
        audit_id, adjustment_id, action, payload_json, recorded_at
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      persisted.id,
      existing ? 'updated' : 'created',
      JSON.stringify(persisted),
      persisted.updatedAt,
    );
  await db.batch([upsert, audit]);
};

export const deleteAnalyticsAdjustment = async (db: AnalyticsDatabase, id: string) => {
  const existing = await db
    .prepare(
      `SELECT id, day, metric, delta, source, note, created_at, updated_at
       FROM site_analytics_adjustments WHERE id = ?`,
    )
    .bind(id)
    .first<NumericRow>();
  if (!existing) return false;
  const adjustment = adjustmentFromRow(existing);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM site_analytics_adjustments WHERE id = ?').bind(id),
    db
      .prepare(
        `INSERT INTO site_analytics_adjustment_audit (
          audit_id, adjustment_id, action, payload_json, recorded_at
         ) VALUES (?, ?, 'deleted', ?, ?)`,
      )
      .bind(crypto.randomUUID(), id, JSON.stringify(adjustment), now),
  ]);
  return true;
};

export const readExternalCache = async <T>(db: AnalyticsDatabase, key: string) => {
  const row = await db
    .prepare('SELECT payload_json, expires_at FROM site_analytics_external_cache WHERE key = ?')
    .bind(key)
    .first<{ payload_json: string; expires_at: number }>();
  if (!row) return null;

  try {
    return {
      value: JSON.parse(row.payload_json) as T,
      fresh: Number(row.expires_at) > Date.now(),
    };
  } catch {
    return null;
  }
};

export const writeExternalCache = async (db: AnalyticsDatabase, key: string, value: unknown, ttlSeconds: number) => {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO site_analytics_external_cache (key, payload_json, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         payload_json = excluded.payload_json,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(value), now + ttlSeconds * 1000, now)
    .run();
};
