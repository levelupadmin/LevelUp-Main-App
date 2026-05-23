-- ============================================================================
-- chapter_notes — per-user, per-chapter private notes for cross-device sync.
-- ============================================================================
--
-- Replaces the v1 localStorage-only notes scratchpad on the watching page.
-- Users typing notes on their laptop should see the same notes on their
-- phone, and vice versa. Storage is tiny (one row per user per chapter
-- they've taken notes in) and the access pattern is "load on chapter
-- open, upsert on debounced change", so a single composite-key table is
-- the right shape.
--
-- Security: RLS pins reads + writes to auth.uid() = user_id. Admins do
-- NOT get a blanket SELECT — notes are personal, not moderation surface.
-- If we ever need an admin override (e.g. legal hold) we'll add it
-- explicitly later.

CREATE TABLE IF NOT EXISTS public.chapter_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id  uuid        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  body        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chapter_notes_user_chapter_uniq UNIQUE (user_id, chapter_id)
);

-- Index supports the only query pattern we have: "give me this user's
-- note for this chapter". The unique constraint above also serves as
-- an index, but naming an explicit one keeps EXPLAIN output readable.
CREATE INDEX IF NOT EXISTS chapter_notes_user_chapter_idx
  ON public.chapter_notes (user_id, chapter_id);

-- updated_at maintained via trigger so client upserts don't have to
-- thread the value through manually.
CREATE OR REPLACE FUNCTION public.touch_chapter_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chapter_notes_set_updated_at ON public.chapter_notes;
CREATE TRIGGER chapter_notes_set_updated_at
  BEFORE UPDATE ON public.chapter_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_chapter_notes_updated_at();

ALTER TABLE public.chapter_notes ENABLE ROW LEVEL SECURITY;

-- One policy per command so the intent is greppable.
DROP POLICY IF EXISTS "Users read own notes"  ON public.chapter_notes;
DROP POLICY IF EXISTS "Users insert own notes" ON public.chapter_notes;
DROP POLICY IF EXISTS "Users update own notes" ON public.chapter_notes;
DROP POLICY IF EXISTS "Users delete own notes" ON public.chapter_notes;

CREATE POLICY "Users read own notes"
  ON public.chapter_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notes"
  ON public.chapter_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notes"
  ON public.chapter_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notes"
  ON public.chapter_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapter_notes TO authenticated;

COMMENT ON TABLE public.chapter_notes IS
  'Per-user notes typed on the watching page. RLS-scoped to the owner; not visible to admins.';
