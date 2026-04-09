-- Fix: SECURITY DEFINER functions in email_infra missing SET search_path.
-- Without it, a malicious object in the search path could shadow pgmq.* calls.

CREATE OR REPLACE FUNCTION public.enqueue_email(
  p_to text,
  p_subject text,
  p_html text,
  p_from text DEFAULT NULL,
  p_reply_to text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_msg_id bigint;
BEGIN
  SELECT pgmq.send(
    'email_queue',
    jsonb_build_object(
      'to', p_to,
      'subject', p_subject,
      'html', p_html,
      'from', p_from,
      'reply_to', p_reply_to
    )
  ) INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(p_batch_size int DEFAULT 10)
RETURNS TABLE (msg_id bigint, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.message
    FROM pgmq.read('email_queue', 30, p_batch_size) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(p_msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete('email_queue', p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(p_msg_id bigint, p_error text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_row record;
  v_dlq_id bigint;
BEGIN
  SELECT * INTO v_row
    FROM pgmq.read('email_queue', 0, 1)
    WHERE msg_id = p_msg_id
    LIMIT 1;

  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pgmq.send(
    'email_dlq',
    v_row.message || jsonb_build_object('error', p_error, 'original_msg_id', p_msg_id)
  ) INTO v_dlq_id;

  PERFORM pgmq.delete('email_queue', p_msg_id);
  RETURN v_dlq_id;
END;
$$;

-- Restrict to service_role only
REVOKE ALL ON FUNCTION public.enqueue_email(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.read_email_batch(int) FROM public;
GRANT EXECUTE ON FUNCTION public.read_email_batch(int) TO service_role;

REVOKE ALL ON FUNCTION public.delete_email(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_email(bigint) TO service_role;

REVOKE ALL ON FUNCTION public.move_to_dlq(bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(bigint, text) TO service_role;
