# Running a batch — the admin runbook

For the admin team. Covers the jobs that used to need an engineer:

0. **Start a new batch** — duplicate last batch's offering (and its curriculum).
1. **Grant access to a list of students** (from a CRM export) — the CSV import.
2. **Set up a new cohort batch** and put an orientation PDF in front of it.
3. **Revoke (or restore) one student's access.**
4. **Fix a student's details** — name, email, phone.
5. **Find a student** — the Users page.

The whole "new batch" flow is: **Duplicate → rename → adjust curriculum → Import
CSV → set Active.** No accounts to create first, no engineer.

---

## 0. Start a new batch: duplicate the previous one

**Admin → Offerings → the copy icon on last batch's row** (or open **Courses → ⋮
→ Duplicate** to copy just a course).

- Type the new title (e.g. *The Breakthrough Filmmakers' Program — Batch 24*).
- Leave **Also copy the curriculum** ticked. You get your own copy of the
  course — sections, chapters, PDFs, quizzes, certificate template — so editing
  Batch 24 never changes what Batch 23's students see. Videos and PDFs are
  referenced, not re-uploaded, so it takes a second.
- The copy opens in the editor as a **private draft**: nobody can see or buy it
  until you set **Status = Active**. Batch-specific dates and the WhatsApp group
  link are cleared for you to fill in; price, GST, checkout, thank-you page and
  tracking pixels are carried over.
- **Nothing about students is copied** — no enrolments, applications or
  payments. The new batch starts empty; import its CSV next (section 1).


Nobody needs to "create users" first. The import creates any account that
doesn't exist yet, and attaches to the one that does.

---

## 1. Grant access to a list of students

### Where
**Admin → Offerings → open the product → `Students` tab → `Import CSV`.**

The offering you open IS the access being granted — there is no separate
"select the offering" step, and no way to import into the wrong product by
accident.

### The CSV
Click **Download the template** in the dialog for a file with the right header.

```csv
name,email,phone,country_code
Asha Rao,asha@example.com,9876543210,91
Sam Field,sam@example.com,7911123456,44
```

| Column | Required | Notes |
| --- | --- | --- |
| `name` | no | Fills the profile when it's blank. Never overwrites a name the student set. |
| `email` | one of email/phone | Matched case-insensitively. |
| `phone` | one of email/phone | The **national** number. Leading `0` is dropped. |
| `country_code` | no | `91`, `+91` and `0091` all work. |

**A header row is detected automatically** and column order doesn't matter —
export from the CRM and import it as-is. Extra columns are ignored, so you can
leave the CRM's own junk columns in place. Common header spellings are
understood (`mobile`, `whatsapp`, `number` → phone; `country`, `dial code`,
`cc`, `isd` → country code).

### The country-code column matters
Phone is how students log in (OTP). Put the country code in its own column, or
write the phone in full international form with a leading `+`.

- `7911123456` + `country_code` `44` → **+447911123456** ✅
- `+447911123456` (with any country_code) → **+447911123456** ✅ — a leading `+`
  always wins, so a CRM that stamps `91` on every row can't corrupt it.
- `7911123456` with **no** country code → **+917911123456** ❌ — assumed Indian.

Before you click Grant, the dialog **shows the resolved number for each row**
(`Sam Field · sam@example.com · +447911123456`) and warns about rows whose phone
it can't read. **Check that line for your overseas students.** A wrong country
code doesn't error — it creates an account on a number that isn't theirs, and
the student simply never receives a login OTP.

### What each row does
The importer tries, in order:

1. Match an existing profile **by phone**, then **by email**.
2. Match a half-provisioned account (auth exists, profile empty) and repair it.
3. Create a new account, **pre-verified** — the student just logs in with their
   phone OTP (or email) and everything is already there. No invite to accept, no
   password to set.

Then it grants the enrolment. Re-running the same CSV is **safe**: an existing
active enrolment reports "Already had access" and nothing is duplicated.

### Size
No limit worth worrying about — a large file is sent in batches of 200
automatically. Keep the tab open until it finishes; the button shows
`Granting access… 400/2000`.

### After the run
Every row is listed with its outcome. Click **Download report** for a CSV of
`name,email,phone,country_code,resolved_phone,result,detail` — fix any failed
rows in that file and re-upload just those.

| Result | Meaning |
| --- | --- |
| Access granted | Existing account, new enrolment |
| Account created + access granted | New pre-verified account |
| Account repaired + access granted | Half-finished account completed |
| Already had access | No-op — safe to re-run |
| Access re-activated | Previously inactive enrolment turned back on |
| Failed | See `detail`; usually an unusable phone with no email |

Every grant is written to the admin audit log.

---

## 2. Set up a cohort batch + orientation PDF

A **batch** groups the students of one intake (e.g. *Batch 23*) inside a
product. Access comes from the enrolment (step 1); the batch controls what the
student sees **inside** the cohort room.

### Create the batch
**Admin → Cohorts → pick the offering → `Batches` → `New Batch`.** Name it
(`Batch 23`) and optionally set a max size.

### Put the students in it
Same page, on the batch you just made: **`Add Unassigned Students`** lists
everyone enrolled in the offering who isn't in a batch yet. Tick them and add.
The header above shows how many are waiting. So the order is always:

> **Import the CSV first** (that creates the accounts + access) → **then** put
> those students into the batch.

### Add the orientation PDF
**Admin → Cohorts → pick the offering → the `Resources` tab.**

Fill in Title, `kind = file`, and the **URL**. Scope it:

- **Batch** = `Batch 23` → only that batch sees it.
- **Week** = *Pinned* (leave unset) → it sits at the top of the binder rather
  than inside a week. **This is what "orientation PDF" wants.**

Students see it in the cohort room under **Resources**.

> ⚠️ **The resources form takes a URL, not a file** — it has no uploader yet.
> Host the PDF somewhere with a stable public link first (Drive "anyone with the
> link", or the site's own storage) and paste that link here. Adding an upload
> button is tracked as follow-up work.

> ⚠️ **Keep the PDF small.** Most students open the room on a phone, on mobile
> data. A design-export brochure can easily be 70 MB+; compress to a few MB
> before uploading.

---

## 3. Revoke (or restore) one student's access

**Admin → Offerings → open the product → `Students` tab → `Revoke` on the row.**
Add a reason if you like (it goes in the audit log) and confirm.

- Takes effect on their next page load. Nothing is deleted: their progress and
  the enrolment stay on record, and the same row now shows **`Restore`**.
- Works for any enrolment regardless of how it was granted (bought, imported,
  legacy).
- Bulk changes across products: **Admin → Enrolments** — tick rows and use the
  status dropdown.

## 4. Fix a student's details

**Admin → Users → click the row → edit `Full name`, `Email`, `Phone`, `Bio` → Save.**

- **Phone and email are how they log in.** Changing them here moves the login
  too — the student's next OTP on the new number lands in the same account with
  all their access intact. (Before this, only the profile changed and the old
  number kept working — don't edit phones anywhere else.)
- Write phones with the country code (`+44 7911 123456`). A bare 10-digit
  number is read as Indian.
- If the number or email already belongs to another account you get a clear
  message instead of a silent failure — that's usually a duplicate account that
  should be merged, not overwritten.
- Role changes still ask for confirmation, and you can't change your own.

## 5. Find a student — the Users page

**Admin → Users.** Search by **name, email or phone** — the search now runs
against everyone, not just the 50 rows on screen, and a phone fragment works
with or without `+91`.

- **Type** column: `active` = has a real account; `legacy` = a TagMango buyer
  who hasn't logged in yet (no account to edit — they get one on first login).
- The page used to hang on a slow query over the ~84k legacy purchases; that
  query was fixed on 2026-09-05. If it ever shows "Couldn't load users" again,
  the error text is what an engineer needs.

## Troubleshooting

**"I paid on the website but can't see the course" (guest checkout).** Since
2026-09-09 a guest purchase is attached to the account that owns the PHONE the
buyer typed at checkout; after paying, the site sends them to the login screen
with that number prefilled for one OTP. Ask the student to log in with that
phone number (OTP). Email login only works if a real email has been set on the
account (Users → Edit); new guest accounts carry a placeholder email. If they still
see nothing: Users → search the phone → the purchase must show on that account
and its Enrolments; if it shows on a different account, or on none, check the
order in Payments (status `captured` + a Razorpay payment id) and use Grant
access on the phone account. Purchases made before 2026-09-09 as a guest were
repaired by script (see ops/cohorts, not committed) — anything left over is a
one-off Grant.

**"Student says they can't log in."** Check the phone on their row in the
Students tab. If it starts `+91` but they're overseas, the `country_code` column
was missing on import. Re-import that one row with the right country code — it
creates the correct account; then remove the wrong enrolment if one was made.

**"They bought it but don't have access."** Look at the `How` column on the
Students tab. `Bought in app` = a real payment. If they're missing entirely, the
purchase may be a legacy TagMango one — check the offering's `Access` tab.

**"I imported into the wrong product."** Nothing is deleted by importing. Open
the right product and import there; then deactivate the wrong enrolments from
Admin → Enrolments.

---

## Deployment note

Everything above landed in the repo on 2026-09-05 (CSV `country_code` column,
batching + import report, Duplicate, Revoke/Restore, contact editing, the Users
page fix). It reaches the admin team once deployed:

```bash
export SUPABASE_ACCESS_TOKEN="$SUPABASE_PAT"
npx -y supabase@latest link --project-ref ivkvluezuiojovpotlyb
npx -y supabase@latest db push                          # users_unified + duplicate RPCs
npx -y supabase@latest functions deploy admin-grant-access
npx -y supabase@latest functions deploy admin-update-user
```

…plus the usual web deploy for the frontend half (push to `main`).
