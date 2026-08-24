-- Neon Postgres Schema for Oriflame Shopping Assistant
-- Idempotent: safe to run multiple times

-- 1. Products Table
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_fr TEXT,
  name_ar TEXT,
  name_en TEXT,
  category TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  original_price NUMERIC(10, 2),
  original_catalog_price NUMERIC(10, 2),
  company_discount_applied BOOLEAN DEFAULT FALSE,
  company_discount_percent NUMERIC(5, 2) DEFAULT 0,
  is_promo BOOLEAN DEFAULT FALSE,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  size TEXT,
  suitable_for TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  description TEXT,
  description_fr TEXT,
  description_ar TEXT,
  description_en TEXT,
  benefits JSONB DEFAULT '[]'::jsonb,
  ingredients TEXT,
  how_to_use TEXT,
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  variants JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock);

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_phone TEXT,
  channel TEXT,
  notes TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10, 2) DEFAULT 0,
  currency TEXT DEFAULT 'TND',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 3. Deals Table (Threshold & Conditional Promotions)
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  title_fr TEXT,
  title_ar TEXT,
  title_en TEXT,
  description_fr TEXT,
  threshold_amount NUMERIC(10, 2) DEFAULT 0,
  product_id TEXT,
  product_name TEXT,
  product_image TEXT,
  product_price NUMERIC(10, 2) DEFAULT 0,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Bundles Table (Duo/Trio Packs)
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  title TEXT,
  title_fr TEXT,
  title_ar TEXT,
  title_en TEXT,
  description TEXT,
  description_fr TEXT,
  description_ar TEXT,
  description_en TEXT,
  product_ids JSONB DEFAULT '[]'::jsonb,
  bundle_price NUMERIC(10, 2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Carousel Table (Homepage Hero Slides)
CREATE TABLE IF NOT EXISTS carousel (
  id TEXT PRIMARY KEY,
  image_url TEXT,
  badge TEXT,
  title TEXT,
  description TEXT,
  button_link TEXT,
  button_text TEXT,
  offer_product_code TEXT,
  offer_product_name TEXT,
  offer_price NUMERIC(10, 2),
  offer_original_price NUMERIC(10, 2),
  active BOOLEAN DEFAULT TRUE
);

-- 6. Settings Table (Single-row configuration)
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  facebook_username TEXT DEFAULT 'Mounanouira.Oriflame',
  currency TEXT DEFAULT 'TND',
  admin_pwd TEXT DEFAULT 'mouna2024',
  phone TEXT DEFAULT '55 756 629',
  whatsapp_phone TEXT DEFAULT '55756629',
  company_discount_applied BOOLEAN DEFAULT FALSE,
  company_discount_percent NUMERIC(5, 2) DEFAULT 20,
  company_discount_applied_at TIMESTAMPTZ,
  featured_deal_ids JSONB DEFAULT '[]'::jsonb
);

-- 7. Analytics Summary Table (Single-row counters)
CREATE TABLE IF NOT EXISTS analytics_summary (
  id INT PRIMARY KEY DEFAULT 1,
  total_visits INT DEFAULT 0
);

-- 8. Analytics Sessions Table
CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  device TEXT,
  language TEXT,
  duration_seconds INT DEFAULT 0,
  activity_trail JSONB DEFAULT '[]'::jsonb,
  categories_visited JSONB DEFAULT '[]'::jsonb,
  products_viewed JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_active ON analytics_sessions(last_active DESC);
