-- Admin portal: (1) make the Users page load again, (2) one-click duplicate of
-- an offering / a course so a new batch can be set up without an engineer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users_unified — the anti-join that decides which legacy TagMango buyers
--    are "phantoms" (no real account yet) was written as
--        NOT EXISTS (… WHERE u.phone = le.phone OR lower(u.email) = lower(le.email))
--    The OR inside a NOT EXISTS defeats the hash anti-join: Postgres runs a
--    nested loop of 83,718 legacy rows × a users scan, which is past the
--    statement timeout for BOTH the admin Users page (it never rendered a row —
--    "the users page is not loading") and admin_dashboard_combined, which
--    counts this view. Splitting it into two NOT EXISTS is logically identical
--    (¬(A ∨ B) ≡ ¬A ∧ ¬B) and plans as two hash anti-joins: measured 161 ms
--    on production against a timeout before.
--
--    The SELECT lists are byte-identical to 20260527020000 — CREATE OR REPLACE
--    VIEW requires the same columns in the same order, and every consumer
--    (AdminUsers, admin_dashboard_combined, daily_signups_combined) keeps
--    working untouched.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.users_unified AS
WITH real_users AS (
  SELECT
    u.id, u.email, u.phone, u.full_name, u.role, u.member_number,
    u.created_at, u.last_active_at,
    true AS is_real,
    u.is_legacy,
    u.legacy_source,
    u.city, u.state, u.country,
    u.program_vertical, u.specific_vertical,
    COALESCE(u.lifetime_revenue_inr, 0) AS lifetime_revenue_inr,
    u.first_purchase_at, u.last_purchase_at,
    COALESCE(u.purchase_count, 0) AS purchase_count
  FROM public.users u
),
phantom_legacy AS (
  SELECT
    NULL::uuid                                       AS id,
    NULLIF(MAX(le.email),    '')                      AS email,
    le.phone                                          AS phone,
    NULLIF(MAX(le.full_name),'')                      AS full_name,
    'student'::text                                   AS role,
    NULL::integer                                     AS member_number,
    MIN(le.created_at)                                AS created_at,
    NULL::timestamptz                                 AS last_active_at,
    false                                             AS is_real,
    true                                              AS is_legacy,
    'tagmango'::text                                  AS legacy_source,
    NULLIF(MAX(le.city),  '')                         AS city,
    NULLIF(MAX(le.state), '')                         AS state,
    'India'::text                                     AS country,
    NULL::text                                        AS program_vertical,
    NULL::text                                        AS specific_vertical,
    COALESCE(SUM(le.legacy_amount_inr), 0)::integer   AS lifetime_revenue_inr,
    MIN(le.legacy_purchased_at)                       AS first_purchase_at,
    MAX(le.legacy_purchased_at)                       AS last_purchase_at,
    COUNT(*)::integer                                 AS purchase_count
  FROM public.legacy_enrolments le
  WHERE NOT EXISTS (
          SELECT 1 FROM public.users u WHERE u.phone = le.phone
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.users u
          WHERE le.email IS NOT NULL AND u.email IS NOT NULL
            AND lower(u.email) = lower(le.email)
        )
  GROUP BY le.phone
)
SELECT * FROM real_users
UNION ALL
SELECT * FROM phantom_legacy;

