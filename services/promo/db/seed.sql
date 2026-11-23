-- Sample promotions. ON CONFLICT keeps restarts idempotent.
INSERT INTO promotions (code, rule_type, percent, legacy_rules, expires_on) VALUES
  ('SAVE10',      'percent',       10,   NULL, '2099-12-31'),
  ('WELCOME5',    'percent',        5,   NULL, '2099-12-31'),
  ('BLACKFRIDAY', 'percent',       25,   NULL, '2025-11-30'),
  ('LEGACY_VIP',  'legacy_tiered', NULL,
     '[{"minSubtotalCents": 0, "percent": 15, "validUntil": "2024-06-30"},
       {"minSubtotalCents": 10000, "percent": 20, "validUntil": "2024-06-30"}]',
     '2024-06-30')
ON CONFLICT (code) DO NOTHING;
