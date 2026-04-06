
ALTER TABLE courses ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 50;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS product_tier text NOT NULL DEFAULT 'masterclass';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration_text text;
