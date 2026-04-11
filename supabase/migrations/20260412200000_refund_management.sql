CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  razorpay_payment_id text NOT NULL,
  razorpay_refund_id text,
  amount_inr numeric(10,2) NOT NULL,
  refund_type text NOT NULL CHECK (refund_type IN ('full','partial')),
  reason text NOT NULL,
  internal_notes text,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','processing','completed','failed')),
  initiated_by uuid NOT NULL REFERENCES public.users(id),
  error_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_refunds_payment_order ON public.refunds(payment_order_id);
CREATE INDEX idx_refunds_status ON public.refunds(status);
CREATE INDEX idx_refunds_created ON public.refunds(created_at DESC);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_refunds" ON public.refunds FOR ALL USING (public.is_admin());
