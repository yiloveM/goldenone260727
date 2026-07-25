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

