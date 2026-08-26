CREATE TABLE IF NOT EXISTS manager_product_drafts (
  id TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  product_title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  workflow_request_id TEXT,
  workflow_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_manager_product_drafts_updated_at
  ON manager_product_drafts(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_manager_product_drafts_product_slug
  ON manager_product_drafts(product_slug);

CREATE TABLE IF NOT EXISTS site_analytics_events (
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
);

CREATE INDEX IF NOT EXISTS idx_site_analytics_events_day
  ON site_analytics_events(day);

CREATE INDEX IF NOT EXISTS idx_site_analytics_events_occurred_at
  ON site_analytics_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS site_analytics_adjustments (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('pageviews', 'visitors', 'landings')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  source TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_analytics_adjustments_day
  ON site_analytics_adjustments(day DESC);

CREATE TABLE IF NOT EXISTS site_analytics_adjustment_audit (
  audit_id TEXT PRIMARY KEY,
  adjustment_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  payload_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_analytics_adjustment_audit_recorded_at
  ON site_analytics_adjustment_audit(recorded_at DESC);

CREATE TABLE IF NOT EXISTS site_analytics_maintenance (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_analytics_external_cache (
  key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
