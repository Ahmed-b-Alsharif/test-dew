CREATE TABLE IF NOT EXISTS orders (
  order_number TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  total REAL NOT NULL,
  order_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
