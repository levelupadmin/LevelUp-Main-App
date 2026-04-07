-- Allow anonymous users to read published courses (needed for public offering page nested select)
CREATE POLICY courses_public_read ON courses
  FOR SELECT
  TO anon
  USING (status = 'published');

-- Default is_public to true for new offerings
ALTER TABLE offerings ALTER COLUMN is_public SET DEFAULT true;

-- Set all existing active offerings to public
UPDATE offerings SET is_public = true WHERE status = 'active';