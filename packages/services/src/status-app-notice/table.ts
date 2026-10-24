// Fork-owned and created by `ops/bootstrap.mjs`, not by a Drizzle migration,
// so upstream migration numbering stays untouched. Keep both copies identical.
export const STATUS_APP_NOTICE_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS oeffigo_app_notice (kind TEXT NOT NULL CHECK (kind IN ('report','maintenance')), ref_id INTEGER NOT NULL, show_in_app INTEGER NOT NULL DEFAULT 0 CHECK (show_in_app IN (0, 1)), regions TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL, PRIMARY KEY (kind, ref_id))";
