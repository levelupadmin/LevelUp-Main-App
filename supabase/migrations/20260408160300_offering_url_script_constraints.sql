-- Deep sweep fix: add length + format constraints on admin-supplied fields
-- that end up in student-visible pages.
--
-- 1. thankyou_cta_url is rendered directly into window.location.href in
--    ThankYou.tsx with no validation, making it an admin-authored open
--    redirect. PR #1 fixed the XSS path via iframe sandbox, but an admin
--    with a compromised session could still set any target. We enforce:
--      - must be null OR an http/https URL
--      - length <= 500
--    The frontend also does URL parsing, but DB constraints stop bad rows
--    from being written by any path (admin UI, SQL console, imports).
--
-- 2. custom_tracking_script is an admin-authored <script> blob. PR #1
--    sandboxes it, but we still want to cap its length to prevent abuse.
--
-- 3. thankyou_body is rendered into the sandboxed iframe. Cap length.

ALTER TABLE offerings
  DROP CONSTRAINT IF EXISTS offerings_thankyou_cta_url_check,
  ADD CONSTRAINT offerings_thankyou_cta_url_check CHECK (
    thankyou_cta_url IS NULL
    OR (
      length(thankyou_cta_url) <= 500
      AND thankyou_cta_url ~* '^https?://'
    )
  );

ALTER TABLE offerings
  DROP CONSTRAINT IF EXISTS offerings_custom_tracking_script_len_check,
  ADD CONSTRAINT offerings_custom_tracking_script_len_check CHECK (
    custom_tracking_script IS NULL
    OR length(custom_tracking_script) <= 10000
  );

ALTER TABLE offerings
  DROP CONSTRAINT IF EXISTS offerings_thankyou_body_len_check,
  ADD CONSTRAINT offerings_thankyou_body_len_check CHECK (
    thankyou_body IS NULL
    OR length(thankyou_body) <= 5000
  );
