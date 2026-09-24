// Fork-owned and created by `ops/bootstrap.mjs`, not by a Drizzle migration,
// so upstream migration numbering stays untouched. Keep both copies identical.
export const STATUS_TRANSLATION_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS oeffigo_translation (kind TEXT NOT NULL CHECK (kind IN ('report','update','maintenance')), ref_id INTEGER NOT NULL, locale TEXT NOT NULL CHECK (locale = 'en'), title TEXT, message TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (kind, ref_id, locale))";
