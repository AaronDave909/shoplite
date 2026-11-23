-- Sample catalog. ON CONFLICT keeps restarts idempotent (stock is not reset).
INSERT INTO products (id, name, price_cents, stock) VALUES
  ('mug',      'Observability Mug', 1800, 10000),
  ('hoodie',   'On-Call Hoodie',    5500, 10000),
  ('stickers', 'Sticker Pack',       600, 10000)
ON CONFLICT (id) DO NOTHING;
