-- Add thank you page customization columns to offerings
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS thankyou_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thankyou_headline text DEFAULT 'Payment Successful!',
  ADD COLUMN IF NOT EXISTS thankyou_body text,
  ADD COLUMN IF NOT EXISTS thankyou_cta_label text DEFAULT 'Go to Dashboard',
  ADD COLUMN IF NOT EXISTS thankyou_cta_url text,
  ADD COLUMN IF NOT EXISTS thankyou_auto_redirect boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS thankyou_redirect_seconds integer DEFAULT 10;

-- Add comments for documentation
COMMENT ON COLUMN offerings.thankyou_thumbnail_url IS 'Hero image/banner shown on the thank you page';
COMMENT ON COLUMN offerings.thankyou_headline IS 'Custom headline on the thank you page';
COMMENT ON COLUMN offerings.thankyou_body IS 'Custom body text on the thank you page';
COMMENT ON COLUMN offerings.thankyou_cta_label IS 'Label for the main CTA button on the thank you page';
COMMENT ON COLUMN offerings.thankyou_cta_url IS 'Custom URL for the CTA button (null = default dashboard)';
COMMENT ON COLUMN offerings.thankyou_auto_redirect IS 'Whether to auto-redirect after countdown';
COMMENT ON COLUMN offerings.thankyou_redirect_seconds IS 'Seconds before auto-redirect (default 10)';
