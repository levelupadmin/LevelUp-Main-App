-- Wishlist: users can save offerings for later
CREATE TABLE IF NOT EXISTS public.wishlisted_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, offering_id)
);

-- RLS: users can only see/manage their own wishlist
ALTER TABLE public.wishlisted_offerings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist"
  ON public.wishlisted_offerings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_wishlisted_offerings_user ON public.wishlisted_offerings(user_id);
