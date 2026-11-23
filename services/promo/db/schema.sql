-- promo-db schema. Applied by promo-service on startup (idempotent).
CREATE TABLE IF NOT EXISTS promotions (
  code          TEXT PRIMARY KEY,
  -- 'percent': flat percentage off. 'legacy_tiered': rules migrated from the old loyalty system.
  rule_type     TEXT    NOT NULL DEFAULT 'percent' CHECK (rule_type IN ('percent', 'legacy_tiered')),
  percent       INTEGER CHECK (percent BETWEEN 0 AND 100),
  -- legacy_tiered only: [{ "minSubtotalCents": int, "percent": int, "validUntil": "YYYY-MM-DD" }]
  legacy_rules  JSONB,
  -- Last day (UTC) the code can be used.
  expires_on    DATE    NOT NULL
);