GRANT SELECT ON public.users_unified TO authenticated;
ALTER VIEW public.users_unified SET (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Duplicate a course (curriculum tree) and duplicate an offering.
--
--    Production convention (see ops/cohorts/BFP-23-SETUP.md): every batch is
--    its own offering with its own course, cloned from the previous batch. Until
--    now that clone was done by hand in SQL. These two RPCs do it in one
--    transaction from the admin UI.
--
--    What a course copy carries: the course row (rating / student counters
--    reset, slug made unique, hidden from Browse — but keeping the source
--    `status`: MyCoursesPage lists only published courses, so a 'draft' copy
--    would vanish for the new batch's students the moment they were enrolled;
--    the OFFERING copy being draft/private is what keeps the copy invisible), every section, every chapter
--    with its content pointers (the SAME VdoCipher id / storage object — media
--    is referenced, not re-uploaded), chapter resources, moments, quizzes +
--    questions + options, drip config, testimonials, certificate template and
--    instructor assignments. NOT copied: progress, notes, Q&A, reviews,
--    certificates issued, enrolments — those belong to the students of the
--    source.
--
--    What an offering copy carries: the offering row with status='draft' and
--    is_public=false (nobody can see or buy it until an admin flips it),
--    batch-specific dates and the WhatsApp group link cleared, checkout /
--    thank-you / tracking / cohort settings kept; its custom form fields,
--    order bumps and upsells; and its courses — duplicated (default) or shared.
--    NOT copied: enrolments, applications, batches, rooms, coupons, payments.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_slugify(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.admin_duplicate_course(
  p_course_id uuid,
  p_new_title text DEFAULT NULL,
  p_primary_offering_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src     public.courses%ROWTYPE;
  v_new_id  uuid := gen_random_uuid();
  v_title   text;
  v_base    text;
  v_slug    text;
  v_n       integer := 1;
  r_sec     RECORD;
  r_ch      RECORD;
  r_q       RECORD;
  r_qq      RECORD;
  v_new_sec uuid;
  v_new_ch  uuid;
  v_new_q   uuid;
  v_new_qq  uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course % not found', p_course_id;
  END IF;

  v_title := COALESCE(NULLIF(btrim(p_new_title), ''), v_src.title || ' (copy)');
  v_base  := COALESCE(NULLIF(public.admin_slugify(v_title), ''), 'course');
  v_slug  := v_base;
  WHILE EXISTS (SELECT 1 FROM public.courses WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO public.courses (
    id, title, slug, subtitle, description, category_id,
    instructor_display_name, instructor_bio, instructor_avatar_url,
    thumbnail_url, hero_image_url, trailer_video_url, level, language,
    what_youll_learn, tags, duration_minutes, total_lessons,
    drm_enabled, show_as_locked, status, published_at, sort_order,
    product_tier, duration_text, primary_offering_id, default_video_type,
    show_on_browse, outcomes, portfolio_pieces, instructor_credentials,
    instructor_links, faqs
  ) VALUES (
    v_new_id, v_title, v_slug, v_src.subtitle, v_src.description, v_src.category_id,
    v_src.instructor_display_name, v_src.instructor_bio, v_src.instructor_avatar_url,
    v_src.thumbnail_url, v_src.hero_image_url, v_src.trailer_video_url, v_src.level, v_src.language,
    v_src.what_youll_learn, v_src.tags, v_src.duration_minutes, v_src.total_lessons,
    v_src.drm_enabled, v_src.show_as_locked, v_src.status,
    CASE WHEN v_src.status = 'published' THEN now() ELSE NULL END, v_src.sort_order,
    v_src.product_tier, v_src.duration_text, p_primary_offering_id, v_src.default_video_type,
    false, v_src.outcomes, v_src.portfolio_pieces, v_src.instructor_credentials,
    v_src.instructor_links, v_src.faqs
  );

  FOR r_sec IN
    SELECT * FROM public.sections WHERE course_id = p_course_id ORDER BY sort_order, created_at
  LOOP
    v_new_sec := gen_random_uuid();
    INSERT INTO public.sections (id, course_id, title, sort_order, drip_days_after_enrolment, drip_specific_date)
    VALUES (v_new_sec, v_new_id, r_sec.title, r_sec.sort_order, r_sec.drip_days_after_enrolment, r_sec.drip_specific_date);

    FOR r_ch IN
      SELECT * FROM public.chapters WHERE section_id = r_sec.id ORDER BY sort_order, created_at
    LOOP
      v_new_ch := gen_random_uuid();
      INSERT INTO public.chapters (
        id, section_id, title, sort_order, content_type, media_url, embed_url,
        article_body, thumbnail_url, subtitle_url, description, duration_seconds,
        make_free, assignment_prompt, original_filename, file_size_bytes,
        video_type, vdocipher_video_id, vdocipher_watermark_text,
        vdocipher_thumbnail_url, media_provider, allow_download
      ) VALUES (
        v_new_ch, v_new_sec, r_ch.title, r_ch.sort_order, r_ch.content_type, r_ch.media_url, r_ch.embed_url,
        r_ch.article_body, r_ch.thumbnail_url, r_ch.subtitle_url, r_ch.description, r_ch.duration_seconds,
        r_ch.make_free, r_ch.assignment_prompt, r_ch.original_filename, r_ch.file_size_bytes,
        r_ch.video_type, r_ch.vdocipher_video_id, r_ch.vdocipher_watermark_text,
        r_ch.vdocipher_thumbnail_url, r_ch.media_provider, r_ch.allow_download
      );

      INSERT INTO public.chapter_resources (chapter_id, filename, file_url, file_size_bytes, sort_order)
      SELECT v_new_ch, filename, file_url, file_size_bytes, sort_order
      FROM public.chapter_resources WHERE chapter_id = r_ch.id;

      INSERT INTO public.chapter_moments (chapter_id, label, seconds, sort_order)
      SELECT v_new_ch, label, seconds, sort_order
      FROM public.chapter_moments WHERE chapter_id = r_ch.id;

      FOR r_q IN SELECT * FROM public.chapter_quizzes WHERE chapter_id = r_ch.id ORDER BY sort_order LOOP
        v_new_q := gen_random_uuid();
        INSERT INTO public.chapter_quizzes (id, chapter_id, title, description, pass_percentage, sort_order, is_active)
        VALUES (v_new_q, v_new_ch, r_q.title, r_q.description, r_q.pass_percentage, r_q.sort_order, r_q.is_active);

        FOR r_qq IN SELECT * FROM public.quiz_questions WHERE quiz_id = r_q.id ORDER BY sort_order LOOP
          v_new_qq := gen_random_uuid();
          INSERT INTO public.quiz_questions (id, quiz_id, question_text, question_type, explanation, sort_order)
          VALUES (v_new_qq, v_new_q, r_qq.question_text, r_qq.question_type, r_qq.explanation, r_qq.sort_order);

          INSERT INTO public.quiz_options (id, question_id, option_text, is_correct, sort_order)
          SELECT gen_random_uuid(), v_new_qq, option_text, is_correct, sort_order
          FROM public.quiz_options WHERE question_id = r_qq.id;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.course_drip_config (course_id, drip_mode)
  SELECT v_new_id, drip_mode FROM public.course_drip_config WHERE course_id = p_course_id;

  INSERT INTO public.course_testimonials (course_id, student_name, student_avatar_url, quote, cohort_label, rating, sort_order, is_active)
  SELECT v_new_id, student_name, student_avatar_url, quote, cohort_label, rating, sort_order, is_active
  FROM public.course_testimonials WHERE course_id = p_course_id;

  INSERT INTO public.certificate_templates (course_id, background_image_url, variable_positions, completion_threshold, auto_generate, is_active)
  SELECT v_new_id, background_image_url, variable_positions, completion_threshold, auto_generate, is_active
  FROM public.certificate_templates WHERE course_id = p_course_id;

  INSERT INTO public.instructor_course_assignments (instructor_id, course_id, assigned_by)
  SELECT instructor_id, v_new_id, auth.uid()
  FROM public.instructor_course_assignments WHERE course_id = p_course_id;

  INSERT INTO public.admin_audit_logs (actor_user_id, action, target_table, target_id, metadata)
  VALUES (auth.uid(), 'course.duplicate', 'courses', v_new_id,
          jsonb_build_object('source_course_id', p_course_id, 'title', v_title, 'slug', v_slug));

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_duplicate_offering(
  p_offering_id uuid,
  p_new_title text DEFAULT NULL,
  p_copy_curriculum boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src        public.offerings%ROWTYPE;
  v_new_id     uuid := gen_random_uuid();
  v_title      text;
  v_base       text;
  v_slug       text;
  v_n          integer := 1;
  r            RECORD;
  v_new_course uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.offerings WHERE id = p_offering_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offering % not found', p_offering_id;
  END IF;

  v_title := COALESCE(NULLIF(btrim(p_new_title), ''), v_src.title || ' (copy)');
  v_base  := COALESCE(NULLIF(public.admin_slugify(v_title), ''), 'offering');
  v_slug  := v_base;
  WHILE EXISTS (SELECT 1 FROM public.offerings WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO public.offerings (
    id, title, slug, description, type, price_inr, currency, subscription_period,
    validity_days, gst_mode, gst_rate, status, razorpay_plan_id, thumbnail_url,
    refund_policy_days, mrp_inr, meta_pixel_id, google_ads_conversion,
    custom_tracking_script, subtitle, banner_url, instructor_name, instructor_title,
    instructor_avatar_url, highlights, is_public, thankyou_thumbnail_url,
    thankyou_headline, thankyou_body, thankyou_cta_label, thankyou_cta_url,
    thankyou_auto_redirect, thankyou_redirect_seconds, payment_mode, app_fee_inr,
    confirmation_amount_inr, confirmation_deadline_days, balance_deadline_days,
    confirmation_grace_hours, tally_form_url, calendly_url, whatsapp_group_link,
    thankyou_show_calendly, attendance_threshold_pct, checkout_testimonials,
    checkout_bullets, checkout_guarantee_text, show_coupon_on_page, page_coupon_code,
    seats_total, cohort_sessions, cohort_start_date, application_deadline,
    intake_opens_at, identity_spine_enabled, product_tier
  ) VALUES (
    v_new_id, v_title, v_slug, v_src.description, v_src.type, v_src.price_inr, v_src.currency, v_src.subscription_period,
    v_src.validity_days, v_src.gst_mode, v_src.gst_rate, 'draft', v_src.razorpay_plan_id, v_src.thumbnail_url,
    v_src.refund_policy_days, v_src.mrp_inr, v_src.meta_pixel_id, v_src.google_ads_conversion,
    v_src.custom_tracking_script, v_src.subtitle, v_src.banner_url, v_src.instructor_name, v_src.instructor_title,
    v_src.instructor_avatar_url, v_src.highlights, false, v_src.thankyou_thumbnail_url,
    v_src.thankyou_headline, v_src.thankyou_body, v_src.thankyou_cta_label, v_src.thankyou_cta_url,
    v_src.thankyou_auto_redirect, v_src.thankyou_redirect_seconds, v_src.payment_mode, v_src.app_fee_inr,
    v_src.confirmation_amount_inr, v_src.confirmation_deadline_days, v_src.balance_deadline_days,
    v_src.confirmation_grace_hours, v_src.tally_form_url, v_src.calendly_url, NULL,
    v_src.thankyou_show_calendly, v_src.attendance_threshold_pct, v_src.checkout_testimonials,
    v_src.checkout_bullets, v_src.checkout_guarantee_text, v_src.show_coupon_on_page, v_src.page_coupon_code,
    v_src.seats_total, v_src.cohort_sessions, NULL, NULL,
    NULL, v_src.identity_spine_enabled, v_src.product_tier
  );

  FOR r IN
    SELECT oc.course_id, c.title
    FROM public.offering_courses oc
    JOIN public.courses c ON c.id = oc.course_id
    WHERE oc.offering_id = p_offering_id
  LOOP
    IF p_copy_curriculum THEN
      -- A batch course is usually titled exactly like its offering; keep that
      -- pairing on the copy. Anything else gets the plain "(copy)" suffix.
      v_new_course := public.admin_duplicate_course(
        r.course_id,
        CASE WHEN r.title = v_src.title THEN v_title ELSE r.title || ' (copy)' END,
        v_new_id
      );
      INSERT INTO public.offering_courses (offering_id, course_id) VALUES (v_new_id, v_new_course);
    ELSE
      INSERT INTO public.offering_courses (offering_id, course_id) VALUES (v_new_id, r.course_id);
    END IF;
  END LOOP;

  INSERT INTO public.custom_field_definitions (offering_id, label, field_type, options, is_required, sort_order)
  SELECT v_new_id, label, field_type, options, is_required, sort_order
  FROM public.custom_field_definitions WHERE offering_id = p_offering_id;

  INSERT INTO public.offering_bumps (parent_offering_id, bump_offering_id, bump_price_override_inr, headline, sort_order)
  SELECT v_new_id, bump_offering_id, bump_price_override_inr, headline, sort_order
  FROM public.offering_bumps WHERE parent_offering_id = p_offering_id;

  INSERT INTO public.offering_upsells (parent_offering_id, upsell_offering_id, headline, description, sort_order, is_active)
  SELECT v_new_id, upsell_offering_id, headline, description, sort_order, is_active
  FROM public.offering_upsells WHERE parent_offering_id = p_offering_id;

  INSERT INTO public.admin_audit_logs (actor_user_id, action, target_table, target_id, metadata)
  VALUES (auth.uid(), 'offering.duplicate', 'offerings', v_new_id,
          jsonb_build_object('source_offering_id', p_offering_id, 'title', v_title, 'slug', v_slug,
                             'copied_curriculum', p_copy_curriculum));

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_slugify(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_duplicate_course(uuid, text, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_duplicate_offering(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_slugify(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_duplicate_course(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_duplicate_offering(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_duplicate_course(uuid, text, uuid) IS
  'Admin-only. Deep-copies a course (sections, chapters, resources, quizzes, drip, testimonials, certificate template). Media is referenced, not re-uploaded. Returns the new course id.';
COMMENT ON FUNCTION public.admin_duplicate_offering(uuid, text, boolean) IS
  'Admin-only. Copies an offering as a draft, private product with its form fields, bumps and upsells; duplicates (default) or shares its courses. Never copies enrolments/applications. Returns the new offering id.';
