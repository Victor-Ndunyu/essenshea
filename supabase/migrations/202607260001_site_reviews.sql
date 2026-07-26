CREATE TABLE IF NOT EXISTS site_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  source TEXT DEFAULT 'admin',
  is_visible BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly readable"
  ON site_reviews FOR SELECT
  USING (is_visible = true);

CREATE POLICY "Owner can manage reviews"
  ON site_reviews FOR ALL
  USING (false);

CREATE INDEX idx_site_reviews_visible_order ON site_reviews (is_visible, order_index);
