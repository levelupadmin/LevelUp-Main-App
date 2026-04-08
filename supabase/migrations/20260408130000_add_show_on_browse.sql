-- Add show_on_browse toggle to courses table
-- Separate from status: "published" means content is live for enrolled students,
-- "show_on_browse" means it's discoverable on the programs/browse page.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS show_on_browse boolean DEFAULT true;

COMMENT ON COLUMN courses.show_on_browse IS 'Whether this course appears on the student Browse Programs page. Independent of status — a published course can be hidden from browse (e.g., old batches).';
