-- orders-db schema. Applied by checkout-service on startup (idempotent).

-- Single-row counter for human-readable order numbers. Every order takes a row lock here.
CREATE TABLE IF NOT EXISTS order_sequence (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  last_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id             UUID PRIMARY KEY,
  order_number   INTEGER     NOT NULL UNIQUE,
  promo_code     TEXT,
  subtotal_cents INTEGER     NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER     NOT NULL CHECK (discount_cents >= 0),
  total_cents    INTEGER     NOT NULL CHECK (total_cents >= 0),
  reservation_id UUID        NOT NULL,
  lines          JSONB       NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
