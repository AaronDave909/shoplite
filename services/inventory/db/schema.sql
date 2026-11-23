-- inventory-db schema. Applied by inventory-service on startup (idempotent).
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock       INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS reservations (
  id          UUID PRIMARY KEY,
  status      TEXT        NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'released')),
  -- High-value reservations are flagged for a finance review.
  audit_flag  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservation_items (
  reservation_id UUID    NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  product_id     TEXT    NOT NULL REFERENCES products (id),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (reservation_id, product_id)
);
