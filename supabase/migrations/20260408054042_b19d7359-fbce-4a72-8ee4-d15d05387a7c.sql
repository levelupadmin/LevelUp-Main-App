CREATE POLICY payment_orders_guest_read
  ON payment_orders
  FOR SELECT
  TO anon
  USING (
    guest_email IS NOT NULL
    AND status = 'captured'
  );