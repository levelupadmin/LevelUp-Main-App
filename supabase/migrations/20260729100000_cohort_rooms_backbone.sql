-- ============================================================================
-- COHORT ROOMS — R-1: config + membership backbone
-- Phase R0, task R-1. Merges design/cohorts/migrations-draft/0001 + 0002 into
-- ONE file: 0001's room_configs read policy calls a helper defined by 0002, so
-- splitting them re-introduces an apply-order foot-gun.
--
-- 🔴 Tier 1 — triggers attach to `enrolments` / `cohort_batch_members` /
-- `cohort_applications` (the money path's own tables) and this file owns the RLS
-- spine every room policy routes through. DO NOT APPLY TO PROD from this branch:
-- the orchestrator runs the bugfix council, proves qa-harness/cohort-room-access
-- green on a SHADOW project, takes a prod backup, and only then pushes.
--
-- Additive · idempotent (re-runnable) · reversible (single commented DOWN block
-- at the foot of this file). NOTHING HERE RAISES: an aborting DO block in a
-- shared `db push` would take sibling migrations down with it, so the only RAISE
-- level used anywhere below is WARNING. Rejections are expressed as "no row
-- written / NULL returned", never as a raised error.
--
-- ---------------------------------------------------------------------------
-- CONTRACT FOR R-2 / R-3 / R-4 — read this before writing a policy or an RPC
-- ---------------------------------------------------------------------------
-- 1. THIS FILE OWNS EVERY ACCESS HELPER. R-2's content policies and R-3's RPCs
--    CALL them and define no access logic of their own (NFR-SEC-2, the
--    one-helper doctrine). The helpers are:
--
--      cohort_room_is_member(offering)             -- ENROLLED-ONLY, any batch
--      cohort_room_can_access(offering, batch)     -- ENROLLED-ONLY, batch-precise
--      cohort_room_can_post_announcement(offering) -- mentor/host (+admin)
--      cohort_room_in_lobby(offering, batch)       -- pre_member ONLY
--      cohort_room_in_lobby(offering)              --   …batch-agnostic overload
--      cohort_room_is_offering_wide(offering)      -- NULL-batch mentor/host (+admin)
--      cohort_room_phase(offering, batch)          -- batch override wins
--
--    CITE THESE BY NAME, NEVER BY LINE. R-2 and R-3 carry `20260729100000:NNN`
--    citations into this file; every one of them predates the 2026-07-27 review
--    fixes below and the line numbers have all shifted. The NAMES and the
--    SEMANTICS are the contract; a line number is a courtesy that goes stale.
--
--    CROSS-FILE LEDGER — two items, both now closed, recorded so neither is
--    silently re-opened:
--
--    (i) OFFERING-WIDE SCOPE — CLOSED. R-3's `cohort_room_caller_scope()` used
--        to re-state the staff lift inline as
--        `(m.batch_id IS NULL AND m.role IN ('mentor','host'))`. That predicate
--        is published here as `cohort_room_is_offering_wide()` (it already ORs
--        in is_admin()), and R-3 §1 now SELECTs it instead of recomputing it.
--        R-3 still reads `cohort_room_members` directly for the roster and the
--        caller's batch — a data read, not an access decision, and it stays.
--
--    (ii) LOBBY BATCH SCOPE — CLOSED, and this is a SEMANTIC TIGHTENING against
--        the drafts, which is why it is minuted here rather than left to the
--        function comment. `cohort_room_in_lobby(offering, batch)` is
--            role = 'pre_member' AND (p_batch IS NULL OR m.batch_id = p_batch)
--        with NO `OR m.batch_id IS NULL` third disjunct. A lobby row is never
--        batch-scoped, so for a batch-A1 row the predicate is `NULL = A1` → NULL
--        → false: a pre_member reads the OFFERING-LEVEL rows and no batch's rows
--        at all (contract note 4). An earlier R-3 pass built an `all_batches`
--        flag on the opposite reading and handed a lobby occupant every batch's
--        announcements through a SECURITY DEFINER RPC — strictly more than R-2's
--        table policy grants. That flag was withdrawn in R-3's Round-G rollback
--        (20260729100200 §1, which quotes this predicate back). ANY future
--        change to this helper's batch clause is a cross-file change: it moves
--        R-2's `can_access(...) OR in_lobby(...)` policies and R-3's envelope
--        scoping together, and must be minuted here first.
--
-- 2. ⚠️ `pre_member` IS NOT A MEMBER. The draft matched any row with
--    status='active' and never filtered role, so the first pre_member row would
--    have handed FULL member read to every content policy routed through
--    cohort_room_can_access() — silently defeating Δ2. Both member helpers are
--    ENROLLED-ONLY: role IN ('member','alumni','mentor','host').
--    `pre_member` is EXCLUDED and is matched ONLY by cohort_room_in_lobby(),
--    which gates nothing but the SEC-MEMBER-1 whitelist (masthead/theme,
--    this-week overview, cohort-mate presence, announcements READ, schedule).
--    NEVER widen a member helper to include pre_member; a whitelisted surface is
--    written `can_access(...) OR in_lobby(...)`, never by loosening can_access.
--
-- 3. ROLE VOCABULARY (settles A5). Δ2's "three tiers" describes the three ACCESS
--    tiers (accepted / confirmation_paid / enrolled), NOT the role enum. The
--    CHECK keeps all five values — `member`, `pre_member`, `mentor`, `host`,
--    `alumni` — because R-3's can_post_announcement + roster ordering depend on
--    `host` and the alumni phase flip depends on `alumni`. Mapping:
--      access tier 1  accepted          → NO row at all (never written here)
--      access tier 2  confirmation_paid → role 'pre_member'   (lobby helper)
--      access tier 3  enrolled          → role 'member'|'alumni'|'mentor'|'host'
--
--    TIER 3 IS AN ACTIVE `enrolments` ROW **THAT OWES NOTHING**, not a batch
--    assignment and NOT merely an active enrolment. Two facts about this
--    codebase force both halves of that sentence:
--
--      · Batch assignment is a manual admin action (AdminCohorts.tsx writes
--        cohort_batch_members; no payment handler does), so deriving `member`
--        from the roster alone stranded a fully paid student in the lobby for
--        the whole window between payment and assignment. Branch (a2) mints an
--        offering-wide `member` row from the enrolment, and branch (a) replaces
--        it with the batch-scoped row when the roster catches up. That is also
--        what makes R-3's "member with no batch yet (pre_start)" edge reachable.
--
--      · ⚠️ AN ACTIVE ENROLMENT DOES NOT IMPLY THE BALANCE IS PAID. On the
--        staged path razorpay-webhook/index.ts:313 enrols on the CONFIRMATION
--        capture (`shouldEnrol = !isStaged || payment_type === 'balance' ||
--        payment_type === 'confirmation'`, INSERT at :322-336) while the balance
--        is still owed for up to `offerings.balance_deadline_days` (default 15),
--        and nothing revokes it if the balance never lands. Reading "active
--        enrolment ⇒ member" therefore promoted every confirmation-paid
--        applicant to FULL member at the first 03:45 reconcile and handed them
--        curriculum detail, recordings, assignments, feedback and community
--        write — the five surfaces Δ2/SEC-MEMBER-1 reserve for `enrolled`.
--        Branches (a) and (a2) are gated on `_room_balance_outstanding()`
--        instead: a staged applicant whose LATEST application still reads
--        'confirmation_paid' while price − app_fee − confirmation > 0 stays a
--        `pre_member` no matter what the enrolments table says. The balance
--        capture flips the application to 'balance_paid'/'enrolled', the
--        application trigger fires, and branch (a2) promotes the SAME row to
--        `member`. The predicate mirrors verify-razorpay-payment's own
--        `confirmationCoversAll` arithmetic (index.ts:614-634) so a
--        confirmation that covers the whole price is a member immediately.
--
-- 4. BATCH SCOPE. A membership row with `batch_id IS NULL` is offering-wide ONLY
--    for `mentor`/`host`. For `member`/`alumni`/`pre_member` a NULL batch means
--    "not scoped to a batch yet": it unlocks the offering-level surfaces (rows
--    whose own batch_id is NULL — the masthead config, offering-wide
--    announcements) and NOTHING batch-specific. Without that rule a batch-less
--    member — or a manual `member` grant — would have read every batch of the
--    offering at once.
--
-- 5. MEMBERSHIP IS SERVER-DERIVED (NFR-SEC-1 / SEC-ENT-1). The only writers are
--    the SECURITY DEFINER resolver (fired by triggers on payment/admin-gated
--    truth tables), the alumni-flip trigger, the nightly reconcile, and the
--    is_admin()-guarded manual grant/revoke RPCs. `authenticated` holds SELECT on
--    its own rows and NO INSERT/UPDATE/DELETE **AND NO TRUNCATE** on either room
--    table — all four revoked explicitly, because Supabase's bootstrap `ALTER
--    DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
--    authenticated, service_role` hands every new table full DML to the client
--    roles, and `ALL` is seven verbs, not four. TRUNCATE is in the revoke because
--    TRUNCATE BYPASSES RLS ENTIRELY — see §7 for the scope of that claim, which
--    is defence-in-depth and sign-off accuracy, not a live PostgREST hole. Admin
--    config writes go through `admin_upsert_room_config()` (SECURITY DEFINER,
--    is_admin()-gated), not through PostgREST DML.
--
-- 6. REVOCATION IS TERMINAL, and idempotent across runs. Once a NON-ACTIVE
--    `enrolments` row exists for (user, offering) the lobby is over for that
--    offering, whatever the application still says: an enrolment flipped to
--    revoked/cancelled/expired leaves the user with zero active rows, and the
--    NEXT resolver run (or the 03:45 reconcile) produces the same zero rows
--    rather than resurrecting a `pre_member` row from the untouched application.
--    Nothing in the app resets `cohort_applications.status` on a refund, so the
--    application can never be the revocation's memory — the enrolment row is.
--    A re-purchase inserts a NEW active enrolment and the room comes back.
--    The one enrolments row that does NOT end the lobby is the staged
--    confirmation enrolment described in note 3: ACTIVE and balance-outstanding,
--    it is the lobby occupant's own row, not the end of their lobby.
--
-- 7. DEVIATIONS FROM THE DRAFTS, each deliberate:
--    a. `admin_grant_room_member` returns NULL (+ a WARNING) instead of raising
--       'admin only' — the nothing-raises rule. R-4 asserts "returns NULL
--       and writes no row", not "raises".
--    b. The 0001 batch-guard trigger (which raised) is replaced by a real
--       composite FK to cohort_batches(id, offering_id). Declarative, cheaper,
--       and it cannot abort a push.
--    c. theme's accent CHECK now also admits the `{}` default, which the draft's
--       version rejected outright — DEFAULT '{}'::jsonb was unsatisfiable.
--    d. `cohort_room_configs.vocab jsonb` is added (REQ-VOCAB-1, ERD §17):
--       R-3 validates channel_key against `vocab.niche_channels` and R-4's W8
--       case is untestable without the column.
--    e. Uniqueness is TWO partial indexes rather than one UNIQUE(user, offering,
--       batch): NULLs are distinct in a plain unique constraint, so lobby rows
--       (batch_id IS NULL) would have duplicated freely and ON CONFLICT would
--       never have matched them.
--    f. A manual `member`/`alumni` grant IS retracted by the resolver in one
--       narrow case: the user's `enrolments` row for that offering was
--       REVOKED or CANCELLED (refund / revocation) and there is no active one.
--       `expired` is deliberately NOT in that list — it is the ordinary
--       end-of-access state (there is a whole index for it,
--       idx_enrolments_expires_at … WHERE status='active'), and comping a
--       lapsed alum back into a room is the single most likely use of a manual
--       `member` grant. Reading `status <> 'active'` swept expired and cancelled
--       in with revoked, so that grant returned a uuid and then silently
--       self-destructed at the next resolver run. A comped member — no
--       enrolments row at all — survives, and a manual `mentor`/`host` grant
--       survives unconditionally, as the brief requires. When the retraction
--       DOES fire it now emits a WARNING naming the user and the count, and
--       admin_grant_room_member() warns up front when the grant it is about to
--       write is one the resolver will take away. Any manual grant can also be
--       withdrawn explicitly with admin_revoke_room_member().
--
-- 8. FORCING A TRIGGER FAILURE (R-4 / SEC-ENT-2, no test backdoor is compiled
--    in). On the shadow project:
--       ALTER TABLE public.cohort_room_members
--         ADD CONSTRAINT tmp_force_resolver_fail CHECK (false) NOT VALID;
--       -- now INSERT an enrolment / insert a cohort_batch_members row / flip an
--       -- enrolment status: the resolver throws, the guard swallows it as a
--       -- WARNING, and the money write STILL COMMITS. Then:
--       ALTER TABLE public.cohort_room_members DROP CONSTRAINT tmp_force_resolver_fail;
--       SELECT public.cohort_room_reconcile();   -- drift self-heals
--
--    That recipe only ever throws INSIDE the resolver, so it cannot prove
--    anything about a trigger's own driving query. For that half, make reading
--    `enrolments` itself raise — rename the table aside and put a view over it
--    whose WHERE clause calls a raising function — then insert a
--    cohort_batch_members row: the error lands in the trigger's array_agg, not
--    in the resolver, and the roster write must still commit. Undo by dropping
--    the view and renaming the table back.
--
-- 9. TRIGGER COVERAGE — every write that can change a room membership fires the
--    resolver SYNCHRONOUSLY, so nobody waits for 03:45. Four triggers:
--      cohort_batch_members  INSERT/UPDATE/DELETE  (admin roster edits)
--      enrolments            INSERT WHEN status='active'   ← see below
--      enrolments            UPDATE OF status               (revoke/refund/expiry)
--      cohort_applications   UPDATE OF status, confirmation_payment_id, user_id
--    The enrolment INSERT trigger exists because THREE live paths create an
--    enrolment and never touch cohort_applications again:
--      · verify-razorpay-payment's `confirmationCoversAll` branch (index.ts
--        :614-634) — enrols and leaves the application at 'confirmation_paid';
--      · the non-staged path (`!isStaged`) — no application row exists at all;
--      · direct INSERTs from admin grants and the legacy/onboarding RPCs
--        (20260611100000:63, 20260524180000:235/287, 20260603120000:149).
--    Without it a fully paid student sat locked out for up to ~24h. It is AFTER,
--    exception-guarded like the rest, fires only for `status='active'`, and
--    short-circuits on a single index probe when the offering has no room
--    config — so a masterclass checkout, which is the overwhelming majority of
--    enrolment INSERTs, pays one EXISTS and nothing else. The A6 block at the
--    foot of this file measures the money path WITH the trigger installed, both
--    for a room-bearing offering (worst case) and a room-less one (the common
--    case), and both are far inside the 5 ms budget.
--
-- 10. THE EXCEPTION-HANDLER LIST — why every guard below names codes explicitly
--    instead of stopping at `WHEN OTHERS`. PL/pgSQL's `OTHERS` does NOT trap
--    `query_canceled` (57014) or `assert_failure` (P0004); the manual is
--    explicit about it. 57014 is the one that matters here: it is what a
--    `statement_timeout`, a `pg_cancel_backend()` and a cancelled lock wait all
--    raise. A `WHEN OTHERS`-only guard therefore lets a resolver that ran out of
--    statement budget propagate straight through an AFTER trigger and ROLL BACK
--    THE ENROLMENT INSERT — the money write — at the moment of purchase, which
--    is precisely what SEC-ENT-2 forbids.
--
--    THERE ARE TWO GUARD SHAPES BELOW, and which one a site uses is a decision,
--    not a copy-paste. Read this before adding a third.
--
--    (A) THE SWALLOW — for a guard standing in front of a write that MUST
--        commit: every AFTER trigger on `enrolments` / `cohort_batch_members` /
--        `cohort_applications`, the alumni flip, and every DDL block in this
--        file and in 20260729100100 — including the four trigger-ATTACH blocks
--        in §7A, which take a lock on the money tables themselves (SHARE ROW
--        EXCLUSIVE on a first apply, ACCESS EXCLUSIVE on a re-run; the three
--        lock classes are measured out below).
--        It reads:
--
--          EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
--                      OR crash_shutdown OR cannot_connect_now OR others THEN
--
--        · `query_canceled` / `assert_failure` — the two codes `OTHERS` skips.
--          These are the only two names in the list that change what the
--          handler catches.
--        · 57P01/57P02/57P03 (admin_shutdown / crash_shutdown /
--          cannot_connect_now) are NOT "already covered by OTHERS" either — an
--          earlier revision of this note said so and it was wrong in the other
--          direction. They arrive at FATAL (57P03 at connection time), which
--          terminates the backend instead of unwinding into a PL/pgSQL handler,
--          so no handler traps them at all. Naming them therefore neither adds
--          nor removes coverage: it is documentation, kept so the list is
--          greppable and so nobody reading a money-path guard has to re-derive
--          which shutdown code is or is not inside `OTHERS`. It costs nothing —
--          a handler is chosen by first match.
--        · What `OTHERS` DOES carry here, and what the list therefore does not
--          need to name: every ordinary ERROR, including 55P03
--          `lock_not_available` — the code a wait cut short by the LOCAL
--          `lock_timeout` at every §7A site raises. A bounded wait is caught by
--          the plain `OTHERS`; 57014 is what a `statement_timeout` or a
--          `pg_cancel_backend()` aimed at the push raises, and that is the one
--          the explicit names exist for.
--
--    (B) THE PER-ITEM SKIP — for a LOOP that resolves many users inside one
--        statement: the batch-member trigger's FOREACH and
--        cohort_room_reconcile()'s nightly sweep. There a cancel and an error
--        are different events and are handled separately:
--
--          WHEN query_canceled OR admin_shutdown OR crash_shutdown
--               OR cannot_connect_now THEN   -- WARN, flag, and EXIT the loop
--          WHEN assert_failure OR others THEN            -- WARN and carry on
--
--        The reason is mechanical rather than stylistic. Postgres arms
--        `statement_timeout` once per top-level statement and disarms it the
--        moment it fires; a `pg_cancel_backend()` likewise sets
--        QueryCancelPending once. A loop that TRAPS a cancel and keeps going has
--        therefore consumed the only interrupt it is going to get: every
--        remaining iteration runs with no timer armed and no way for an operator
--        to stop it. Using shape (A) in a loop would make the 03:45 sweep immune
--        to BOTH `statement_timeout` and `pg_cancel_backend()` — over a
--        four-way UNION candidate set that is the whole room world, unbounded.
--        Trapping the cancel only in order to STOP is what keeps both
--        properties: the interrupt is honoured (the loop ends), the caller's
--        write is still never aborted, and whoever was skipped re-derives on the
--        next run, because the sweep is idempotent.
--
--    ACCEPTED CONSEQUENCE OF SHAPE (A), stated so it is a decision and not an
--    accident: swallowing 57014 inside the trigger means an operator's
--    `pg_cancel_backend()` aimed at a slow enrolment statement is absorbed by
--    the room's trigger rather than killing the statement. That is the trade
--    SEC-ENT-2 asks for — the room is downstream of the money, never in front of
--    it — and the swallow is never silent: it emits a WARNING carrying SQLSTATE,
--    and the 03:45 reconcile re-derives whatever the cancelled resolver missed.
--    Use `pg_terminate_backend()` if such a statement genuinely has to die.
--    The trade is bought for the MONEY PATH ONLY. It is paid for by the
--    reconcile, so the reconcile itself must stay killable — which is exactly
--    what shape (B) is for. A cancel aimed at `SELECT
--    public.cohort_room_reconcile();` still ends that sweep.
--
--    Shape (A) also guards the LIVE-TABLE DDL, all of which now executes in ONE
--    place: section 7A, the last executable section of this file. THREE classes,
--    not two.
--
--    ⚠️ EVERY LOCK MODE IN THIS NOTE IS MEASURED, NOT INFERRED. Two earlier
--    revisions got this model wrong in OPPOSITE directions, and both wrong
--    versions read as confidently as this one, so the modes are now pinned to a
--    probe that anyone can re-run — `pg_locks` read inside an open transaction,
--    statement by statement, recorded verbatim in the A6 block as item (8).
--      · Revision 1 said the catalogue-only DDL is "quick ONCE THEY HAVE THE
--        LOCK, and the whole hazard is the WAIT". False, and that one sentence
--        is what kept the hold-to-COMMIT defect invisible through four reviewers
--        and a whole fix round.
--      · Revision 2 over-corrected and called all six §7A blocks an ACCESS
--        EXCLUSIVE hold on a live table, inventing a mechanism for it ("DROP
--        TRIGGER IF EXISTS takes ACCESS EXCLUSIVE on the RELATION before it
--        looks for the trigger, so it takes it even on a first apply"). Also
--        false — measured, a `DROP TRIGGER IF EXISTS` naming an ABSENT trigger
--        takes NO lock on the relation at all — and it would have had an
--        operator size a maintenance window for a READ outage on `enrolments`
--        that this migration does not cause.
--
--    ⚠️ WHAT POSTGRES ACTUALLY DOES. A lock taken by DDL is HELD UNTIL THE
--    TRANSACTION COMMITS — not until the statement ends. There is no top-level
--    COMMIT anywhere in this file, so a lock taken on line N is held for every
--    line after N. WHICH lock decides who is hurt:
--      · ACCESS EXCLUSIVE conflicts with EVERYTHING, SELECT included. Postgres
--        queues lock requests FIFO, so a hold (or even a pending request) on
--        `cohort_batches` parks every subsequent READER behind it —
--        `cohort_batches` is joined by R-3's room RPCs (20260729100200) and by
--        `get_cohort_progress` (20260526180000), i.e. by the shipped student
--        dashboard on desktop web, Android System WebView, Android Chrome and
--        iOS WKWebView. This is the one class that can blank a screen.
--      · SHARE ROW EXCLUSIVE conflicts with ROW EXCLUSIVE (every
--        INSERT/UPDATE/DELETE) but NOT with ACCESS SHARE (SELECT). A hold of
--        this mode on `enrolments` queues CHECKOUT WRITES and lets every reader
--        through. Still the money path, still worth a quiet window, but it is a
--        write stall and must not be described as a read outage.
--    HOLD DURATION, not wait duration, is the quantity to minimise — for both.
--
--    THE THREE CLASSES IN THIS FILE, all executed in §7A. This is THIS FILE's
--    inventory, not R0's: the push also carries a FOURTH live-table DDL site,
--    in 20260729100200, which is neither in this file nor in §7A and is the one
--    unbounded lock WAIT left in the phase. It is described under "THE WINDOW
--    GOES FROM…" below and must not be dropped from either list again.
--      · `ALTER TABLE public.cohort_batches ADD CONSTRAINT
--        cohort_batches_id_offering_key UNIQUE (id, offering_id)` — ACCESS
--        EXCLUSIVE on cohort_batches (measured; plus a SHARE while it builds the
--        backing unique index inside the transaction), held to COMMIT. THE ONLY
--        BLOCK IN THIS FILE THAT BLOCKS A READER OF A LIVE TABLE, and the only
--        one that does real work rather than catalogue work. When this note
--        talks about the dashboard, it is talking about this block.
--      · `ALTER TABLE public.cohort_room_configs ADD CONSTRAINT
--        room_config_batch_belongs_to_offering FOREIGN KEY (batch_id,
--        offering_id) REFERENCES public.cohort_batches (id, offering_id)` —
--        SHARE ROW EXCLUSIVE on BOTH sides (measured): on cohort_room_configs,
--        this file's own traffic-free table, and on the REFERENCED live table
--        `cohort_batches`. Both held to COMMIT. Adding a foreign key does NOT
--        take ACCESS EXCLUSIVE on the altered table — an earlier revision of
--        this bullet said it did, and before that revision this class was absent
--        from the inventory altogether.
--        SHARE ROW EXCLUSIVE does NOT conflict with SELECT, so it does not block
--        the dashboard — it blocks every WRITE to cohort_batches (admin roster
--        and batch edits) for the remainder of the push.
--        AND MOVING IT BUYS LESS THAN THE OTHER TWO, which is worth saying out
--        loud rather than letting the section imply otherwise: §1's own
--        `CREATE TABLE cohort_room_configs (… batch_id uuid REFERENCES
--        public.cohort_batches(id) …)` ALREADY takes SHARE ROW EXCLUSIVE on
--        cohort_batches on a first apply (measured), and holds it to COMMIT too
--        — as do the four tables 20260729100100 creates against the same parent.
--        Writes to cohort_batches are therefore blocked from §1 onward no matter
--        where this constraint sits. What deferring it removes is only its
--        SECOND wait on cohort_batches and its lock on cohort_room_configs; the
--        reason it belongs in §7A is uniformity and the dependency on block 1,
--        not a lock win of its own. Removing the §1 write block would mean
--        creating the table without the parent reference and adding it back in
--        §7A — a bigger change than this round is scoped for, and it is filed
--        rather than done.
--      · the four trigger attachments on `cohort_batch_members`, `enrolments`
--        (twice) and `cohort_applications` — the money path's own tables. Each
--        block is `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` in one
--        transaction, and ITS NET LOCK DEPENDS ON WHETHER THE TRIGGER IS ALREADY
--        THERE (measured, both ways):
--          – FIRST APPLY — the trigger does not exist, the DROP IF EXISTS is a
--            no-op that takes NO relation lock, and the net lock is the CREATE's
--            SHARE ROW EXCLUSIVE. Prod is a first apply — these are brand-new
--            trigger names — so on the push this file is written for, the three
--            blocks that land on a money-path table (§7A 4 and 5 on `enrolments`,
--            6 on `cohort_applications`) queue WRITES and never stall a reader.
--          – RE-RUN — on a shadow that already carries the triggers, or on the
--            hand-recovery path of note 11(a), the DROP finds its target and
--            takes ACCESS EXCLUSIVE. That is a READ block on `enrolments`, and
--            it is exactly why 11(a) says to re-run the block when the table is
--            quiet. It is short there for a reason this file cannot claim for
--            itself: a hand-run DO block commits on its own, seconds later.
--        Neither statement rewrites or scans the table, so both EXECUTE in
--        microseconds; whatever lock they do take is held to COMMIT exactly like
--        the other two classes.
--
--    WHY SECTION 7A EXISTS. These six blocks used to sit where they read best:
--    the UNIQUE at the very top (old §0), the composite FK in §1, the four
--    attachments in §5. That put `cohort_batches` under ACCESS EXCLUSIVE about
--    1600 lines before COMMIT — reads and writes, i.e. the dashboard dark for
--    the length of the apply — and `enrolments` under SHARE ROW EXCLUSIVE about
--    780 lines before it, i.e. checkout WRITES queued for the same stretch,
--    across every helper, resolver, policy, grant and admin RPC in between. A
--    dashboard outage plus a checkout stall for the length of the apply, not a
--    slow migration. Nothing about that ORDER was load-bearing: §1's table is created
--    empty so it has no row that could violate the FK, and no function, policy
--    or grant between them reads the constraint or the triggers. So all six are
--    deferred to §7A, in dependency order (the UNIQUE ahead of the composite FK
--    that needs it). NOTHING IN THIS FILE EXECUTES AFTER §7A — what follows is
--    the section-8 VERIFY query, the A6 measurements and the DOWN block, all
--    comments.
--
--    WHAT THAT DOES AND DOES NOT BUY, stated precisely, because an over-claim
--    here would be the same category of error as the sentence it replaces.
--
--    IT DOES NOT RELEASE THE LOCKS EARLY. They are still held to COMMIT; a
--    migration cannot release a lock without issuing a COMMIT, which this file
--    is not allowed to do (it has to stay ONE reversible unit, and `db push`
--    owns the transaction). What §7A shortens is the HOLD WINDOW, and only that.
--
--    THE WINDOW GOES FROM "this entire file" TO "§7A's six blocks, plus whatever
--    the same push runs after this file" — because this file's own rule that an
--    abort here takes sibling migrations down with it means the push is one
--    transaction across siblings, so COMMIT is the END OF THE PUSH, not the end
--    of this file. For R0 the siblings after us are 20260729100100 and
--    20260729100200. State what they actually do rather than waving at it:
--      · 20260729100100 creates seven content tables, four of which carry
--        `REFERENCES public.cohort_batches(id)`. Each such CREATE TABLE takes
--        SHARE ROW EXCLUSIVE on cohort_batches. That is NOT a further
--        escalation — §7A block 1 already holds ACCESS EXCLUSIVE on that table,
--        which is strictly stronger, so those references are granted instantly
--        and add no new class of blocking. But cohort_batches DOES stay under
--        §7A's ACCESS EXCLUSIVE for the length of 100100 and 100200, and that is
--        real dashboard exposure. Do not read "moved to the foot" as "over in
--        milliseconds".
--      · 20260729100200 IS NOT FUNCTIONS AND GRANTS ONLY. An earlier revision of
--        this note said "creates functions and grants only. It touches no
--        table"; that is false, and it is the fourth live-table DDL site named
--        above. Its §0 runs, on the LIVE table `live_sessions`:
--            CREATE INDEX IF NOT EXISTS live_sessions_week_idx
--              ON public.live_sessions (week_id, scheduled_at)
--              WHERE week_id IS NOT NULL;
--        Non-CONCURRENT, so it takes SHARE on live_sessions — readers pass,
--        every WRITE blocks — plus a real index build, and like everything else
--        here the lock is held to COMMIT. It is also the ONE live-table DDL
--        statement in R0 with neither a `lock_timeout` nor a handler
--        (`grep -c lock_timeout 20260729100200_cohort_room_rpcs.sql` is 0), so
--        it inherits the SESSION `lock_timeout`, which on the
--        `npx supabase db push` path this file names is 0 — WAIT FOREVER. And
--        it executes while §7A's ACCESS EXCLUSIVE on `cohort_batches` and its
--        SHARE ROW EXCLUSIVE on `enrolments` and `cohort_applications` are still
--        held: one concurrent transaction holding a conflicting lock on
--        live_sessions parks the whole push — with the dashboard's table locked
--        against readers and the money tables locked against writers — for as
--        long as that transaction lives. THAT IS THE LARGEST APPLY-TIME HAZARD
--        LEFT IN R0. It is not this file's statement to fix — 20260729100200 owns it,
--        and that file's own header claim that "nothing here can abort a shared
--        db push" is wrong for the same block — so it is recorded here rather
--        than patched from a distance. Until it is fixed, `live_sessions` has
--        to be quiet at push time too, alongside the money tables.
--    THE RESIDUAL, in full — meaning every lock this PUSH still holds on a
--    PRE-EXISTING live table when it commits, not only the ones §7A takes.
--    "In full" is a claim, so it is enumerated per TABLE and per VERB, and each
--    line names the EARLIEST statement in the push that imposes it (an earlier
--    revision filed a table under the wrong sibling and under the wrong verb;
--    both are the failure this list exists to prevent):
--      · cohort_batches READ blocked from §7A block 1 to the end of the push.
--        ACCESS EXCLUSIVE. THIS IS THE DASHBOARD, it is the only read block in
--        the whole push, and it is the exposure §7A actually shrinks — from "the
--        whole apply" to "the tail of it".
--      · cohort_batches WRITE blocked from §1 to the end of the push, and NOT
--        by §7A: §1's and §2's CREATE TABLE, and 20260729100100's four
--        batch-referencing content tables, each take SHARE ROW EXCLUSIVE on it.
--        Admin roster edits queue for the whole apply either way. Unchanged by
--        this round and stated so nobody assumes otherwise.
--      · enrolments WRITE blocked from §7A block 4 to the end of the push —
--        SHARE ROW EXCLUSIVE, from the CREATE TRIGGER; block 5 takes it again.
--        THIS IS CHECKOUT. Two earlier revisions of this line were wrong in
--        opposite directions and both are worth keeping visible. The first said
--        the block was "ONLY across §7A's own blocks. Checkout is the case this
--        closes completely" — wrong, because OUR lock is held to COMMIT whatever
--        a later file does or does not read. The second said READS AND WRITES,
--        on the invented premise that `DROP TRIGGER IF EXISTS` takes ACCESS
--        EXCLUSIVE on the relation before it looks for the trigger; measured, an
--        IF EXISTS naming an absent trigger takes no relation lock at all, and
--        on a first apply — which prod is — these blocks never reach ACCESS
--        EXCLUSIVE. Reading `enrolments` is unaffected for the whole push;
--        INSERTing one queues from block 4 across blocks 5-6, all of
--        20260729100100 and all of 20260729100200.
--        ON A RE-RUN (a shadow that already carries the triggers, or the note
--        11(a) hand-recovery) the DROP does find its target and the mode IS
--        ACCESS EXCLUSIVE — reads included. Do not re-run §7A blocks 3-6 against
--        a busy prod outside a window.
--      · cohort_applications WRITE blocked from §7A block 6 to the end of the
--        push, by the same mechanism and with the same first-apply/re-run split.
--        It carries the confirmation- and balance-payment stamps, so this is the
--        money path too, not a bystander.
--      · users and offerings WRITE blocked from §1/§2 to the end of the push.
--        §1's cohort_room_configs references `offerings`; §2's
--        cohort_room_members references `users` AND `offerings`; and
--        20260729100100's seven tables reference `users` and `offerings` too.
--        Every one of those CREATE TABLEs takes SHARE ROW EXCLUSIVE on the
--        referenced table by exactly the argument made for cohort_batches above,
--        and holds it to COMMIT. SHARE ROW EXCLUSIVE spares readers, so nothing
--        here blanks a screen — but `users` is the identity spine, so signup and
--        profile WRITES queue for essentially the whole apply. An earlier
--        version of this list called itself "in full" and omitted this line.
--      · cohort_weeks WRITE blocked from 20260729100100 §2 to the end of the
--        push. `cohort_resources.cohort_week_id` and the `ADD COLUMN … REFERENCES
--        public.cohort_weeks(id)` on cohort_room_posts (Δ1's dark channel
--        columns) each take SHARE ROW EXCLUSIVE on it. NOT a §7A lock and not a
--        20260729100200 lock — this line was missing entirely.
--      · live_sessions WRITE blocked from 20260729100100 §4 to the end of the
--        push — `cohort_recording_progress.live_session_id REFERENCES
--        public.live_sessions(id)`, SHARE ROW EXCLUSIVE, EARLIER in the push
--        than the bullet used to say. 20260729100200 §0's unguarded CREATE INDEX
--        then takes SHARE on the same table: it adds no new verb (writes are
--        already queued) but it is the one UNBOUNDED WAIT in R0, so it is where
--        the push can PARK with everything above still held. An earlier version
--        of this list attributed the whole live_sessions block to that CREATE
--        INDEX and so understated when the window opens.
--    SO §7A DOES NOT "CLOSE CHECKOUT COMPLETELY". What it buys the money tables
--    is a shorter HOLD — from "§5 onward, ~780 lines of this file plus both
--    siblings" down to "§7A blocks 4-6 plus both siblings" — and nothing more.
--    The only thing that releases these locks before the end of the push is a
--    COMMIT, which this file is not allowed to issue. Size the maintenance
--    window from the whole push, never from this file.
--    Push R0 ALONE — queueing it behind or in front of a long unrelated
--    migration re-opens exactly the hazard §7A closes — and treat the push as a
--    maintenance window, not a background task.
--
--    WHY EACH SITE IS STILL GUARDED. Two reasons, unchanged: an unhandled error
--    there aborts the whole `db push` and takes every sibling migration down
--    with it — the exact failure this file's header rules out — and an UNBOUNDED
--    lock WAIT parks our request in front of every subsequent reader of that
--    table, which on `enrolments` means stalling the money path to install a
--    trigger that is downstream of it. So each site takes a short LOCAL
--    `lock_timeout` as well as a handler.
--
--    THE COST OF THE SUCCESS PATH, stated because this file used to state it
--    nowhere. `lock_timeout` bounds each individual lock ACQUISITION, and that
--    bound is paid on the way IN whether the block ultimately succeeds or not:
--    while our request sits in the queue, everything arriving behind it that
--    conflicts WITH OUR PENDING REQUEST waits with us. §7A runs SIX guarded
--    blocks, each of which can spend up to its whole `lock_timeout` waiting for
--    its first lock, and THREE of them wait on a MONEY-PATH table: blocks 4 and
--    5 on `enrolments`, and block 6 on `cohort_applications`, which this file's
--    own header counts among "the money path's own tables" and which carries the
--    confirmation- and balance-payment stamps. An earlier revision of this
--    paragraph counted only the two `enrolments` blocks and so understated the
--    money-path figure by half.
--    WHAT IS QUEUED BEHIND EACH WAIT IS NOT THE SAME THING, and the runbook has
--    to size the window from the right one:
--      · block 1 waits for ACCESS EXCLUSIVE on `cohort_batches`. A pending
--        ACCESS EXCLUSIVE conflicts with everything, so READS queue behind it.
--        Up to 1s of dashboard.
--      · blocks 2-6 wait for SHARE ROW EXCLUSIVE (first apply). That mode does
--        not conflict with ACCESS SHARE, so a SELECT arriving behind the pending
--        request is granted and passes; what queues is WRITES. Up to 3s of
--        queued money-path WRITES across blocks 4-6, not of money-path reads. An
--        earlier revision counted these three as read waits, on the DROP TRIGGER
--        premise disproved above, and told the operator to size a read outage
--        that does not happen on a first apply.
--    At the 4s every site used to set, the money path alone could queue for up
--    to 12s on the fully SUCCESSFUL path, and §7A for up to 24s in total, with
--    nothing in the file admitting it. Every site is now 1s: worst case 3s of
--    queued money-path writes, 1s of queued dashboard reads, 6s across §7A in
--    total, and a wait longer than that degrades to a WARNING plus note 11(a)
--    rather than holding the money path open. Pick a quiet minute anyway — and
--    read 1s as a ceiling on OUR WAIT, not on the HOLD: the lock a block takes
--    once it wins is held to the end of the push regardless (THE RESIDUAL,
--    above).
--    What the resulting degradation costs, and how to recover from it, is
--    note 11.
--
-- 11. RECOVERING A DEGRADED DDL BLOCK. "Re-run this migration" is NOT a
--    procedure on this repo's deploy path, so no comment in either R0 file says
--    it. Read this before writing another one that does.
--
--    Every shape-(A) DDL guard lets the migration COMPLETE with its ALTER
--    skipped and a WARNING as the only trace. CLAUDE.md's runbook — and the only
--    documented deploy path here — is `npx -y supabase@latest db push`, which
--    stamps the version into `supabase_migrations.schema_migrations` on
--    completion and never re-applies a stamped file: a second push reports the
--    remote database is up to date and changes nothing. So recovery is manual,
--    and it is one of these two:
--
--      (a) PER-OBJECT (preferred). Re-execute the DO block that warned, by hand
--          against the target project (psql, or the Supabase SQL editor),
--          copied verbatim from this file. Every guarded block is safe to run at
--          any time and as often as needed, by one of two mechanisms — the
--          CONSTRAINT blocks re-probe pg_constraint / pg_class first and are a
--          no-op when the object is already there; §7A's four TRIGGER blocks are
--          idempotent by construction instead (`DROP TRIGGER IF EXISTS` then
--          `CREATE TRIGGER`, both inside one transaction, so the trigger is
--          never observably absent to a concurrent writer). Run it when the
--          table is quiet — the lock is the reason it failed the first time.
--      (b) WHOLE-FILE. Only for a file that is idempotent end to end (both R0
--          files are), and never concurrently with another push:
--            DELETE FROM supabase_migrations.schema_migrations
--             WHERE version = '20260729100000';   -- or '20260729100100'
--          then `db push` again.
--
--    DETECTION, because a WARNING is a scrolling NOTICE-level line that CI
--    discards: do not rely on reading the push output. After any push that
--    included these files, run the VERIFY query in section 8 at the foot of this
--    file. It returns one row per guarded object with a present/missing verdict,
--    and THAT is what belongs in the deploy checklist.
--
-- Sources: design/briefs/cohort-r0.md R-1 · design/cohorts/docs/05-ACCESS-SECURITY.md
-- (MEMBER-1 / SEC-MEMBER-1 / SEC-ENT-1 / SEC-ENT-2 / LOBBY-1) ·
-- design/cohorts/docs/03-DATA-MODEL-ERD.md §4.6a/§4.7/§17 ·
-- design/cohorts/ROOMS-BACKLOG.md PHASE R0.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Prerequisite (READ HERE — EXECUTED IN §7A): let a batch-scoped config row
--    carry a real composite FK.
--    cohort_batches has no (id, offering_id) unique pair yet; adding one is
--    additive and lets the "a batch override must belong to its offering" rule
--    be declarative instead of a raising trigger.
--
--    ➜ THE DDL THAT USED TO STAND HERE HAS MOVED TO SECTION 7A, at the foot of
--      this file. It is the heaviest DDL in R0 against a live production table:
--      `ADD CONSTRAINT … UNIQUE` takes ACCESS EXCLUSIVE on cohort_batches and
--      builds the backing unique index inside the migration's transaction — and
--      Postgres holds that lock UNTIL THE TRANSACTION COMMITS, not until the
--      statement ends. Executed here, at the top of a 2000-line file with no
--      top-level COMMIT, it locked `cohort_batches` against every SELECT for the
--      whole apply, which is a student-dashboard outage rather than a slow
--      migration. Nothing between here and §7A depends on the constraint (§1's
--      cohort_room_configs is created empty, so it has no row that could violate
--      the FK that needs it), so the block runs last instead. The full lock
--      model, the three classes of live-table DDL and the cost of the success
--      path are contract note 10.
--
--    DEGRADATION, named exactly here rather than at §7A, because it is a loss of
--    a semantic guarantee and this is where the semantics are described: without
--    this UNIQUE the composite FK in §1 cannot be created either, so "a batch
--    override belongs to its offering" stops being enforced by the DATABASE.
--    What is left is the imperative check inside admin_upsert_room_config(),
--    which exists for precisely this case and rejects a foreign batch with NULL
--    + a WARNING. That covers the admin RPC — the only write path
--    `authenticated` has, since section 7 revokes their DML on the table — and
--    covers NOTHING ELSE: a `service_role` write or direct SQL bypasses it, and
--    until the constraint exists there is no guard on those. A config row whose
--    batch belongs to another offering is live, not inert: cohort_room_phase()
--    and room_configs_member_read both resolve through batch_id.
--    RECOVERY IS MANUAL AND IS CONTRACT NOTE 11 — another `db push` will NOT
--    re-apply this file once the version is stamped. Re-run the §7A block by
--    hand (it is idempotent and re-probes pg_constraint) when the table is
--    quiet, then confirm with the section-8 VERIFY query.


-- ---------------------------------------------------------------------------
-- 1. cohort_room_configs — one row per offering (optional per-batch override).
--    The room's skin (theme), tongue (vocab), feature level (modules) and
--    lifecycle (phase). A new cohort room = one INSERT here, zero code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_room_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,  -- NULL = every batch of the offering
  slug text NOT NULL UNIQUE,          -- /room/:slug (seeded from offerings.slug)
  phase text NOT NULL DEFAULT 'pre_start'
    CHECK (phase IN ('pre_start','live','wrap','alumni')),

  -- THEME — the "album art" skin, written by the admin editor. Shape:
  --   accent_h / accent_s / accent_l  (ints; ONE accent per room)
  --   accent_text_l                   (optional lightness override for small text)
  --   hero_url, wordmark_text, monogram, texture ('grain'|'none'), tagline
  -- R-5's resolveTheme() re-applies defaults and a contrast-safe floor, so a
  -- partial/empty theme is legal here and never trusted downstream.
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- VOCAB — per-SKU label overrides (REQ-VOCAB-1, ERD §17). LABELS ONLY: routes,
  -- tables, statuses and notifications never change. Keys: member_noun,
  -- session_noun, feedback_session, submission_noun, work_verb,
  -- recordings_label, finale_label, tagline, niche_channels, tab_assignments.
  -- `vocab.niche_channels` is the list R-3's channel_key validation resolves
  -- against. RLS NEVER reads this column.
  vocab jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- MODULES — the feature matrix. Absent key = module default. RLS NEVER reads
  -- this column: security can never depend on a flag (NFR-CONFIG-2).
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT room_config_theme_shape CHECK (
    jsonb_typeof(theme) = 'object'
    AND (
      theme = '{}'::jsonb
      OR (theme ? 'accent_h' AND theme ? 'accent_s' AND theme ? 'accent_l')
    )
  ),
  CONSTRAINT room_config_theme_texture CHECK (
    COALESCE(theme->>'texture','none') IN ('grain','none')
  ),
  CONSTRAINT room_config_vocab_object CHECK (jsonb_typeof(vocab) = 'object'),
  CONSTRAINT room_config_modules_object CHECK (jsonb_typeof(modules) = 'object')
);

-- Converge a partially-applied earlier run (CREATE TABLE IF NOT EXISTS is a
-- no-op on an existing table, so the newer columns are added explicitly).
ALTER TABLE public.cohort_room_configs
  ADD COLUMN IF NOT EXISTS vocab jsonb NOT NULL DEFAULT '{}'::jsonb;

-- …and its shape CHECK, which the CREATE TABLE above carries but the ALTER does
-- NOT: on exactly the project this ALTER exists for, `vocab` would otherwise
-- accept a scalar or an array and R-3's `vocab.niche_channels` channel_key
-- resolution would have no shape guarantee. Added NOT VALID first so an
-- unexpected legacy row cannot abort a shared `db push` (new writes are checked
-- either way), then validated in a nested guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_config_vocab_object'
      AND conrelid = 'public.cohort_room_configs'::regclass
  ) THEN
    ALTER TABLE public.cohort_room_configs
      ADD CONSTRAINT room_config_vocab_object CHECK (jsonb_typeof(vocab) = 'object') NOT VALID;
    BEGIN
      ALTER TABLE public.cohort_room_configs VALIDATE CONSTRAINT room_config_vocab_object;
    EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
                OR crash_shutdown OR cannot_connect_now OR others THEN
      -- VALIDATE takes SHARE UPDATE EXCLUSIVE and scans the table: a cancel
      -- here (57014) is as likely as a CHECK violation, and `OTHERS` alone
      -- would have let it abort the push (contract note 10).
      RAISE WARNING 'cohort_room_configs: room_config_vocab_object left NOT VALID — a pre-existing row holds a non-object vocab, or the validation was cancelled (%) [%]. New writes are still checked; fix the row and run VALIDATE CONSTRAINT by hand (a db push will not re-apply this file — contract note 11).', SQLERRM, SQLSTATE;
    END;
  END IF;
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room_configs: could not add room_config_vocab_object (%) [%]', SQLERRM, SQLSTATE;
END $$;

-- A batch override must belong to the same offering as the config row.
--
-- ➜ MOVED TO SECTION 7A. This is the live-table DDL class contract note 10's
--   old inventory left out completely: `ADD … FOREIGN KEY … REFERENCES
--   public.cohort_batches (id, offering_id)` takes **SHARE ROW EXCLUSIVE on
--   BOTH SIDES** (measured — A6 item (8)): on cohort_room_configs and on
--   cohort_batches, the referenced live table. Adding a foreign key has not
--   taken ACCESS EXCLUSIVE on the altered table since PG 9.5, and — like every
--   lock in a transaction — it holds what it does take to COMMIT. SHARE ROW
--   EXCLUSIVE spares readers but blocks every WRITE to cohort_batches (admin
--   roster and batch edits) for the rest of the push.
--   BE PRECISE ABOUT THE WIN: the CREATE TABLE above already holds that same
--   SHARE ROW EXCLUSIVE via `batch_id … REFERENCES public.cohort_batches(id)`,
--   so deferring this block does not give cohort_batches writes back — what it
--   defers is its lock on cohort_room_configs and its own second wait. It
--   moves mainly because it needs `cohort_batches_id_offering_key`, which §7A
--   creates in the block immediately before it, and because one place for
--   live-table DDL beats three. Contract note 10 spells this out.
--   The rule this constraint enforces, and what is lost when it degrades, are
--   described in section 0.

-- Exactly one offering-level row; at most one override per batch.
CREATE UNIQUE INDEX IF NOT EXISTS cohort_room_configs_offering_default
  ON public.cohort_room_configs (offering_id) WHERE batch_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cohort_room_configs_batch_override
  ON public.cohort_room_configs (offering_id, batch_id) WHERE batch_id IS NOT NULL;

-- "Does this offering have a room at all?" — the probe the enrolment-INSERT
-- trigger and resolver branch (a2) make. Neither partial index above can serve
-- it (each needs a batch_id predicate the question does not carry), and this one
-- is what keeps the money path's added cost to a single index lookup.
CREATE INDEX IF NOT EXISTS cohort_room_configs_offering_idx
  ON public.cohort_room_configs (offering_id);

-- Bare DDL, deliberately: cohort_room_configs is created by the block above, so
-- on a first apply nothing else can hold a lock on it and on a re-apply it is a
-- room table with no money-path traffic. The lock_timeout + handler wrapper of
-- §7A buys nothing here (contract note 10's live-table inventory excludes it).
DROP TRIGGER IF EXISTS cohort_room_configs_updated_at ON public.cohort_room_configs;
CREATE TRIGGER cohort_room_configs_updated_at
  BEFORE UPDATE ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. cohort_room_members — the materialised membership table every room policy
--    reads. Written by the server only (see contract note 5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  -- See contract note 3 for why all five values stay, and note 4 for what a
  -- NULL batch_id means per role.
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('member','pre_member','mentor','host','alumni')),
  source text NOT NULL DEFAULT 'derived'
    CHECK (source IN ('derived','manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness, split in two because NULLs are distinct in a plain UNIQUE:
--   * batch-scoped rows carry a batch;
--   * offering-wide rows (lobby, batch-less member, manual mentor/host) do not.
-- Both are named arbiters for the ON CONFLICT clauses below.
CREATE UNIQUE INDEX IF NOT EXISTS room_member_unique_batch
  ON public.cohort_room_members (user_id, offering_id, batch_id)
  WHERE batch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS room_member_unique_offering
  ON public.cohort_room_members (user_id, offering_id)
  WHERE batch_id IS NULL;

CREATE INDEX IF NOT EXISTS room_members_user_idx
  ON public.cohort_room_members (user_id, status);
CREATE INDEX IF NOT EXISTS room_members_offering_idx
  ON public.cohort_room_members (offering_id, status, role);
-- The shape every access helper probes: (user, offering, status, role).
CREATE INDEX IF NOT EXISTS room_members_access_idx
  ON public.cohort_room_members (user_id, offering_id, status, role);

-- Bare DDL for the same reason as the configs trigger above: cohort_room_members
-- is created by this file and carries no live traffic at apply time.
DROP TRIGGER IF EXISTS cohort_room_members_updated_at ON public.cohort_room_members;
CREATE TRIGGER cohort_room_members_updated_at
  BEFORE UPDATE ON public.cohort_room_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. The access helpers — the ONLY place room access is decided.
--    All STABLE SECURITY DEFINER with a pinned search_path.
-- ---------------------------------------------------------------------------

-- "Is auth.uid() an ENROLLED member of this room (any batch)?"
-- pre_member is deliberately absent from the role list — see contract note 2.
CREATE OR REPLACE FUNCTION public.cohort_room_is_member(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.role IN ('member','alumni','mentor','host')
  ) OR public.is_admin();
$$;

-- "…and specifically of this batch?" ENROLLED-ONLY, same role list as above.
-- A NULL p_batch is an offering-level row (the masthead config, an
-- offering-wide announcement) and any active enrolled row unlocks it. A NULL
-- batch_id on the MEMBERSHIP row is offering-wide only for mentor/host: a
-- batch-less member (pre_start, or a manual grant) must not read every batch of
-- the offering at once. See contract note 4.
CREATE OR REPLACE FUNCTION public.cohort_room_can_access(p_offering uuid, p_batch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.role IN ('member','alumni','mentor','host')
      AND (
        p_batch IS NULL
        OR m.batch_id = p_batch
        OR (m.batch_id IS NULL AND m.role IN ('mentor','host'))
      )
  ) OR public.is_admin();
$$;

-- "…and is auth.uid() a mentor/host here?" — announcement + resource writes.
CREATE OR REPLACE FUNCTION public.cohort_room_can_post_announcement(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.role IN ('mentor','host')
  ) OR public.is_admin();
$$;

-- "Does auth.uid() hold this room OFFERING-WIDE?" — the single definition of the
-- staff scope lift (ROSTER-SCOPE-1). TRUE for a NULL-batch mentor/host grant, or
-- an admin; FALSE for every member/alumni/pre_member row, batch-less ones
-- included. R-3's cohort_room_caller_scope() must call this rather than
-- re-stating the predicate (contract note 1).
CREATE OR REPLACE FUNCTION public.cohort_room_is_offering_wide(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.batch_id IS NULL
      AND m.role IN ('mentor','host')
  ) OR public.is_admin();
$$;

-- "Is auth.uid() a LOBBY occupant (confirmation-fee paid, not yet enrolled)?"
-- Matches role='pre_member' and nothing else — no admin OR, because admins
-- already pass cohort_room_can_access(). Gates ONLY the SEC-MEMBER-1 whitelist:
-- masthead/theme, this-week OVERVIEW (session titles + dates), cohort-mate
-- presence/count, announcements READ, upcoming-session schedule. It must NEVER
-- gate recordings, curriculum detail, assignments, feedback, mentor materials,
-- or any community WRITE. A whitelisted policy reads:
--     cohort_room_can_access(offering_id, batch_id)
--     OR cohort_room_in_lobby(offering_id, batch_id)
-- A lobby row is never batch-scoped, so it unlocks the offering-level rows only
-- (contract note 4) — a pre_member sees the offering-wide announcement, not one
-- batch's private noticeboard.
CREATE OR REPLACE FUNCTION public.cohort_room_in_lobby(p_offering uuid, p_batch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.role = 'pre_member'
      AND (p_batch IS NULL OR m.batch_id = p_batch)
  );
$$;

-- Offering-wide convenience overload — the form R-3's RPC access asserts call
-- when there is no batch in hand. Same semantics, batch-agnostic. It delegates
-- rather than re-stating the predicate: there is still exactly one place where
-- "is this caller in the lobby?" is decided.
CREATE OR REPLACE FUNCTION public.cohort_room_in_lobby(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.cohort_room_in_lobby(p_offering, NULL::uuid);
$$;

-- Effective room phase for an (offering, batch): a batch override wins over the
-- offering-level row; no config row yields NULL (treated as "not alumni").
CREATE OR REPLACE FUNCTION public.cohort_room_phase(p_offering uuid, p_batch uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.phase
  FROM public.cohort_room_configs c
  WHERE c.offering_id = p_offering
    AND (c.batch_id = p_batch OR c.batch_id IS NULL)
  ORDER BY (c.batch_id IS NULL)   -- false (the batch override) sorts first
  LIMIT 1;
$$;

-- RESOLVER-INTERNAL, not an access helper: "does this user still owe money on
-- this offering?" It answers a PAYMENT question, is never called from a policy
-- or an RPC, and is revoked from every client role.
--
-- This exists because an ACTIVE `enrolments` row does not mean the student has
-- paid in full. razorpay-webhook/index.ts:313 enrols on the CONFIRMATION
-- capture of a staged offering with the balance still owed, and nothing in
-- supabase/functions revokes that enrolment if the balance never arrives — only
-- a manual admin action does (admin-api/index.ts:299). Δ2 puts that student in
-- the LOBBY, so branches (a)/(a2) must not read their enrolment as tier 3.
--
-- TRUE only for the narrow staged state: the LATEST application for
-- (user, offering) still reads 'confirmation_paid' AND the offering's own
-- arithmetic leaves something to pay. `price − app_fee − confirmation > 0` is
-- verify-razorpay-payment's `confirmationCoversAll` test inverted, character for
-- character (index.ts:614-634, COALESCE mirroring its `Number(x ?? 0)`), so a
-- confirmation fee that covers the whole price is NOT outstanding and that
-- student is a member the moment the enrolment lands. 'balance_paid' and
-- 'enrolled' are paid states; every pre-confirmation state is unreachable here
-- because branches (a)/(a2) already require an active enrolment.
-- The LATEST row governs (a re-application must not be out-voted by a stale one).
CREATE OR REPLACE FUNCTION public._room_balance_outstanding(p_user uuid, p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT a.status = 'confirmation_paid'
       AND a.confirmation_payment_id IS NOT NULL
       AND COALESCE(o.price_inr, 0)
           - COALESCE(o.app_fee_inr, 0)
           - COALESCE(o.confirmation_amount_inr, 0) > 0
    FROM public.cohort_applications a
    JOIN public.offerings o ON o.id = a.offering_id
    WHERE a.user_id = p_user
      AND a.offering_id = p_offering
    ORDER BY a.updated_at DESC, a.created_at DESC
    LIMIT 1
  ), false);
$$;


-- ---------------------------------------------------------------------------
-- 4. The resolver — re-derives ONE user's room memberships from the truth tables.
--    Truth, in precedence order:
--      (a)  cohort_batch_members + an ACTIVE, FULLY PAID enrolment in the
--           batch's own offering                 → 'member' (or 'alumni' when
--                                                 the room phase is alumni),
--                                                 scoped to that batch
--      (a2) an ACTIVE, FULLY PAID enrolment in a room-bearing offering with NO
--           batch assignment yet                 → the same role, batch_id NULL
--                                                 (Δ2: `enrolled` = full member,
--                                                 the roster catches up later)
--      (b)  a cohort_application carrying the confirmation-payment stamp, with
--           no enrolments row at all for that offering — OR the staged
--           confirmation enrolment that still owes a balance
--                                               → 'pre_member' (LOBBY-1)
--      anything else                            → nothing
--    "FULLY PAID" is `NOT _room_balance_outstanding(user, offering)` and is the
--    Δ2 tier line, NOT the enrolments table: the staged webhook enrols on the
--    confirmation capture with the balance still owed (contract note 3). Every
--    branch and every retraction below asks the same predicate, so the lobby and
--    the member tiers are two readings of one fact and can never both be true.
--    `accepted` NEVER produces a row — MEMBER-1 is explicit that the gate is the
--    confirmation payment, and an accepted-but-unpaid applicant holds zero room
--    read grant.
--    Manual rows (source='manual') survive every branch, with the single
--    documented exception in contract note 7f (a manual member/alumni whose
--    enrolment was revoked or cancelled).
--    IDEMPOTENT ACROSS RUNS, including after a revocation: because branch (b)
--    stands down as soon as a NON-ACTIVE enrolments row exists for the offering,
--    a refunded student cannot reappear in the lobby on the next resolver call or
--    at the nightly reconcile (contract note 6).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_room_resolve_user(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manual_retracted integer := 0;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;

  -- (a) BATCH-SCOPED memberships from the batch rosters. DISTINCT ON collapses a
  --     duplicate batch membership (two enrolments in one batch) so the upsert
  --     can never hit "ON CONFLICT DO UPDATE cannot affect row a second time".
  --     `cb.offering_id = e.offering_id` keeps an enrolment in offering X from
  --     minting membership of offering Y if a batch is ever re-pointed.
  --     The balance gate is here as well as on (a2): an admin putting a
  --     confirmation-paid, balance-owing applicant on a roster must not be a way
  --     around the Δ2 tier line. They stay in the lobby until the balance lands,
  --     then this branch picks them up with no further admin action.
  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  SELECT DISTINCT ON (e.user_id, cb.offering_id, cbm.batch_id)
         e.user_id,
         cb.offering_id,
         cbm.batch_id,
         CASE WHEN public.cohort_room_phase(cb.offering_id, cbm.batch_id) = 'alumni'
              THEN 'alumni' ELSE 'member' END,
         'derived',
         'active'
  FROM public.cohort_batch_members cbm
  JOIN public.enrolments e ON e.id = cbm.enrolment_id AND e.status = 'active'
  JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
  WHERE e.user_id = p_user
    AND cb.offering_id = e.offering_id
    AND NOT public._room_balance_outstanding(e.user_id, cb.offering_id)
  ORDER BY e.user_id, cb.offering_id, cbm.batch_id, cbm.added_at
  ON CONFLICT (user_id, offering_id, batch_id) WHERE batch_id IS NOT NULL
  DO UPDATE SET status = 'active',
                role   = EXCLUDED.role
  WHERE cohort_room_members.source = 'derived';

  -- (a2) OFFERING-WIDE membership for a paid, enrolled student the admin has not
  --      put in a batch yet (Δ2 tier 3; contract note 3). Restricted to
  --      offerings that actually HAVE a room — otherwise every masterclass
  --      enrolment in the catalogue would materialise a membership row. This is
  --      not a feature flag (NFR-CONFIG-2): a missing cohort_room_configs row
  --      means there is no room to be a member of, and no `modules` value is
  --      read here or anywhere else in this file.
  --      The upsert promotes an existing lobby row in place, so the lobby → member
  --      transition is one row changing role, never two rows racing one arbiter —
  --      and that promotion is exactly what the balance capture triggers, since
  --      _room_balance_outstanding() goes false the moment the application flips
  --      to 'balance_paid'/'enrolled'.
  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  SELECT DISTINCT ON (e.user_id, e.offering_id)
         e.user_id,
         e.offering_id,
         NULL::uuid,
         CASE WHEN public.cohort_room_phase(e.offering_id, NULL) = 'alumni'
              THEN 'alumni' ELSE 'member' END,
         'derived',
         'active'
  FROM public.enrolments e
  WHERE e.user_id = p_user
    AND e.status = 'active'
    AND NOT public._room_balance_outstanding(e.user_id, e.offering_id)
    AND EXISTS (
      SELECT 1 FROM public.cohort_room_configs c WHERE c.offering_id = e.offering_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.cohort_batch_members cbm
      JOIN public.enrolments e2 ON e2.id = cbm.enrolment_id AND e2.status = 'active'
      JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
      WHERE e2.user_id = p_user
        AND e2.offering_id = e.offering_id
        AND cb.offering_id = e.offering_id
    )
  ORDER BY e.user_id, e.offering_id, e.created_at
  ON CONFLICT (user_id, offering_id) WHERE batch_id IS NULL
  DO UPDATE SET status = 'active',
                role   = EXCLUDED.role
  WHERE cohort_room_members.source = 'derived';

  -- (b) LOBBY rows (LOBBY-1 / SEC-MEMBER-1). Gate = the confirmation-fee stamp,
  --     AND no NON-ACTIVE enrolment for that offering, AND not already tier 3.
  --     'submitted' | 'app_fee_paid' | 'interview_scheduled' | 'interview_done'
  --     | 'accepted' | 'waitlisted' | 'rejected' | 'withdrawn' all fall through
  --     here and write NOTHING.
  --     THE FIRST NOT EXISTS is what makes revocation terminal (contract note 6):
  --     once a revoked/cancelled/expired enrolment exists, the application status
  --     stops being able to put the student back in the lobby.
  --     THE BALANCE CLAUSE is the other half of contract note 3: an ACTIVE
  --     enrolment ends the lobby only when the student owes nothing. The staged
  --     confirmation enrolment — active, balance outstanding — is the lobby
  --     occupant's own row and keeps them here, which is where Δ2 puts them.
  --     THE LAST NOT EXISTS keeps the lobby from shadowing a manual mentor/host
  --     grant or a member row, which share the offering-wide arbiter index.
  --
  --     🔴 KNOWN, ESCALATED, NOT CLOSED BY R0 — the shape this branch mints on
  --     the staged path (ACTIVE enrolment + outstanding balance) is the one
  --     shape that satisfies the PRE-EXISTING `live_sessions_student_read`
  --     policy (20260408140000:54, "any active enrolment for the offering") and
  --     `get_live_session_zoom_link()`'s T-60 test. The room tier holds — every
  --     R-2 table and every R-3 envelope treats this row as lobby-only — but the
  --     DIRECT table read of live_sessions does not, and neither does
  --     `cohort_weeks_student_read` for a balance-owing applicant already on a
  --     roster. Closing it means editing two shipped policies CohortDashboard
  --     reads through, which is outside R0's blast radius and is filed as a
  --     follow-up. The full statement of what is and is not enforced lives in
  --     20260729100100's tier column; do not re-assert "a pre_member reads zero
  --     rows from live_sessions" anywhere until that follow-up lands.
  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  SELECT DISTINCT ON (a.user_id, a.offering_id)
         a.user_id, a.offering_id, NULL::uuid, 'pre_member', 'derived', 'active'
  FROM public.cohort_applications a
  WHERE a.user_id = p_user
    AND a.confirmation_payment_id IS NOT NULL
    AND a.status IN ('confirmation_paid','balance_paid','enrolled')
    AND NOT EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = a.user_id
        AND e.offering_id = a.offering_id
        AND e.status <> 'active'
    )
    AND (
      public._room_balance_outstanding(a.user_id, a.offering_id)
      OR NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = a.user_id
          AND e.offering_id = a.offering_id
          AND e.status = 'active'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cohort_room_members m2
      WHERE m2.user_id = a.user_id
        AND m2.offering_id = a.offering_id
        AND m2.status = 'active'
        AND m2.role <> 'pre_member'
    )
  ORDER BY a.user_id, a.offering_id, a.updated_at DESC
  ON CONFLICT (user_id, offering_id) WHERE batch_id IS NULL
  DO UPDATE SET status = 'active'
  WHERE cohort_room_members.source = 'derived'
    AND cohort_room_members.role = 'pre_member';

  -- (c) Retract DERIVED rows whose truth is gone — the exact mirror of (a)/(a2)/
  --     (b): a derived row survives only while the branch that wrote it would
  --     write it again. An enrolment flipped to revoked/cancelled/expired, a
  --     batch de-assignment, a batch re-pointed at another offering, or a
  --     balance that went back to outstanding exits the room here; a lobby row
  --     exits when the application stops qualifying, when the enrolment turns
  --     non-active, when the balance clears (the occupant is a member now), or
  --     when a non-lobby row already carries them.
  UPDATE public.cohort_room_members m
  SET status = 'revoked'
  WHERE m.user_id = p_user
    AND m.status = 'active'
    AND m.source = 'derived'
    AND (
      -- Batch-scoped derived row: no roster entry for THIS (offering, batch)
      -- backed by an active enrolment in the same offering — or the student owes
      -- a balance again, which (a) would no longer write.
      (m.batch_id IS NOT NULL AND (
        public._room_balance_outstanding(p_user, m.offering_id)
        OR NOT EXISTS (
          SELECT 1
          FROM public.cohort_batch_members cbm
          JOIN public.enrolments e ON e.id = cbm.enrolment_id AND e.status = 'active'
          JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
          WHERE e.user_id = p_user
            AND cbm.batch_id = m.batch_id
            AND cb.offering_id = m.offering_id
            AND e.offering_id = m.offering_id
        )
      ))
      OR
      -- Batch-less derived ENROLLED row (branch a2): the active enrolment is
      -- gone, the balance is outstanding again, or the roster has caught up and
      -- the batch-scoped row now carries the truth.
      (m.batch_id IS NULL AND m.role IN ('member','alumni') AND (
        public._room_balance_outstanding(p_user, m.offering_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.enrolments e
          WHERE e.user_id = p_user AND e.offering_id = m.offering_id AND e.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM public.cohort_batch_members cbm
          JOIN public.enrolments e ON e.id = cbm.enrolment_id AND e.status = 'active'
          JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
          WHERE e.user_id = p_user
            AND e.offering_id = m.offering_id
            AND cb.offering_id = m.offering_id
        )
      ))
      OR
      -- Lobby row. Note what is NOT here: a merely-existing enrolments row. The
      -- staged confirmation enrolment is active and still owes a balance, and
      -- that student belongs in the lobby (contract notes 3 and 6).
      (m.batch_id IS NULL AND m.role = 'pre_member' AND (
        NOT EXISTS (
          SELECT 1 FROM public.cohort_applications a
          WHERE a.user_id = p_user
            AND a.offering_id = m.offering_id
            AND a.confirmation_payment_id IS NOT NULL
            AND a.status IN ('confirmation_paid','balance_paid','enrolled')
        )
        OR EXISTS (
          SELECT 1 FROM public.enrolments e
          WHERE e.user_id = p_user AND e.offering_id = m.offering_id AND e.status <> 'active'
        )
        OR (
          NOT public._room_balance_outstanding(p_user, m.offering_id)
          AND EXISTS (
            SELECT 1 FROM public.enrolments e
            WHERE e.user_id = p_user AND e.offering_id = m.offering_id AND e.status = 'active'
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.cohort_room_members m2
          WHERE m2.user_id = p_user
            AND m2.offering_id = m.offering_id
            AND m2.status = 'active'
            AND m2.role <> 'pre_member'
        )
      ))
    );

  -- (d) The ONE case where a MANUAL row is retracted (contract note 7f): a
  --     manual member/alumni whose enrolment for this offering was REVOKED or
  --     CANCELLED, with no active one left. `expired` is excluded on purpose —
  --     it is the ordinary end of access, and comping a lapsed alum back into a
  --     room is precisely what a manual `member` grant is for. A comped member
  --     (no enrolments row at all) and every manual mentor/host grant are
  --     untouched. Separated from (c) so the retraction can be COUNTED: an
  --     admin's grant disappearing under them used to be silent.
  UPDATE public.cohort_room_members m
  SET status = 'revoked'
  WHERE m.user_id = p_user
    AND m.status = 'active'
    AND m.source = 'manual'
    AND m.role IN ('member','alumni')
    AND EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = p_user AND e.offering_id = m.offering_id
        AND e.status IN ('revoked','cancelled')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = p_user AND e.offering_id = m.offering_id AND e.status = 'active'
    );
  GET DIAGNOSTICS v_manual_retracted = ROW_COUNT;
  IF v_manual_retracted > 0 THEN
    RAISE WARNING 'cohort_room: retracted % manual member/alumni grant(s) for user % — the enrolment behind them is revoked/cancelled (contract note 7f). Re-grant after a re-purchase, or comp the user with no enrolments row.',
      v_manual_retracted, p_user;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 5. Triggers on the truth tables.
--    EVERY one is AFTER and wraps the resolver in an exception guard that
--    degrades to a WARNING (SEC-ENT-2). The payment path rides `enrolments`,
--    `cohort_batch_members` and `cohort_applications`: a resolver that threw
--    would roll back the money write, and the room is downstream of the money,
--    never in front of it. Drift from a swallowed failure self-heals at the
--    nightly reconcile.
--
--    ⚠️ ATTACHING THE TRIGGER IS ITSELF DDL AGAINST A LIVE MONEY TABLE, so all
--    four attachments have MOVED TO SECTION 7A at the foot of this file; only
--    the trigger FUNCTIONS are defined here, and defining a function locks
--    nothing but pg_proc. The runtime guard inside each function protects the
--    money path AFTER the trigger exists; it does nothing for the moment of
--    installation. Each attachment is `DROP TRIGGER IF EXISTS` + `CREATE
--    TRIGGER` on `cohort_batch_members`, `enrolments` (twice) and
--    `cohort_applications`. On a FIRST APPLY the DROP names a trigger that does
--    not exist and takes no relation lock, so the net mode is the CREATE's SHARE
--    ROW EXCLUSIVE — writes blocked, reads unaffected; on a RE-RUN the DROP
--    finds its target and takes ACCESS EXCLUSIVE, which blocks reads too. Both
--    modes are measured in the A6 block, item (8). Neither statement rewrites
--    nor scans the table, so both EXECUTE instantly — but Postgres HOLDS
--    whichever lock it took until the transaction COMMITS, and this file has no
--    top-level COMMIT, so attaching them here left `enrolments` under SHARE ROW
--    EXCLUSIVE for the remaining ~780 lines and queued every checkout WRITE
--    behind the push. That is the defect §7A exists to close, and contract note
--    10 carries the full lock model.
--
--    Each of the four blocks, in §7A, still (a) sets a short LOCAL
--    `lock_timeout` — otherwise it inherits the session default of 0 = wait
--    forever on the CLAUDE.md deploy path (`npx supabase db push`), which parks
--    an ACCESS EXCLUSIVE request in front of every subsequent reader of the
--    money table for as long as one open transaction holds it — and (b) carries
--    the shape-(A) handler of contract note 10.
--
--    WHAT THE SWALLOW COSTS HERE, stated so it is a decision and not a
--    copy-paste: a trigger that fails to attach leaves the room membership
--    un-derived on write, in BOTH directions. It grants nobody anything they
--    did not buy — a missing trigger cannot mint a membership row — but state
--    the other direction plainly rather than rounding it off: with
--    `room_resolve_on_enrolment_status` absent, a REVOCATION is not honoured on
--    write either, so room access outlives a revoked enrolment until the sweep.
--    Both directions land in the same place, and it is a state this file already
--    tolerates by design: the runtime shape-(A) guards swallow exactly the same
--    way (contract note 10), and contract note 9 records that before the
--    enrolment-INSERT trigger existed a fully paid student sat outside the room
--    until the 03:45 reconcile, which is idempotent and sweeps the whole room
--    world nightly. Bounded, self-healing, ≤24h. Weighed against aborting a
--    shared `db push` and taking sibling migrations down, the swallow is the
--    better trade — but ONLY because the reconcile exists. Detection is
--    the trigger half of the §8 VERIFY query; recovery is contract note 11(a),
--    re-running the DO block by hand when the table is quiet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._room_resolve_from_batch_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user       uuid;
  v_users      uuid[];
  v_new_enrol  uuid;
  v_old_enrol  uuid;
  v_cancelled  boolean := false;
BEGIN
  -- NEW/OLD are unassigned outside their operations; touch them via TG_OP only.
  IF TG_OP IN ('INSERT','UPDATE') THEN v_new_enrol := NEW.enrolment_id; END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old_enrol := OLD.enrolment_id; END IF;

  -- The guard wraps the DRIVING QUERY as well as the resolver call. A cursor
  -- that opens outside the block is still a statement running inside an AFTER
  -- trigger on a truth table, and an error from it — a permissions change, a
  -- lock timeout, an enrolments schema edit — would abort the roster write it is
  -- attached to. SEC-ENT-2 is "this trigger can never block that write", not
  -- "the resolver can never block that write", so nothing here is left outside.
  --
  -- The handler names query_canceled/assert_failure ahead of `others` because
  -- `others` does not trap them (contract note 10). A statement_timeout landing
  -- on THIS select — the driving query, not the resolver — used to escape the
  -- guard and roll the roster write back.
  BEGIN
    SELECT array_agg(DISTINCT e.user_id) INTO v_users
    FROM public.enrolments e
    WHERE e.id IN (v_new_enrol, v_old_enrol)
      AND e.user_id IS NOT NULL;
  EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
              OR crash_shutdown OR cannot_connect_now OR others THEN
    v_users := NULL;
    RAISE WARNING 'cohort_room: could not read the users behind cohort_batch_members (enrolments %, %): % (%)',
      v_new_enrol, v_old_enrol, SQLERRM, SQLSTATE;
  END;

  -- FOREACH over an array cannot itself fail, so the per-user guard below is the
  -- only thing left between a resolver error and the roster write: one poisoned
  -- user does not cost the other their re-derivation. A CANCEL is different from
  -- an error, though — it means this statement is already over its budget, so
  -- the loop stops instead of spending the next user's resolve on a timer that
  -- has already fired. The reconcile picks up whoever was skipped.
  -- (Contract note 10, shape B — the same split cohort_room_reconcile() uses.)
  IF v_users IS NOT NULL THEN
    FOREACH v_user IN ARRAY v_users LOOP
      BEGIN
        PERFORM public.cohort_room_resolve_user(v_user);
      EXCEPTION
        WHEN query_canceled OR admin_shutdown OR crash_shutdown
             OR cannot_connect_now THEN
          v_cancelled := true;
          RAISE WARNING 'cohort_room resolver CANCELLED for user % on cohort_batch_members: % (%) — swallowed so the roster write still commits (SEC-ENT-2); 03:45 reconcile will re-derive',
            v_user, SQLERRM, SQLSTATE;
        WHEN assert_failure OR others THEN
          RAISE WARNING 'cohort_room resolver failed for user % on cohort_batch_members: % (%)',
            v_user, SQLERRM, SQLSTATE;
      END;
      EXIT WHEN v_cancelled;
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

-- ➜ Attachment 1 of 4 (`room_resolve_on_batch_member` on
--   `public.cohort_batch_members`) has MOVED TO SECTION 7A. §5 preamble.

CREATE OR REPLACE FUNCTION public._room_resolve_from_enrolment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.cohort_room_resolve_user(NEW.user_id);
  -- query_canceled/assert_failure first: `others` does not trap them and this
  -- trigger hangs off `enrolments`, the money table (contract note 10).
  EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
              OR crash_shutdown OR cannot_connect_now OR others THEN
    RAISE WARNING 'cohort_room resolver failed for user % on enrolments: % (%)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END $$;

-- ➜ Attachment 2 of 4 (`room_resolve_on_enrolment_status` on
--   `public.enrolments`) has MOVED TO SECTION 7A — the first of two on the money
--   table whose WRITES a SHARE ROW EXCLUSIVE hold queues for the rest of the
--   push (and whose READS a re-run's ACCESS EXCLUSIVE would stall). §5 preamble.

-- Fresh enrolments (contract note 9). An earlier revision left INSERT
-- deliberately trigger-free on the theory that the `cohort_applications` status
-- flip would always follow it — but that flip only happens on the staged BALANCE
-- sub-path (verify-razorpay-payment/index.ts:695 requires
-- `payment_type === 'balance' && application_id`). The `confirmationCoversAll`
-- branch, the non-staged path and every direct INSERT (admin grants, the legacy
-- and onboarding RPCs) never touch an application at all, so a fully paid
-- student sat outside the room until the 03:45 reconcile — up to ~24 hours.
--
-- The money path pays for this, so it is kept to the minimum: AFTER, fired only
-- for `status='active'`, exception-guarded, and short-circuited on ONE index
-- probe (cohort_room_configs_offering_idx) when the offering has no room. A
-- masterclass checkout — the overwhelming majority of enrolment INSERTs — never
-- reaches the resolver. Measured in the A6 block at the foot of this file, both
-- with and without a room on the offering.
CREATE OR REPLACE FUNCTION public._room_resolve_from_enrolment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.user_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.cohort_room_configs c
         WHERE c.offering_id = NEW.offering_id
       )
    THEN
      PERFORM public.cohort_room_resolve_user(NEW.user_id);
    END IF;
  -- THE SINGLE HIGHEST-CONSEQUENCE HANDLER IN THE PHASE. This fires inside the
  -- INSERT that records a purchase. `WHEN OTHERS` does not trap query_canceled
  -- (57014), so a statement_timeout or a cancelled lock wait anywhere under
  -- cohort_room_resolve_user() — or in the EXISTS probe above it — used to
  -- propagate out of this AFTER trigger and roll the enrolment back at the
  -- moment of payment. Named explicitly per contract note 10; nothing escaping
  -- the room resolver may abort the money write.
  EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
              OR crash_shutdown OR cannot_connect_now OR others THEN
    RAISE WARNING 'cohort_room resolver failed for user % on enrolments INSERT: % (%) — swallowed; the enrolment commits and 03:45 reconcile re-derives the membership',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END $$;

-- ➜ Attachment 3 of 4 (`room_resolve_on_enrolment_insert` on
--   `public.enrolments`) has MOVED TO SECTION 7A. §5 preamble.

-- The lobby writer (A3 / LOBBY-1). Fires on the confirmation-payment stamp that
-- verify-razorpay-payment + razorpay-webhook write alongside the status flip,
-- and again on the balance flip to 'balance_paid'/'enrolled' — which is what
-- promotes the lobby row to a full member row through resolver branch (a2),
-- because that flip is the moment `_room_balance_outstanding()` goes false.
-- On the staged path this is the ONLY signal that separates tier 2 from tier 3:
-- the enrolment row was already written at the confirmation capture.
-- confirmation_payment_id and user_id are in the OF list too: the stamp and the
-- user link do not always land in the same UPDATE as the status.
CREATE OR REPLACE FUNCTION public._room_resolve_from_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.cohort_room_resolve_user(NEW.user_id);
  -- cohort_applications carries the confirmation- and balance-payment stamps:
  -- this is a money-path table too, so the same explicit list applies
  -- (contract note 10).
  EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
              OR crash_shutdown OR cannot_connect_now OR others THEN
    RAISE WARNING 'cohort_room resolver failed for user % on cohort_applications: % (%)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END $$;

-- ➜ Attachment 4 of 4 (`room_resolve_on_application_status` on
--   `public.cohort_applications`, which carries the confirmation- and
--   balance-payment stamps and is therefore a money-path table too) has MOVED
--   TO SECTION 7A. §5 preamble.

-- Alumni flip: rooms are never deleted, so when a config's phase moves to
-- 'alumni' the membership survives and the ROLE renames. Scoped to the config's
-- own batch when it is an override; an offering-level flip also renames the
-- batch-less (branch a2) rows. Guarded like the rest; the reconcile re-derives
-- the same role from cohort_room_phase() if this ever swallows.
CREATE OR REPLACE FUNCTION public._room_alumni_flip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.phase = 'alumni' AND OLD.phase IS DISTINCT FROM 'alumni' THEN
    BEGIN
      UPDATE public.cohort_room_members
      SET role = 'alumni'
      WHERE offering_id = NEW.offering_id
        AND (NEW.batch_id IS NULL OR batch_id = NEW.batch_id)
        AND source = 'derived'
        AND role = 'member'
        AND status = 'active';
    -- Not a money-path trigger, but the rule is uniform: an admin flipping a
    -- room to `alumni` must never see the config UPDATE rejected because a
    -- membership rename was cancelled (contract note 10).
    EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
                OR crash_shutdown OR cannot_connect_now OR others THEN
      RAISE WARNING 'cohort_room alumni flip failed for offering %: % (%)',
        NEW.offering_id, SQLERRM, SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END $$;

-- Bare DDL: cohort_room_configs is this file's own table (see the configs
-- trigger in §1), not a money-path table, so it stays here rather than in §7A.
DROP TRIGGER IF EXISTS room_alumni_flip ON public.cohort_room_configs;
CREATE TRIGGER room_alumni_flip
  AFTER UPDATE OF phase ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public._room_alumni_flip();


-- ---------------------------------------------------------------------------
-- 6. Nightly reconcile — drift from any swallowed trigger failure self-heals,
--    and the enrolment INSERT that carries no trigger is picked up here.
--    03:45 IST, offset 15 minutes from the community draft's 03:30 IST slot so
--    the two can never stack. pg_cron schedules in UTC: 22:15 UTC = 03:45 IST.
--    The candidate set is bounded by the room world: batch rosters, applications
--    that paid a confirmation fee, active enrolments in ROOM-BEARING offerings
--    only, and everyone who already holds a derived row.
--
--    IT MUST STAY KILLABLE. This sweep is the compensating control the money
--    path's swallow relies on (contract note 10), which is precisely why it is
--    the one place that must NOT swallow a cancel and carry on: it is a single
--    top-level statement iterating that whole candidate set, so the first
--    trapped cancel would consume the only interrupt an operator gets and every
--    remaining user would resolve with no `statement_timeout` armed. The
--    per-user handler is therefore shape (B): an ERROR skips one user, a CANCEL
--    ends the sweep.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_room_reconcile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r           record;
  v_cancelled boolean := false;
BEGIN
  FOR r IN
    SELECT DISTINCT e.user_id
    FROM public.cohort_batch_members cbm
    JOIN public.enrolments e ON e.id = cbm.enrolment_id
    WHERE e.user_id IS NOT NULL
    UNION
    SELECT DISTINCT a.user_id
    FROM public.cohort_applications a
    WHERE a.user_id IS NOT NULL
      AND a.confirmation_payment_id IS NOT NULL
    UNION
    SELECT DISTINCT e.user_id
    FROM public.enrolments e
    JOIN public.cohort_room_configs c ON c.offering_id = e.offering_id
    WHERE e.user_id IS NOT NULL
      AND e.status = 'active'
    UNION
    SELECT DISTINCT m.user_id
    FROM public.cohort_room_members m
  LOOP
    BEGIN
      PERFORM public.cohort_room_resolve_user(r.user_id);
    EXCEPTION
      -- A CANCEL ends the sweep (contract note 10, shape B). This is not a
      -- money-path trigger, so SEC-ENT-2 buys nothing here, and the interrupt is
      -- one-shot: absorbing it would leave every later user running with no
      -- statement_timeout armed and no way for an operator to stop a job that is
      -- pinning the database. Stopping honours the cancel, and tomorrow's run
      -- re-derives everyone who was skipped.
      WHEN query_canceled OR admin_shutdown OR crash_shutdown
           OR cannot_connect_now THEN
        v_cancelled := true;
        RAISE WARNING 'cohort_room reconcile CANCELLED at user %: % (%) — the sweep stops here; it is idempotent and the next run re-derives the remainder',
          r.user_id, SQLERRM, SQLSTATE;
      -- An ERROR is per-user: one poisoned row must not cost everyone else their
      -- re-derivation. `assert_failure` is named because `OTHERS` does not trap
      -- it.
      WHEN assert_failure OR others THEN
        RAISE WARNING 'cohort_room reconcile failed for user %: % (%)',
          r.user_id, SQLERRM, SQLSTATE;
    END;
    EXIT WHEN v_cancelled;
  END LOOP;
END $$;

-- Extension + schedule, both guarded: this migration may share a `db push` with
-- unrelated siblings, and a shadow project without pg_cron privileges must not
-- take them down. A missing schedule degrades to "reconcile is manual".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room reconcile: pg_cron unavailable (%) [%] — schedule cohort_room_reconcile() by hand', SQLERRM, SQLSTATE;
END $$;

DO $$
DECLARE
  jid bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'cohort_room reconcile: cron.job missing — schedule cohort_room_reconcile() by hand';
    RETURN;
  END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'cohort_room_reconcile_nightly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;

  PERFORM cron.schedule(
    'cohort_room_reconcile_nightly',
    '15 22 * * *',                      -- 22:15 UTC = 03:45 IST
    'SELECT public.cohort_room_reconcile();'
  );
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room reconcile: could not schedule (%) [%] — schedule cohort_room_reconcile() by hand', SQLERRM, SQLSTATE;
END $$;


-- ---------------------------------------------------------------------------
-- 7. RLS + grants.
--    cohort_room_configs : admins write (through the RPC below); enrolled
--                          members and lobby occupants read. An `accepted`
--                          applicant has no row and is therefore denied
--                          (SEC-STATE-1 / SEC-CFG-1).
--    cohort_room_members : own row SELECT only; zero client write grants.
--    A raw client INSERT into either table is rejected TWICE OVER, and the
--    second lock is not implied by the first: no non-admin INSERT policy exists,
--    AND the DML privileges Supabase's default-privileges bootstrap hands
--    `anon`/`authenticated` on every new public table are revoked below. The
--    revoke has to name BOTH tables — a policy-only lock would leave an admin's
--    own JWT able to write configs straight through PostgREST, outside the RPC.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cohort_room_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_configs_admin_all ON public.cohort_room_configs;
CREATE POLICY room_configs_admin_all ON public.cohort_room_configs
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS room_configs_member_read ON public.cohort_room_configs;
CREATE POLICY room_configs_member_read ON public.cohort_room_configs FOR SELECT
  TO authenticated
  USING (
    public.cohort_room_can_access(offering_id, batch_id)
    OR public.cohort_room_in_lobby(offering_id, batch_id)   -- masthead/theme is whitelisted
  );

DROP POLICY IF EXISTS room_members_admin_all ON public.cohort_room_members;
CREATE POLICY room_members_admin_all ON public.cohort_room_members
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS room_members_own_read ON public.cohort_room_members;
CREATE POLICY room_members_own_read ON public.cohort_room_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON public.cohort_room_configs TO authenticated;
GRANT SELECT ON public.cohort_room_members TO authenticated;
GRANT ALL    ON public.cohort_room_configs TO service_role;
GRANT ALL    ON public.cohort_room_members TO service_role;

-- Supabase grants table DML to the client roles by default, so the write revoke
-- is mandatory, not implied — and it applies to BOTH room tables. The service
-- role (edge functions, the fixture loader) and the SECURITY DEFINER writers
-- below are the only paths that remain.
--
-- ⚠️ TRUNCATE IS IN THE LIST, and it was not always. The bootstrap this revoke
-- exists to undo is `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- TABLES TO anon, authenticated, service_role`, and ALL is seven verbs, not
-- four: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER. That is
-- the shape production actually has — qa-harness/shadow-grants.sql is generated
-- from prod (ivkvluezuiojovpotlyb) and every row in it reads 'DELETE, INSERT,
-- REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'. Naming only INSERT/UPDATE/
-- DELETE therefore left `authenticated` — the role every logged-in student
-- carries — holding TRUNCATE on both room tables, and **TRUNCATE BYPASSES RLS
-- ENTIRELY**: no policy is consulted, so none of the membership gating above
-- would have applied to it.
-- SCOPED HONESTLY, because overstating this would repeat the error contract
-- note 10 was rewritten to fix: PostgREST exposes no TRUNCATE verb, so there is
-- no live client-reachable exploit here today. It is (1) defence in depth, on
-- the same "the day someone adds a permissive route, that default is the
-- difference between a bug and a leak" footing as the rest of this block, and
-- (2) claim accuracy — the A6 block USED TO assert that `authenticated` ends
-- holding SELECT and nothing else on both room tables, and until this line that
-- assertion was simply false on the target environment. The wording is gone
-- (A6 item (6)); what replaced it is the measured end-state in A6 item (9),
-- which reads REFERENCES, SELECT, TRIGGER on both — no TRUNCATE.
-- REFERENCES and TRIGGER are deliberately NOT revoked: both require ownership
-- of, or a matching privilege on, objects `authenticated` cannot reach, and
-- neither reads or destroys a row. TRUNCATE does.
-- 20260729100100 §7 carries the identical revoke for the seven content tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cohort_room_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cohort_room_configs FROM authenticated;
REVOKE ALL ON public.cohort_room_members FROM anon;
REVOKE ALL ON public.cohort_room_configs FROM anon;

-- Helpers must be callable by the roles whose queries hit the policies.
GRANT EXECUTE ON FUNCTION public.cohort_room_is_member(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_can_access(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_can_post_announcement(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_in_lobby(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_in_lobby(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_is_offering_wide(uuid) TO authenticated, anon;
-- The helpers above only ever answer "…about auth.uid()", so anon gets a safe
-- false. cohort_room_phase() discloses a fact about an arbitrary offering, so it
-- stays off anon.
REVOKE ALL ON FUNCTION public.cohort_room_phase(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_phase(uuid, uuid) TO authenticated, service_role;

-- The writers are server-side only. Nothing client-reachable may call them.
-- _room_balance_outstanding() joins to offerings' pricing columns and answers a
-- question about another user's payment state, so it is locked down with them
-- rather than with the access helpers — no policy or RPC calls it.
REVOKE ALL ON FUNCTION public._room_balance_outstanding(uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public._room_balance_outstanding(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cohort_room_resolve_user(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.cohort_room_reconcile() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_resolve_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cohort_room_reconcile() TO service_role;

-- Manual grants (mentor/host appointments, comped members). Rejection is a NULL
-- return plus a WARNING, never a raise — see contract note 7a. `source='manual'`
-- is what makes the row survive the resolver and the nightly reconcile; the one
-- exception, for a `member`/`alumni` grant whose enrolment was later revoked, is
-- contract note 7f. A manual row is offering-wide in SCOPE only for mentor/host
-- (contract note 4).
CREATE OR REPLACE FUNCTION public.admin_grant_room_member(
  p_user uuid, p_offering uuid, p_role text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE WARNING 'admin_grant_room_member: rejected — caller % is not an admin', auth.uid();
    RETURN NULL;
  END IF;
  IF p_user IS NULL OR p_offering IS NULL THEN
    RAISE WARNING 'admin_grant_room_member: rejected — user and offering are required';
    RETURN NULL;
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('mentor','host','member') THEN
    RAISE WARNING 'admin_grant_room_member: rejected — unsupported role %', p_role;
    RETURN NULL;
  END IF;

  -- Say so up front when the grant is one the resolver will take back (contract
  -- note 7f). The row IS written and this returns its id — the admin may be
  -- about to re-activate the enrolment — but "returned a uuid, gone by morning"
  -- is not something anyone should have to discover from the membership table.
  -- Only revoked/cancelled trip this; a lapsed (`expired`) enrolment is comped
  -- back in without complaint.
  IF p_role = 'member'
     AND EXISTS (
       SELECT 1 FROM public.enrolments e
       WHERE e.user_id = p_user AND e.offering_id = p_offering
         AND e.status IN ('revoked','cancelled')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.enrolments e
       WHERE e.user_id = p_user AND e.offering_id = p_offering AND e.status = 'active'
     )
  THEN
    RAISE WARNING 'admin_grant_room_member: user % has a revoked/cancelled enrolment on offering % and no active one — the resolver will retract this member grant (contract note 7f). Re-activate the enrolment, or grant mentor/host, which is never retracted.',
      p_user, p_offering;
  END IF;

  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  VALUES (p_user, p_offering, NULL, p_role, 'manual', 'active')
  ON CONFLICT (user_id, offering_id) WHERE batch_id IS NULL
  DO UPDATE SET role = EXCLUDED.role, source = 'manual', status = 'active'
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- …and the withdrawal. A manual grant is the one membership the truth tables
-- cannot retract on their own, so it needs an explicit off switch: without one
-- an appointment made by mistake could only be undone with raw SQL. Revokes the
-- offering-wide manual row and returns the count (0 when there was none); NULL
-- + WARNING for a non-admin caller, same shape as the grant.
CREATE OR REPLACE FUNCTION public.admin_revoke_room_member(
  p_user uuid, p_offering uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE WARNING 'admin_revoke_room_member: rejected — caller % is not an admin', auth.uid();
    RETURN NULL;
  END IF;
  IF p_user IS NULL OR p_offering IS NULL THEN
    RAISE WARNING 'admin_revoke_room_member: rejected — user and offering are required';
    RETURN NULL;
  END IF;

  UPDATE public.cohort_room_members
  SET status = 'revoked'
  WHERE user_id = p_user
    AND offering_id = p_offering
    AND source = 'manual'
    AND status = 'active';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END $$;

-- The admin write path for the room's skin/tongue/feature level. It exists
-- because `authenticated` holds no DML on cohort_room_configs (see section 7's
-- header): an admin's own JWT cannot PATCH the table through PostgREST, so the
-- one sanctioned client-side edit route is this is_admin()-gated RPC. NULL
-- params leave the stored value alone, so a theme edit cannot blank a vocab.
CREATE OR REPLACE FUNCTION public.admin_upsert_room_config(
  p_offering uuid,
  p_batch    uuid DEFAULT NULL,
  p_slug     text DEFAULT NULL,
  p_phase    text DEFAULT NULL,
  p_theme    jsonb DEFAULT NULL,
  p_vocab    jsonb DEFAULT NULL,
  p_modules  jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE WARNING 'admin_upsert_room_config: rejected — caller % is not an admin', auth.uid();
    RETURN NULL;
  END IF;
  IF p_offering IS NULL THEN
    RAISE WARNING 'admin_upsert_room_config: rejected — offering is required';
    RETURN NULL;
  END IF;
  IF p_phase IS NOT NULL AND p_phase NOT IN ('pre_start','live','wrap','alumni') THEN
    RAISE WARNING 'admin_upsert_room_config: rejected — unsupported phase %', p_phase;
    RETURN NULL;
  END IF;

  -- BATCH/OFFERING INTEGRITY, imperatively. Section 0's UNIQUE and the composite
  -- FK it enables (both executed in §7A) are the DECLARATIVE form of this rule,
  -- and both degrade to a
  -- WARNING when their lock is cancelled (contract notes 10 and 11) — so on a
  -- degraded project this check is the only thing between an admin RPC call and
  -- a config row whose batch belongs to a DIFFERENT offering. Such a row is not
  -- inert: cohort_room_phase() and room_configs_member_read both resolve through
  -- batch_id, so it would take effect as a live override.
  -- SCOPE, so the degradation note it backs stays honest: this covers the RPC,
  -- which is the only sanctioned write path for `authenticated` (section 7
  -- revokes their DML on the table). It does NOT cover service_role or direct
  -- SQL, which write past both the policy and this function — for those the FK
  -- is the only guard, and while it is missing there is none.
  -- Rejection is NULL + WARNING, never a raise (contract note 7a).
  IF p_batch IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.cohort_batches b
       WHERE b.id = p_batch AND b.offering_id = p_offering
     )
  THEN
    RAISE WARNING 'admin_upsert_room_config: rejected — batch % does not belong to offering % (a batch override must be a batch of its own offering)',
      p_batch, p_offering;
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_id
  FROM public.cohort_room_configs c
  WHERE c.offering_id = p_offering
    AND c.batch_id IS NOT DISTINCT FROM p_batch;

  IF v_id IS NULL THEN
    IF p_slug IS NULL THEN
      RAISE WARNING 'admin_upsert_room_config: rejected — a new room config needs a slug';
      RETURN NULL;
    END IF;
    INSERT INTO public.cohort_room_configs (offering_id, batch_id, slug, phase, theme, vocab, modules)
    VALUES (p_offering, p_batch, p_slug,
            COALESCE(p_phase, 'pre_start'),
            COALESCE(p_theme, '{}'::jsonb),
            COALESCE(p_vocab, '{}'::jsonb),
            COALESCE(p_modules, '{}'::jsonb))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cohort_room_configs c
    SET slug    = COALESCE(p_slug, c.slug),
        phase   = COALESCE(p_phase, c.phase),
        theme   = COALESCE(p_theme, c.theme),
        vocab   = COALESCE(p_vocab, c.vocab),
        modules = COALESCE(p_modules, c.modules)
    WHERE c.id = v_id;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_grant_room_member(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_room_member(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_revoke_room_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_room_member(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_room_config(uuid, uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_room_config(uuid, uuid, text, text, jsonb, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.cohort_room_configs IS
  'Cohort room skin/tongue/feature-level per offering (optional per-batch override). RLS never reads modules or vocab. Client-role DML is revoked: admins write through admin_upsert_room_config().';
COMMENT ON TABLE public.cohort_room_members IS
  'Server-derived room membership. Written only by cohort_room_resolve_user(), the alumni flip, cohort_room_reconcile() and the admin grant/revoke RPCs. Never client-claimed (NFR-SEC-1).';
COMMENT ON FUNCTION public.cohort_room_in_lobby(uuid, uuid) IS
  'TRUE only for role=pre_member. Gates the SEC-MEMBER-1 whitelist. Never widen the member helpers to include pre_member.';
COMMENT ON FUNCTION public.cohort_room_is_offering_wide(uuid) IS
  'The single definition of the offering-wide staff scope (ROSTER-SCOPE-1): a NULL-batch mentor/host grant, or an admin. R-3''s cohort_room_caller_scope() must call this instead of re-stating it.';


-- ---------------------------------------------------------------------------
-- 7A. LIVE-TABLE DDL — LAST, ON PURPOSE. Do not move anything below this line
--     back up the file, and do not add an executable statement after it.
--
--     THE RULE THIS SECTION EXISTS FOR: a lock taken by `ALTER TABLE` /
--     `DROP TRIGGER` / `CREATE TRIGGER` is HELD UNTIL THE TRANSACTION COMMITS,
--     not until the statement ends. This file has no top-level COMMIT, so a
--     lock taken at the top is a lock held for two thousand lines. Block 1 takes
--     ACCESS EXCLUSIVE, which conflicts with SELECT, and lock requests queue
--     FIFO, so that hold on `cohort_batches` (joined by R-3's room RPCs and by
--     get_cohort_progress) blanks the shipped student dashboard on every surface
--     for the length of the apply; blocks 2-6 take SHARE ROW EXCLUSIVE on a
--     first apply, which spares readers and queues WRITES, so the hold on
--     `enrolments` and `cohort_applications` stalls checkout WRITES. The six
--     blocks below used to live in §0, §1 and §5 for readability; they are
--     gathered here so their locks are taken with nothing left in THIS FILE to
--     execute afterwards. Contract note 10 carries the full model, the three
--     measured lock classes and the cost of the success path.
--
--     WHAT IS STILL EXPOSED, so nobody reads "moved to the foot" as "instant":
--     the push commits at the END OF THE PUSH, not at the end of this file. So
--     EVERY lock taken below is held across 20260729100100 and 20260729100200 as
--     well — block 1's ACCESS EXCLUSIVE on cohort_batches (the dashboard) AND
--     blocks 4/5's on `enrolments` and block 6's on `cohort_applications` (the
--     money path's writes). An earlier revision of this paragraph said the
--     checkout exposure "really does end with this section" on the grounds that
--     neither sibling touches those two tables. That reasoning is wrong: the
--     lock is ours and it is held to COMMIT whatever the siblings do or do not
--     read. Checkout is queued for the rest of the push, not for the rest of
--     this section. cohort_batches WRITES were already blocked from §1 by the
--     plain FK on cohort_room_configs.batch_id and this section does not change
--     that; `users` and `offerings` writes likewise, from §1/§2, and
--     `cohort_weeks`/`live_sessions` writes from 20260729100100 §2/§4. The full
--     residual — including 20260729100200's own unguarded CREATE INDEX on
--     `live_sessions`, the one unbounded lock WAIT left in R0 — is contract
--     note 10. Push R0 alone, in a quiet window, and size that window from the
--     whole push.
--
--     ORDER IS LOAD-BEARING IN EXACTLY ONE PLACE: block 1's UNIQUE (id,
--     offering_id) is what block 2's composite FK references, so 1 precedes 2.
--     Nothing else here depends on anything else here.
--
--     EVERY BLOCK IS INDEPENDENTLY RE-RUNNABLE BY HAND, which is what contract
--     note 11(a) recovery means in practice: blocks 1 and 2 re-probe
--     pg_constraint and no-op when the object exists; blocks 3-6 are
--     `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` inside one transaction, so the
--     trigger is never observably absent to a concurrent writer. Copy the block
--     that warned, verbatim, and run it against the target project when the
--     table is quiet. "When the table is quiet" is not politeness for blocks
--     3-6: a re-run is the case where the DROP has a target, so it is the case
--     where the mode is ACCESS EXCLUSIVE and readers queue behind it — unlike
--     the push itself. Detection is the section-8 VERIFY query, not the push log.
--
--     LOCK_TIMEOUT IS 1s AT EVERY SITE (was 4s). It is a bound on ACQUISITION
--     and it is paid on the way in whether or not the block succeeds — six
--     guarded blocks here, THREE of them waiting on a money-path table (4 and 5
--     on `enrolments`, 6 on `cohort_applications`), so the worst-case SUCCESS
--     path queues money-path WRITES for 3s (a pending SHARE ROW EXCLUSIVE does
--     not conflict with SELECT, so reads pass) plus up to 1s of dashboard READS
--     at block 1, and the whole section for 6s. At the old 4s those figures were
--     12s and 24s, and no comment in the file said so.
--     It bounds the WAIT only; the HOLD runs to the end of the push either way.
-- ---------------------------------------------------------------------------

-- 1 of 6 — the prerequisite UNIQUE on cohort_batches. Section 0 states what this
-- constraint is for and exactly what is lost when it degrades to a WARNING; this
-- is only where it executes. ACCESS EXCLUSIVE on a live table PLUS a real index
-- build, so it is the heaviest single statement in R0.
DO $$
DECLARE
  v_prev_lock_timeout text;
BEGIN
  IF to_regclass('public.cohort_batches') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'cohort_batches_id_offering_key'
         AND conrelid = 'public.cohort_batches'::regclass
     )
  THEN
    BEGIN
      v_prev_lock_timeout := current_setting('lock_timeout', true);
      PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only

      ALTER TABLE public.cohort_batches
        ADD CONSTRAINT cohort_batches_id_offering_key UNIQUE (id, offering_id);

      PERFORM set_config('lock_timeout',
                         COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
    EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
                OR crash_shutdown OR cannot_connect_now OR others THEN
      -- The subtransaction rollback also restores lock_timeout, so nothing is
      -- left set for the rest of the push.
      RAISE WARNING 'cohort_room: could not add cohort_batches_id_offering_key (%) [%] — the composite FK on cohort_room_configs is skipped with it, so batch/offering integrity now holds ONLY on the admin_upsert_room_config() write path (service_role and direct SQL are unguarded). Another db push will NOT fix this: re-run this DO block by hand when the lock is free — contract note 11.',
        SQLERRM, SQLSTATE;
    END;
  END IF;
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room: cohort_batches_id_offering_key probe failed (%) [%] — constraint not added; re-run this DO block by hand (contract note 11)', SQLERRM, SQLSTATE;
END $$;

-- 2 of 6 — the composite FK that pins a batch override to its offering (declared
-- in §1, executed here). It needs block 1's UNIQUE: if that degraded to a
-- WARNING this one CANNOT succeed, and an unhandled "there is no unique
-- constraint matching given keys" would abort the whole shared `db push` for a
-- rule that keeps a PARTIAL imperative fallback in admin_upsert_room_config() —
-- the admin RPC path only, not service_role or direct SQL (see §0). Adding a
-- foreign key takes SHARE ROW EXCLUSIVE on BOTH sides (measured — A6 item (8)):
-- on cohort_room_configs and on the referenced LIVE table cohort_batches. It
-- therefore blocks WRITES to cohort_batches, not reads, and it now carries a
-- bounded wait of its own; the old version inherited the session default of
-- "wait forever".
DO $$
DECLARE
  v_prev_lock_timeout text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_config_batch_belongs_to_offering'
      AND conrelid = 'public.cohort_room_configs'::regclass
  ) THEN
    BEGIN
      v_prev_lock_timeout := current_setting('lock_timeout', true);
      PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only

      ALTER TABLE public.cohort_room_configs
        ADD CONSTRAINT room_config_batch_belongs_to_offering
        FOREIGN KEY (batch_id, offering_id)
        REFERENCES public.cohort_batches (id, offering_id)
        ON DELETE CASCADE;

      PERFORM set_config('lock_timeout',
                         COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
    EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
                OR crash_shutdown OR cannot_connect_now OR others THEN
      RAISE WARNING 'cohort_room_configs: could not add room_config_batch_belongs_to_offering (%) [%] — a batch override is no longer declaratively pinned to its offering; admin_upsert_room_config() still rejects one on the RPC path, but service_role and direct SQL are unguarded. Another db push will NOT fix this: re-run this DO block by hand once cohort_batches_id_offering_key exists — contract note 11.',
        SQLERRM, SQLSTATE;
    END;
  END IF;
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room_configs: room_config_batch_belongs_to_offering probe failed (%) [%] — constraint not added; re-run this DO block by hand (contract note 11)', SQLERRM, SQLSTATE;
END $$;

-- 3 of 6 — attachment 1 of 4, on cohort_batch_members. §5 preamble. The DDL is
-- spelled out in EXECUTE strings only because a LOCAL lock_timeout has to share
-- a statement with the DDL it bounds; the object names stay greppable.
DO $$
DECLARE
  v_prev_lock_timeout text := current_setting('lock_timeout', true);
BEGIN
  PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only
  EXECUTE 'DROP TRIGGER IF EXISTS room_resolve_on_batch_member ON public.cohort_batch_members';
  EXECUTE $ddl$
    CREATE TRIGGER room_resolve_on_batch_member
      AFTER INSERT OR UPDATE OR DELETE ON public.cohort_batch_members
      FOR EACH ROW EXECUTE FUNCTION public._room_resolve_from_batch_member()
  $ddl$;
  PERFORM set_config('lock_timeout',
                     COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room: could not attach room_resolve_on_batch_member to cohort_batch_members (%) [%] — roster edits will NOT derive membership on write; the 03:45 reconcile still does, so this degrades to <=24h lag, not to a leak. Another db push will NOT fix it: re-run this DO block by hand when the table is quiet (contract note 11) and confirm with the section-8 VERIFY query.',
    SQLERRM, SQLSTATE;
END $$;

-- 4 of 6 — attachment 2 of 4, and the first of two on `enrolments` itself, the
-- money table. On a first apply the DROP IF EXISTS is a no-op that takes no
-- relation lock and the CREATE takes SHARE ROW EXCLUSIVE: checkout WRITES queue
-- to the end of the push, reads pass. On a RE-RUN the DROP finds its target and
-- takes ACCESS EXCLUSIVE, which stalls readers too — so recover this block by
-- hand only when the table is quiet. §5 preamble; modes in A6 item (8).
DO $$
DECLARE
  v_prev_lock_timeout text := current_setting('lock_timeout', true);
BEGIN
  PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only
  EXECUTE 'DROP TRIGGER IF EXISTS room_resolve_on_enrolment_status ON public.enrolments';
  EXECUTE $ddl$
    CREATE TRIGGER room_resolve_on_enrolment_status
      AFTER UPDATE OF status ON public.enrolments
      FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION public._room_resolve_from_enrolment()
  $ddl$;
  PERFORM set_config('lock_timeout',
                     COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room: could not attach room_resolve_on_enrolment_status to enrolments (%) [%] — an enrolment status flip (including a REVOCATION) will not re-derive membership on write; the 03:45 reconcile still revokes, so access outlives the flip by up to 24h. Re-run this DO block by hand when the table is quiet (contract note 11), then run the section-8 VERIFY query.',
    SQLERRM, SQLSTATE;
END $$;

-- 5 of 6 — attachment 3 of 4, the second on `enrolments`. §5 preamble.
DO $$
DECLARE
  v_prev_lock_timeout text := current_setting('lock_timeout', true);
BEGIN
  PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only
  EXECUTE 'DROP TRIGGER IF EXISTS room_resolve_on_enrolment_insert ON public.enrolments';
  EXECUTE $ddl$
    CREATE TRIGGER room_resolve_on_enrolment_insert
      AFTER INSERT ON public.enrolments
      FOR EACH ROW WHEN (NEW.status = 'active')
      EXECUTE FUNCTION public._room_resolve_from_enrolment_insert()
  $ddl$;
  PERFORM set_config('lock_timeout',
                     COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room: could not attach room_resolve_on_enrolment_insert to enrolments (%) [%] — a fresh purchase will not open the room until the 03:45 reconcile, which is exactly the <=24h gap contract note 9 added this trigger to close. Re-run this DO block by hand when the table is quiet (contract note 11), then run the section-8 VERIFY query.',
    SQLERRM, SQLSTATE;
END $$;

-- 6 of 6 — attachment 4 of 4, on cohort_applications, which carries the
-- confirmation- and balance-payment stamps and is a money-path table too.
-- §5 preamble. NOTHING EXECUTES AFTER THIS BLOCK.
DO $$
DECLARE
  v_prev_lock_timeout text := current_setting('lock_timeout', true);
BEGIN
  PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only
  EXECUTE 'DROP TRIGGER IF EXISTS room_resolve_on_application_status ON public.cohort_applications';
  EXECUTE $ddl$
    CREATE TRIGGER room_resolve_on_application_status
      AFTER UPDATE OF status, confirmation_payment_id, user_id ON public.cohort_applications
      FOR EACH ROW WHEN (
        NEW.user_id IS NOT NULL AND (
          OLD.status IS DISTINCT FROM NEW.status
          OR OLD.confirmation_payment_id IS DISTINCT FROM NEW.confirmation_payment_id
          OR OLD.user_id IS DISTINCT FROM NEW.user_id
        )
      )
      EXECUTE FUNCTION public._room_resolve_from_application()
  $ddl$;
  PERFORM set_config('lock_timeout',
                     COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room: could not attach room_resolve_on_application_status to cohort_applications (%) [%] — the confirmation-capture stamp will not mint the lobby row and the balance flip will not promote it until the 03:45 reconcile. Re-run this DO block by hand when the table is quiet (contract note 11), then run the section-8 VERIFY query.',
    SQLERRM, SQLSTATE;
END $$;


-- ============================================================================
-- 8. POST-PUSH VERIFY (contract note 11) — the check that replaces "read the
--    WARNINGs". Every guarded DDL block in R0 lets the migration COMPLETE
--    whether or not its ALTER — or its CREATE TRIGGER — landed, and `db push`
--    stamps the version either way, so a green push proves nothing about the
--    objects below and the
--    WARNING that says so is a scrolling line CI throws away. Run this against
--    the target project after any push that included 20260729100000 or
--    20260729100100. Treat a MISSING as an incident, not a note.
--
--      SELECT v.what,
--             CASE WHEN c.oid IS NULL      THEN 'MISSING — contract note 11'
--                  WHEN NOT c.convalidated THEN 'present (NOT VALID)'
--                  ELSE 'ok' END AS verdict
--        FROM (VALUES
--          ('cohort_batches',           'cohort_batches_id_offering_key',        'UNIQUE(id,offering_id)      — 100000 §7A.1'),
--          ('cohort_room_configs',      'room_config_vocab_object',              'CHECK vocab is an object    — 100000 §1'),
--          ('cohort_room_configs',      'room_config_batch_belongs_to_offering', 'FK batch belongs to offering— 100000 §7A.2'),
--          ('cohort_announcements',     'cohort_announcements_author_id_fkey',   'author FK (SET NULL)        — 100100 §1'),
--          ('cohort_room_posts',        'room_posts_body_len_chk',               'CHECK body 1..20000         — 100100 §3'),
--          ('cohort_room_posts',        'room_posts_media_array_chk',            'CHECK media is an array     — 100100 §3'),
--          ('cohort_room_post_replies', 'room_reply_body_len_chk',               'CHECK body 1..10000         — 100100 §3')
--        ) AS v(tbl, conname, what)
--        LEFT JOIN pg_constraint c
--          ON c.conname  = v.conname
--         AND c.conrelid = to_regclass('public.' || v.tbl)
--       ORDER BY 2, 1;
--
--    `present (NOT VALID)` is the EXPECTED answer for the four objects
--    20260729100100 adds that way — they bind every future INSERT/UPDATE and
--    deliberately never scan existing rows. It is NOT expected for
--    room_config_vocab_object: there it means the validating scan was cancelled
--    or a legacy row holds a non-object vocab.
--
--    THE SECOND HALF — the four trigger attachments on the money tables
--    (declared in §5, executed in §7A blocks 3-6). They are guarded the same way
--    and degrade the same way (a WARNING, and membership derived only by the
--    03:45 reconcile), so they need the same check and they are NOT in
--    pg_constraint:
--
--      SELECT v.what,
--             CASE WHEN t.oid IS NULL THEN 'MISSING — contract note 11'
--                  WHEN t.tgenabled = 'D' THEN 'present but DISABLED'
--                  ELSE 'ok' END AS verdict
--        FROM (VALUES
--          ('cohort_batch_members', 'room_resolve_on_batch_member',       'roster edit -> resolve   — §7A.3'),
--          ('enrolments',           'room_resolve_on_enrolment_status',   'status flip -> resolve   — §7A.4'),
--          ('enrolments',           'room_resolve_on_enrolment_insert',   'fresh purchase -> resolve— §7A.5'),
--          ('cohort_applications',  'room_resolve_on_application_status', 'confirmation -> lobby    — §7A.6')
--        ) AS v(tbl, tgname, what)
--        LEFT JOIN pg_trigger t
--          ON t.tgname   = v.tgname
--         AND t.tgrelid  = to_regclass('public.' || v.tbl)
--         AND NOT t.tgisinternal
--       ORDER BY 1;
--
--    A MISSING here is not a leak — a trigger that never attached grants nobody
--    anything — but it IS an up-to-24h lag on both opening and REVOKING room
--    access, so treat it as an incident on the same footing as the constraints.
--
--    THE THIRD CHECK — THE GRANTS, and this one must be run on the TARGET
--    project, never on a shadow built from supabase/migrations/ alone. §7 (and
--    20260729100100 §7) revokes verbs that only EXIST on a database carrying
--    Supabase's `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon,
--    authenticated, service_role` bootstrap; a migrations-only stack never
--    granted them, so it answers "clean" for a reason that has nothing to do
--    with the revoke and proves nothing about prod (this is the false-assurance
--    trap qa-harness/shadow-grants.sql exists to close — load it first, or run
--    this against prod itself).
--
--    WHAT COUNTS AS A PASS, spelled out per verb and per table, because TWO
--    previous versions of this paragraph published an expectation an operator
--    following it verbatim would have read as a defect on a CORRECT database:
--      · v1 said "SELECT alone". §7 of this file states in as many words that
--        REFERENCES and TRIGGER are deliberately NOT revoked, so on a
--        bootstrapped database they are present by design — v1 missed on 9/9
--        rows and invited a "fix" that revokes two verbs this file kept.
--      · v2 fixed that and then added INSERT to all seven content tables on the
--        reasoning that "omitting a verb from a GRANT does not remove it". True
--        in general, but 20260729100100 §3 does not merely omit INSERT for the
--        commons — it REVOKEs it (`REVOKE INSERT ON public.cohort_room_posts
--        FROM authenticated, anon;` and the same for the replies table). v2
--        missed on 2/9 rows. The nine rows below are MEASURED, not reasoned —
--        A6 item (9) records the replay and its output verbatim.
--    On PROD (bootstrap has run), the expected `authenticated` rows are:
--      · cohort_room_configs, cohort_room_members
--          → REFERENCES, SELECT, TRIGGER
--      · FIVE content tables — cohort_announcements, cohort_resources,
--        cohort_recording_progress, cohort_demo_entries, cohort_room_seen
--          → DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--      · the TWO commons tables — cohort_room_posts, cohort_room_post_replies
--          → DELETE, REFERENCES, SELECT, TRIGGER, UPDATE   (NO INSERT)
--        INSERT is absent because 20260729100100 §3 revokes it explicitly:
--        SEC-WRITE-1 makes the commons RPC-only, and a raw client INSERT fails
--        on the missing grant before RLS is consulted at all. INSERT APPEARING
--        ON EITHER ROW IS A DEFECT — that revoke did not land.
--      · `anon` → no rows at all, on any of the nine.
--    THE ONE ABSOLUTE: TRUNCATE must not appear on ANY row, because TRUNCATE
--    bypasses RLS. That clause of the old expectation was the correct part.
--    Do not "explain away" a missing INSERT on the commons with an RLS argument:
--    `posts_admin_all` / `replies_admin_all` carry no FOR and no TO clause, so
--    they are FOR ALL TO PUBLIC and DO admit INSERT for an admin JWT. The grant
--    is what closes that path, for admins and members alike; a version of this
--    paragraph that said "there is no INSERT policy for authenticated on either"
--    was wrong about the policies as well as about the grants.
--    On a MIGRATIONS-ONLY shadow the same query returns the GRANTs alone (no
--    REFERENCES, no TRIGGER) — which is why this check proves nothing there, per
--    the paragraph above.
--
--      SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type)
--        FROM information_schema.role_table_grants
--       WHERE table_schema = 'public'
--         AND grantee IN ('anon','authenticated')
--         AND table_name IN ('cohort_room_configs','cohort_room_members',
--                            'cohort_announcements','cohort_resources',
--                            'cohort_room_posts','cohort_room_post_replies',
--                            'cohort_recording_progress','cohort_demo_entries',
--                            'cohort_room_seen')
--       GROUP BY 1, 2
--       ORDER BY 1, 2;
--
--    `anon` should return no rows at all. A TRUNCATE anywhere in the output is
--    the §7 revoke not having landed — re-run those REVOKE statements by hand
--    (they are plain DDL, idempotent, and take no lock on a money table).
--
--    Two things those queries cannot cover:
--      · the announcements author FK must also be ON DELETE SET NULL rather than
--        the draft's CASCADE, or deleting a host's account still erases the
--        noticeboard of every cohort they ran. 'n' is the right answer:
--          SELECT confdeltype FROM pg_constraint
--           WHERE conname = 'cohort_announcements_author_id_fkey';
--      · the nightly job, which lives in a schema that may not exist at all:
--          SELECT schedule, active FROM cron.job
--           WHERE jobname = 'cohort_room_reconcile_nightly';   -- '15 22 * * *'
--        No cron.job, or zero rows, means the reconcile is manual — and the
--        money path's swallow (contract note 10, shape A) is then running with
--        no compensating control. Schedule it by hand.
-- ============================================================================


-- ============================================================================
-- MEASUREMENT (A6) — thresholds: enrolment INSERT p95 regression < 5ms;
-- resolver < 50ms/user at prod scale.
--
-- MEASURED 2026-07-27 on PGlite (Postgres 17, WASM, in-memory, this machine) —
-- there is no shadow project reachable from this branch, so the migration was
-- applied to a real Postgres carrying stand-ins for its prereq tables
-- (users/offerings/cohort_batches/enrolments/cohort_batch_members/
-- cohort_applications, with the same columns, the same
-- `enrolments_unique_active` partial index and the same updated_at triggers).
-- Databases are seeded in BASELINE/AFTER pairs — BASELINE = the prereq schema
-- alone, AFTER = the same schema with this migration applied — and the enrolment
-- INSERT is timed on each side against both a room-bearing and a room-less
-- offering, because the money path's cost now depends on which it is.
-- Absolute latencies on
-- WASM are not prod latencies; the A/B DELTA on identical data is what the
-- threshold is about, and that is what is reported. Re-run (1) and (2) on the
-- shadow project before the prod push, with the recipes below.
--
-- Method note: PGlite's clock_timestamp() resolves to 1 ms, so a single INSERT
-- sits under the clock floor. Each sample is therefore a BATCH divided by its
-- size — 25 samples x 20 INSERTs (500 timed INSERTs, 0.05 ms of resolution per
-- INSERT), and for the resolver 20 samples x 10 users (0.1 ms of resolution per
-- user). On the shadow project, where clock_timestamp() is microsecond-
-- resolution, time each statement individually instead.
--
-- (1) enrolment INSERT, 500 timed single-row INSERTs into public.enrolments,
--     RE-MEASURED after the AFTER INSERT trigger of contract note 9 was added —
--     the money path now does carry room work, so it is measured twice: once
--     against an offering that HAS a room (the trigger runs the whole resolver)
--     and once against one that does not (the trigger short-circuits on one
--     index probe). Four runs; the spread across runs is shown, since on WASM
--     the run-to-run noise is larger than the effect being measured.
--
--     ROOM-BEARING offering — worst case, every INSERT resolves the user:
--                 BASELINE          AFTER             DELTA p95
--          p50    0.00–0.05 ms      0.20–0.25 ms
--          p95    0.05 ms           0.20–0.85 ms      +0.15 … +0.80 ms
--          max    0.05–0.10 ms      0.20–1.05 ms
--
--     ROOM-LESS offering — the common case (masterclass checkout):
--          p50    0.00–0.05 ms      0.05 ms
--          p95    0.05–0.10 ms      0.05 ms           −0.05 … +0.00 ms
--          max    0.05–0.35 ms      0.05–0.25 ms
--
--     PASS on both, against a < 5 ms threshold: the worst observed regression is
--     0.80 ms on the cohort path, and the room-less path — which is where the
--     volume is — shows no regression outside the clock's resolution step.
--     The structural reasons: the trigger is AFTER, is skipped entirely unless
--     `status='active'`, and its first act is an EXISTS against
--     cohort_room_configs_offering_idx. The harness asserts the trigger SHAPE by
--     reading pg_trigger, not by reading the source: `enrolments` must carry
--     exactly two room triggers, AFTER INSERT … WHEN (status='active') and
--     AFTER UPDATE OF status.
--     Shadow-project form — run before and after apply, against BOTH a
--     room-bearing and a room-less offering, and compare:
--       CREATE TABLE ins_ms(ms double precision);
--       DO $harness$
--       DECLARE t0 timestamptz; i int;
--       BEGIN
--         FOR i IN 1..500 LOOP
--           t0 := clock_timestamp();
--           INSERT INTO public.enrolments (user_id, offering_id, status, source)
--           VALUES (<seeded user uuid #i>, <seeded offering uuid>, 'active', 'admin_grant');
--           INSERT INTO ins_ms VALUES (EXTRACT(epoch FROM clock_timestamp() - t0) * 1000);
--         END LOOP;
--       END $harness$;
--       SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY ms) FROM ins_ms;
--     …or, with pg_stat_statements already enabled on the shadow:
--       SELECT calls, mean_exec_time, max_exec_time
--       FROM pg_stat_statements
--       WHERE query ILIKE 'insert into%enrolments%';
--
-- (2) resolver cost per user — 200 enrolled members spread over 2 batches of one
--     room-bearing offering, cohort_room_resolve_user() called once per member,
--     re-measured with the `_room_balance_outstanding()` probe now in branches
--     (a), (a2), (b) and both retractions:
--       p50 0.20 ms · p95 0.20–0.50 ms · max 0.70 ms   (threshold < 50 ms) PASS
--     A second full pass over the same 200 users — the pure no-op re-derivation
--     the reconcile performs nightly — measures identically (p50 0.20 ms,
--     p95 0.20 ms), which is the idempotence claim measured rather than argued.
--     Shadow-project form (after qa-harness/cohort-room-fixtures.sql):
--       EXPLAIN (ANALYZE, BUFFERS, TIMING)
--         SELECT public.cohort_room_resolve_user('<a seeded member uuid>');
--       -- the plan should ride idx_enrolments_user_active,
--       -- idx_cohort_batch_members_enrolment, idx_cohort_apps_user,
--       -- idx_cohort_apps_offering, cohort_room_configs_offering_idx and
--       -- room_members_access_idx — no seq scan on enrolments,
--       -- cohort_applications or cohort_room_members.
--
-- (3) reconcile over that same 200-member world: 36–39 ms wall clock end to end
--     (~0.19 ms/user; one outlier run at 87 ms, still ~0.4 ms/user).
--     Shadow form:  \timing on  SELECT public.cohort_room_reconcile();
--
-- (4) the SEC-ENT-2 proof (forced trigger failure) — recipe in contract note 8,
--     EXECUTED on the same harness for all THREE failure surfaces:
--       a. `CHECK (false) NOT VALID` on cohort_room_members forcing every
--          resolver write to throw → the cohort_batch_members INSERT, the
--          `enrolments` status UPDATE **and the `enrolments` INSERT** all
--          COMMITTED, the failure surfacing only as a WARNING;
--       b. the batch-member trigger's DRIVING QUERY forced to throw (the
--          `enrolments` relation swapped for a view that raises on read, so the
--          error lands in the array_agg and not in the resolver) → the roster
--          write still COMMITTED. That statement used to sit outside the
--          exception block, where a CHECK-constraint recipe could never reach
--          it; it is now inside one, and this is the case that proves it;
--       c. cohort_room_reconcile() re-derived the correct membership once the
--          constraint was dropped.
--
-- (5) Also executed on the harness, since they are the properties this file was
--     rewritten for. Δ2 tier line: a confirmation-paid student with an ACTIVE
--     but balance-owing enrolment (the razorpay-webhook shape) stays
--     `pre_member` through a batch assignment AND a full reconcile, then becomes
--     a batch-scoped `member` on the balance capture; a `confirmationCoversAll`
--     enrolment whose application never leaves 'confirmation_paid' is a member
--     immediately; a bare enrolment INSERT (non-staged / admin / legacy RPC)
--     reaches the room synchronously, and one in a room-less offering mints
--     nothing. Plus: revocation is terminal across a second resolver run AND a
--     full reconcile (no lobby resurrection); an active enrolment with no batch
--     resolves to `member` and cannot read another batch's content; a
--     pre_member is not a member on any helper; a manual mentor grant survives
--     resolver + reconcile and stays offering-wide; a manual `member` grant over
--     an EXPIRED enrolment survives both while a revoked one is still retracted;
--     a re-pointed batch leaves no active row on the old offering; the alumni
--     flip renames derived rows; the migration re-applies onto its own output,
--     including onto a project that is missing the `vocab` column, where the
--     re-apply restores the column AND its shape CHECK; and the DOWN block below
--     runs to completion with an R-2-style dependent policy in place, leaving
--     zero cohort_room objects and all three truth tables intact.
--
-- (6) WITHDRAWN CLAIM, KEPT BECAUSE THE REASON IS THE POINT. This block used to
--     end item (5) with "`authenticated` ends holding SELECT and nothing else on
--     BOTH room tables and `anon` holding nothing", stated as executed fact. It
--     was WITHDRAWN rather than restated, because the harness as it then stood
--     could not establish it and, on the environment that matters, it was false.
--     Item (9) below now measures the grant end-state properly — under an ARMED
--     bootstrap — and its result is not the withdrawn wording.
--       · The harness is a database built from supabase/migrations/ on PGlite.
--         It never runs Supabase's hosted bootstrap (`ALTER DEFAULT PRIVILEGES
--         IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated,
--         service_role`), so `authenticated` was never granted the verbs §7
--         revokes. Observing "SELECT and nothing else" there measures the
--         ABSENCE OF THE BOOTSTRAP, not the presence of the revoke — the exact
--         false-assurance failure qa-harness/shadow-grants.sql was written to
--         document.
--       · On production, where the bootstrap HAS run, the claim was untrue when
--         it was written: §7 revoked INSERT/UPDATE/DELETE only, and `ALL` is
--         seven verbs, so `authenticated` retained TRUNCATE — which bypasses RLS
--         — on both room tables. §7 now revokes TRUNCATE as well (and
--         20260729100100 §7 does the same for the seven content tables), but a
--         fix is not a measurement.
--     WHAT WOULD MAKE IT TRUE AGAIN: run the grants query in the THIRD CHECK of
--     section 8 against a shadow that has had qa-harness/shadow-grants.sql
--     applied — or against prod after the push — and paste THE OUTPUT, verbatim,
--     here. Paste rows, not a verdict: the claim to record is "here is what
--     `authenticated` holds on the nine tables", checked against the per-verb
--     expectation that THIRD CHECK now spells out (REFERENCES and TRIGGER are
--     expected and deliberate; TRUNCATE on any row is the failure). Do not
--     reinstate the old "SELECT and nothing else" wording — it was never the
--     right expectation for a bootstrapped database, and restating it would be
--     the same wrong-claim failure this item exists to record.
--     Until someone does that ON THE TARGET, this file claims nothing about the
--     TARGET's grants beyond item (9)'s replay and the text of the REVOKE
--     statements themselves.
--
-- (7) THE §7A REORDERING POST-DATES EVERY MEASUREMENT ABOVE, and does not
--     invalidate any of them: it moved six DDL blocks from §0/§1/§5 to the foot
--     of the file without changing one character of the constraint or trigger
--     DEFINITIONS or of the functions they call. (What did change around them:
--     the LOCAL lock_timeout ceiling went 4s → 1s at every site, and the
--     composite-FK block gained the lock_timeout wrapper it never had. Both are
--     apply-time only — no trigger fires differently, no constraint checks
--     differently.) Runtime cost is therefore identical and (1) through (5)
--     stand as measured. What it changes is APPLY
--     time only, and specifically the lock HOLD window (contract note 10), which
--     none of these measurements ever covered: the harness applies to an idle
--     single-connection database where a held ACCESS EXCLUSIVE has nobody to
--     block, so no A/B on this machine can show the difference. The DURATION of
--     the hold is therefore not measured here and cannot be; the MODE of every
--     lock taken is, in item (8). Do not let a future revision "confirm" the
--     duration on PGlite.
--
-- (8) LOCK MODES PER STATEMENT — MEASURED 2026-07-29, PGlite 0.5.4 (PostgreSQL
--     18.3, WASM, this machine), because contract note 10 got them wrong twice
--     from first principles and a third guess was not worth making. Method: each
--     statement run alone inside an open transaction against stand-in tables,
--     then `SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON
--     c.oid = l.relation WHERE l.locktype = 'relation'`, then ROLLBACK. Only
--     modes at or above ROW EXCLUSIVE are listed; the transient ACCESS
--     SHARE/ROW SHARE entries a catalogue lookup leaves behind are omitted.
--
--       DROP TRIGGER IF EXISTS <ABSENT>  ON t   → NO relation lock at all
--       DROP TRIGGER IF EXISTS <PRESENT> ON t   → ACCESS EXCLUSIVE
--       CREATE TRIGGER … ON t                   → SHARE ROW EXCLUSIVE
--       §7A blocks 3-6 as written, FIRST APPLY
--         (DROP IF EXISTS absent; CREATE)       → SHARE ROW EXCLUSIVE
--       §7A blocks 3-6 as written, RE-RUN
--         (DROP IF EXISTS present; CREATE)      → ACCESS EXCLUSIVE
--       ALTER TABLE t ADD CONSTRAINT … UNIQUE   → ACCESS EXCLUSIVE on t
--                                                 (+ SHARE for the index build)
--       ALTER TABLE child ADD … FOREIGN KEY …
--         REFERENCES parent                     → SHARE ROW EXCLUSIVE on BOTH
--                                                 child and parent
--       CREATE TABLE … REFERENCES parent        → SHARE ROW EXCLUSIVE on parent
--       CREATE INDEX (non-CONCURRENT) ON t      → SHARE on t
--
--     WHAT THIS SETTLES, and it is the whole reason the block is here: a first
--     apply — which prod is, since these trigger names are new — never takes
--     ACCESS EXCLUSIVE on `enrolments` or `cohort_applications`. §7A blocks 4-6
--     queue money-path WRITES and let readers through. The one ACCESS EXCLUSIVE
--     on a live table in this file is block 1's, on `cohort_batches`, and that
--     one IS a read block: it is the dashboard exposure, and it is the only one.
--     WHAT IT DOES NOT SETTLE: durations, queue depth, or anything about the
--     target's own concurrent load. Modes only.
--
-- (9) GRANT END-STATE UNDER AN ARMED BOOTSTRAP — MEASURED 2026-07-29, same
--     PGlite build. This is the measurement item (6) says was missing, done the
--     only way this machine can do it honestly: the bootstrap is ARMED FIRST
--     (`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
--     authenticated, service_role`, SECTION A of qa-harness/shadow-grants.sql,
--     which is generated from prod), the nine tables are then created, and
--     EVERY `GRANT`/`REVOKE … ON public.<one of the nine>` statement in
--     20260729100000 and 20260729100100 is replayed in file order — 38
--     statements, and 20260729100200 issues none, so the set is complete.
--     Output, verbatim, for `authenticated` (anon: ZERO rows):
--
--       cohort_room_configs          REFERENCES, SELECT, TRIGGER
--       cohort_room_members          REFERENCES, SELECT, TRIGGER
--       cohort_announcements         DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_resources             DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_recording_progress    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_demo_entries          DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_room_seen             DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_room_posts            DELETE, REFERENCES, SELECT, TRIGGER, UPDATE
--       cohort_room_post_replies     DELETE, REFERENCES, SELECT, TRIGGER, UPDATE
--
--     TRUNCATE appears on no row; INSERT is absent on the two commons tables.
--     That is the expectation section 8's THIRD CHECK publishes, and it is why
--     that paragraph is now nine measured rows rather than a per-verb argument.
--     WHAT THIS IS NOT: it is not a shadow, and it is not prod. It proves that
--     THESE statements, applied over THAT default-privilege state, produce that
--     end state. It assumes prod's default privileges are the `GRANT ALL` shape
--     shadow-grants.sql captured, and it cannot see a manual grant someone made
--     on the target outside these migrations. THE THIRD CHECK STILL HAS TO RUN
--     ON THE TARGET AFTER THE PUSH — this item narrows what it is checking FOR,
--     it does not replace it.
-- ============================================================================


-- ============================================================================
-- DOWN — reversal (A7). ONE block, drops everything this migration created and
-- nothing it did not. Paste as-is into a psql session on the target project.
--
-- ORDER MATTERS ACROSS THE PHASE: R-2's and R-3's objects depend on the helpers
-- below (R-2 calls them in ~15 RLS policies, R-3 in its RPCs), so revert
-- R-3 → R-2 → R-1. The CASCADEs here are the belt-and-braces for a project
-- where that was not done: dropping a helper CASCADE also drops the dependent
-- policies, which leaves R-2's tables RLS-enabled with no policy — deny-all,
-- never fail-open. Without CASCADE the DROP FUNCTION raises "other objects
-- depend on it" and the reversal stops half-done, with the backbone tables
-- already gone.
-- The three truth tables (enrolments, cohort_batch_members, cohort_applications)
-- are left exactly as they were: only the triggers this file attached are removed.
--
-- DO $$
-- BEGIN
--   IF to_regclass('cron.job') IS NOT NULL THEN
--     PERFORM cron.unschedule(jobid) FROM cron.job
--      WHERE jobname = 'cohort_room_reconcile_nightly';
--   END IF;
-- EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
--             OR crash_shutdown OR cannot_connect_now OR others THEN NULL;
-- END $$;
--
-- DROP TRIGGER IF EXISTS room_resolve_on_batch_member       ON public.cohort_batch_members;
-- DROP TRIGGER IF EXISTS room_resolve_on_enrolment_insert   ON public.enrolments;
-- DROP TRIGGER IF EXISTS room_resolve_on_enrolment_status   ON public.enrolments;
-- DROP TRIGGER IF EXISTS room_resolve_on_application_status ON public.cohort_applications;
--
-- -- Tables before functions: dropping them takes the policies, indexes and the
-- -- triggers that still reference _room_alumni_flip()/set_updated_at().
-- DROP TABLE IF EXISTS public.cohort_room_members CASCADE;
-- DROP TABLE IF EXISTS public.cohort_room_configs CASCADE;
--
-- DROP FUNCTION IF EXISTS public.admin_upsert_room_config(uuid, uuid, text, text, jsonb, jsonb, jsonb);
-- DROP FUNCTION IF EXISTS public.admin_revoke_room_member(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.admin_grant_room_member(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS public.cohort_room_reconcile();
-- DROP FUNCTION IF EXISTS public.cohort_room_resolve_user(uuid);
-- DROP FUNCTION IF EXISTS public._room_balance_outstanding(uuid, uuid);
-- DROP FUNCTION IF EXISTS public._room_alumni_flip();
-- DROP FUNCTION IF EXISTS public._room_resolve_from_application();
-- DROP FUNCTION IF EXISTS public._room_resolve_from_enrolment_insert();
-- DROP FUNCTION IF EXISTS public._room_resolve_from_enrolment();
-- DROP FUNCTION IF EXISTS public._room_resolve_from_batch_member();
--
-- -- CASCADE: any R-2 policy or R-3 RPC still routing through a helper goes with it.
-- DROP FUNCTION IF EXISTS public.cohort_room_phase(uuid, uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_in_lobby(uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_in_lobby(uuid, uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_is_offering_wide(uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_can_post_announcement(uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_can_access(uuid, uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.cohort_room_is_member(uuid) CASCADE;
--
-- -- IF EXISTS, because §7A block 1 degrades to a WARNING rather than aborting a
-- -- shared `db push`: on a project where the ADD was cancelled there is nothing
-- -- to drop, and the reversal must still run to completion.
-- ALTER TABLE public.cohort_batches DROP CONSTRAINT IF EXISTS cohort_batches_id_offering_key;
-- ============================================================================
