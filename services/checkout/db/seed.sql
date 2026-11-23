INSERT INTO order_sequence (id, last_number) VALUES (1, 1000) ON CONFLICT (id) DO NOTHING;
