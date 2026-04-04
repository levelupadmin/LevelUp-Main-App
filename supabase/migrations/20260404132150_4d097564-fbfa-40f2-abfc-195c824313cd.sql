
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed');

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all payments"
  ON public.payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Admins can manage all payments"
  ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
