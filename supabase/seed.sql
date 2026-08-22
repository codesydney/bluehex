-- Seed data for a stack somebody boots. Runs automatically after every migration has
-- been applied — at the end of `pnpm db:reset` locally, and on the `supabase start` in
-- `.github/workflows/schema.yml`, which is what lets the schema suite assert against
-- these rows in CI. Never run against the hosted project.
--
-- It carries two things, and they are not the same kind of thing.
--
-- The first is `credential_catalogue`: the 24 real Claude credentials, which
-- `20260820201450_catalogues.sql` deliberately creates empty. Where that list is
-- permanently housed is still open — an admin surface, an API call, eventually a
-- migration — and this file is the provisional home precisely because it never runs
-- against the hosted project. Nothing loaded here can become a wrong credential name
-- in production, and nothing loaded here is permanent the way a migration is.
--
-- The second is a population of invented practitioners, added by #110 so that
-- `pnpm db:reset` leaves a directory with something in it. Those are fixtures rather
-- than reference data, they have no permanent home and are not meant to acquire one,
-- and the line that makes them acceptable is the same one: this file never runs
-- against the hosted project.
--
-- `supabase/seed/credential-catalogue.json` is the canonical record and the
-- statements below are one loader for it, kept honest by the drift test in
-- `tests/db/credential-catalogue-seed.test.ts`. Edit the JSON and this file
-- together; see `supabase/seed/README.md`.
--
-- Two things to hold to, as this file grows:
--
--   * Make it re-runnable, and know what that buys. Both paths above hand this file a
--     database the migrations have just created, so `on conflict do nothing` is not
--     what makes `db:reset` or `supabase start` work — it is what makes a hand-run
--     harmless. And harmless is all it is: the loader is additive, never convergent.
--     A re-run inserts what is missing and skips what conflicts, so it cannot carry an
--     *edit* across. An edited row reaches an already-seeded stack through
--     `pnpm db:reset` and by no other route; a correction to a live catalogue is an
--     admin `UPDATE`, per `docs/spec/profile-and-credentials.md`.
--   * Seed data is fake data, and this is the one place that is fine. It runs on a
--     developer's machine and on a CI runner, and never against the hosted project —
--     that last clause is the line, not the machine. The "real people only" rule in
--     AGENTS.md is about the directory the public sees, not about local fixtures. Do
--     not confuse the two by seeding the hosted project.
--
-- The credentials below are the exception that proves the second rule rather than a
-- breach of it: they are real reference data, not a fixture, and they are here
-- instead of in migration history only because their permanent home is undecided.

-- ---------------------------------------------------------------------------
-- credential_catalogue
-- ---------------------------------------------------------------------------

-- The twenty Anthropic Academy courses published at https://anthropic.skilljar.com/
-- and the four Claude Certification exams published at
-- https://www.pearsonvue.com/us/en/anthropic.html, transcribed as those pages name
-- them and confirmed by Bluehex.
--
-- Four transcription decisions, so nobody re-derives them:
--
--   * `sort_order` restarts at 0 per platform, matching how a grouped picker renders
--     them. `unique (kind, platform, label)` does not constrain it, so the duplicate values
--     across the two platforms are expected.
--   * The Pearson exam codes stay inside `label`. There is no code column and no
--     slug — the code is Pearson's own public name for the exam rather than an
--     identifier we invented.
--   * `AI Fluency for pK-12 Educators` is excluded. It is a path containing two
--     courses rather than a course, `CONTEXT.md` defines an entry here as a named
--     Anthropic Academy course or a named Claude Certification, and the two titles
--     it contains are not published on the page.
--   * Three `course_url` slugs deliberately do not match their titles —
--     `Building with the Claude API` is published at `claude-with-the-anthropic-api`,
--     `Claude with Amazon Bedrock` at `claude-in-amazon-bedrock`, and
--     `Claude on Google Cloud` at `claude-with-google-vertex`. Those are Anthropic's
--     URLs; do not "fix" them to match the label.
--
-- The four certifications carry `platform = 'Pearson VUE'` and a `course_url` on
-- `anthropic-partners.skilljar.com`. That disagreement is the two axes working rather
-- than a data error: the exam is delivered by Pearson VUE, and the page describing it
-- lives on a partner Skilljar tenant, which is a different tenant from the Academy.
-- It is the clearest argument that platform and page are distinct facts.
--
-- `active` takes its default for all 24: retirement is a flag flip, never a delete.
--
-- The `on conflict (kind, platform, label) do nothing` below is additive, per the header: it
-- makes a hand re-run exit clean, not converge. Edit any of these rows and pick the
-- change up with `pnpm db:reset` — a re-run skips the conflicting row and keeps the old
-- value, and an edited *label* no longer matches the conflict target at all, so it
-- inserts beside the stale one. `do update` would not close that second hole either.
insert into public.credential_catalogue (kind, platform, label, course_url, sort_order) values
  ('course', 'Anthropic Academy', 'Claude 101',
   'https://anthropic.skilljar.com/claude-101', 0),
  ('course', 'Anthropic Academy', 'Claude Code 101',
   'https://anthropic.skilljar.com/claude-code-101', 1),
  ('course', 'Anthropic Academy', 'Claude Platform 101',
   'https://anthropic.skilljar.com/claude-platform-101', 2),
  ('course', 'Anthropic Academy', 'Introduction to Claude Cowork',
   'https://anthropic.skilljar.com/introduction-to-claude-cowork', 3),
  ('course', 'Anthropic Academy', 'Claude Code in Action',
   'https://anthropic.skilljar.com/claude-code-in-action', 4),
  ('course', 'Anthropic Academy', 'AI Fluency: Framework & Foundations',
   'https://anthropic.skilljar.com/ai-fluency-framework-foundations', 5),
  ('course', 'Anthropic Academy', 'Building with the Claude API',
   'https://anthropic.skilljar.com/claude-with-the-anthropic-api', 6),
  ('course', 'Anthropic Academy', 'Introduction to Model Context Protocol',
   'https://anthropic.skilljar.com/introduction-to-model-context-protocol', 7),
  ('course', 'Anthropic Academy', 'AI Fluency for educators',
   'https://anthropic.skilljar.com/ai-fluency-for-educators', 8),
  ('course', 'Anthropic Academy', 'AI Fluency for students',
   'https://anthropic.skilljar.com/ai-fluency-for-students', 9),
  ('course', 'Anthropic Academy', 'Model Context Protocol: Advanced Topics',
   'https://anthropic.skilljar.com/model-context-protocol-advanced-topics', 10),
  ('course', 'Anthropic Academy', 'Claude with Amazon Bedrock',
   'https://anthropic.skilljar.com/claude-in-amazon-bedrock', 11),
  ('course', 'Anthropic Academy', 'Claude on Google Cloud',
   'https://anthropic.skilljar.com/claude-with-google-vertex', 12),
  ('course', 'Anthropic Academy', 'Teaching AI Fluency',
   'https://anthropic.skilljar.com/teaching-ai-fluency', 13),
  ('course', 'Anthropic Academy', 'AI Fluency for nonprofits',
   'https://anthropic.skilljar.com/ai-fluency-for-nonprofits', 14),
  ('course', 'Anthropic Academy', 'Introduction to agent skills',
   'https://anthropic.skilljar.com/introduction-to-agent-skills', 15),
  ('course', 'Anthropic Academy', 'Introduction to subagents',
   'https://anthropic.skilljar.com/introduction-to-subagents', 16),
  ('course', 'Anthropic Academy', 'AI Capabilities and Limitations',
   'https://anthropic.skilljar.com/ai-capabilities-and-limitations', 17),
  ('course', 'Anthropic Academy', 'AI Fluency for Small Businesses',
   'https://anthropic.skilljar.com/ai-fluency-for-small-businesses', 18),
  ('course', 'Anthropic Academy', 'AI Fluency for Builders',
   'https://anthropic.skilljar.com/ai-fluency-for-builders', 19),
  ('certification', 'Pearson VUE', 'Claude Certified Associate - Foundations (CCAO-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-associate-foundations-certification', 0),
  ('certification', 'Pearson VUE', 'Claude Certified Architect - Foundations (CCAR-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification', 1),
  ('certification', 'Pearson VUE', 'Claude Certified Architect - Professional (CCAR-P)',
   'https://anthropic-partners.skilljar.com/claude-certified-architect-professional-certification', 2),
  ('certification', 'Pearson VUE', 'Claude Certified Developer - Foundations (CCDV-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-developer-foundations-certification', 3)
on conflict (kind, platform, label) do nothing;

-- ---------------------------------------------------------------------------
-- practitioners, and what they hold — the invented population (#110)
-- ---------------------------------------------------------------------------

-- Eight invented people, so that `pnpm db:reset` leaves a directory worth looking
-- at rather than an empty one. **Nobody below is real**, which is exactly why they
-- are here and nowhere else: `src/lib/practitioners.ts` ships an empty array on
-- purpose, and AGENTS.md's "real people only" governs the directory the public
-- sees. This file is not that directory and never reaches it.
--
-- Names, emails and links are all `example.invalid` shaped or obviously fictional,
-- so a row that somehow escaped this file could be recognised as a fixture on
-- sight. Some of the prose is lifted from `src/app/prototype/directory/fixtures.ts`,
-- which #53 deletes — the ticket sanctions that, and the first three profiles are
-- the drawing's launch population brought across.
--
-- **The set is chosen to cover branches, not to look like a market.** Every
-- `status` value appears; the profile-level badge is derived as "at least one
-- credential, and every credential verified", so there is a profile that earns it,
-- one held back by a single unverified row, one holding credentials with none
-- verified, and one holding nothing at all. `evidence_public` appears both ways,
-- because `evidence_url_public` is the generated column that makes it enforceable
-- and a fixture where it is always false never renders the other branch. Adding a
-- ninth person for variety's sake would not add a branch; the eight are what the
-- directory can actually distinguish.
--
-- **Two of the eight are claimed and six are not.** A profile can only be owned by
-- a row in `auth.users`, and this file used to create none, for a reason it stated
-- plainly: the sign-in flow did not exist, and a seeded account would be a
-- credential pair committed to the repository. Both premises are gone. Sign-in
-- shipped in #83 and #112, and a seeded account is not a credential pair, because
-- the product is magic link only — there is no password, so there is nothing secret
-- to commit. See the accounts block below.
--
-- Mara is claimed and approved, which is the owner looking at a finished profile;
-- Ines is claimed and `pending`, which is the owner looking at one still in review.
-- The six that stay null are the point rather than an omission: unclaimed is what
-- curated intake produces, and it is what the *Assign owner* panel on `/admin`
-- exists to resolve. Claiming all eight would delete that surface.
--
-- **Ids are literal.** `gen_random_uuid()` would make a fixture unlinkable: the
-- point of a seeded profile is that a NOTES file, a bookmarked URL or a test can
-- name one. The four families are keyed by table so a stray uuid in a log says
-- which one it came from — `1…` contacts, `2…` profiles, `3…` credentials,
-- `4…` services. Within a child family the hundreds digit names the profile and the
-- last two number the row inside it, so `33333333-…-0101` and `33333333-…-0102` are
-- both Mara's, whose profile is `22222222-…-0001`.
--
-- **And handles are literal for the same reason** (#119). `practitioners.handle` has
-- a `default public.new_profile_handle()`, so leaving it out would work — and would
-- give a different URL on every reset, which is precisely what makes a fixture
-- unlinkable. `seed0001` … `seed0008` track the last digit of the profile's uuid, so
-- `/p/seed0001` is Mara and nothing has to be looked up to know it. They are
-- deliberately not derived from the names: eight Crockford base32 characters cannot
-- contain `i`, `l`, `o` or `u`, and the only one of these eight people whose name
-- survives that is Mara — which is the alphabet doing its job rather than a problem
-- to work around.
--
-- This is the fixture that proves #119 locally. Before it, all eight shared the
-- handle `222222` — the first six characters of the uuid, which for these rows are
-- all prefix — so every *View profile* link on a freshly reset directory landed on
-- Mara Ellison. Eight distinct handles is what makes each link reach the right
-- person, and a reset is how you see it.
--
-- **Catalogue rows are referenced by their natural key, never by id**, because
-- `credential_catalogue` and `service_catalogue` both take `gen_random_uuid()`
-- defaults and there is no literal to write. A label that no longer exists resolves
-- to null and the insert fails loudly on `not null` (credentials) or on
-- `num_nonnulls` (services), which is the right way for a fixture to break: at
-- `pnpm db:reset`, naming the row, rather than silently seeding a thinner directory.
--
-- `on conflict do nothing` throughout, per the header — untargeted, so it covers
-- the primary key and the unique constraints alike. It makes a hand re-run exit
-- clean; it does not converge, and an edit below reaches a seeded stack through
-- `pnpm db:reset` and by no other route.

-- The accounts. Three rows, so that `pnpm db:reset` leaves a stack somebody can
-- sign in to as an admin without hand-inserting a uuid first — that ritual was in
-- every handoff, which is the tell that it belonged here.
--
-- Sign in at `/sign-in` with one of these addresses and collect the link from
-- Mailpit at <http://127.0.0.1:54324>. There is no password to type, and none to
-- commit.
--
-- **`auth.identities` is not optional, and neither are the empty strings.** Both
-- fail the same way, which is why they are called out rather than left to be
-- rediscovered: GoTrue answers `/auth/v1/otp` with a bare
-- `500 Database error finding user` and names nothing. A row in `auth.users` with no
-- matching identity is the first cause; a null in any of the eight token columns
-- below is the second, because GoTrue scans them into a Go `string` and null is not
-- one. If this block ever stops working, do not read the error — create a user with
-- `POST /auth/v1/admin/users` against a local stack and diff the two rows.
--
-- `auth.users.confirmed_at` and `auth.identities.email` are generated columns and
-- are absent on purpose; writing either is an error rather than a choice.
--
-- Ids continue the families with `5…`, and an identity tracks its user in the
-- second group so the pair reads at a glance. The addresses are the same ones on
-- the `practitioner_contacts` rows below, which is what a real claim produces:
-- the claim path matches a claimer's verified address against the contact on the
-- profile, per `docs/spec/profile-and-credentials.md`.
insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('55555555-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@bluehex.example.invalid', '2026-06-01 00:00:00+00',
   '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}',
   '2026-06-01 00:00:00+00', '2026-06-01 00:00:00+00',
   '', '', '', '', '', '', '', ''),
  ('55555555-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mara.ellison@example.invalid', '2026-06-20 00:00:00+00',
   '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}',
   '2026-06-20 00:00:00+00', '2026-06-20 00:00:00+00',
   '', '', '', '', '', '', '', ''),
  ('55555555-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ines.okonkwo@example.invalid', '2026-07-24 00:00:00+00',
   '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}',
   '2026-07-24 00:00:00+00', '2026-07-24 00:00:00+00',
   '', '', '', '', '', '', '', '')
on conflict do nothing;

insert into auth.identities
  (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
values
  ('55555555-1000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001',
   'email', '55555555-0000-4000-8000-000000000001',
   '{"sub": "55555555-0000-4000-8000-000000000001",
     "email": "admin@bluehex.example.invalid", "email_verified": true, "phone_verified": false}',
   '2026-06-01 00:00:00+00', '2026-06-01 00:00:00+00', '2026-06-01 00:00:00+00'),
  ('55555555-1000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000002',
   'email', '55555555-0000-4000-8000-000000000002',
   '{"sub": "55555555-0000-4000-8000-000000000002",
     "email": "mara.ellison@example.invalid", "email_verified": true, "phone_verified": false}',
   '2026-06-20 00:00:00+00', '2026-06-20 00:00:00+00', '2026-06-20 00:00:00+00'),
  ('55555555-1000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000003',
   'email', '55555555-0000-4000-8000-000000000003',
   '{"sub": "55555555-0000-4000-8000-000000000003",
     "email": "ines.okonkwo@example.invalid", "email_verified": true, "phone_verified": false}',
   '2026-07-24 00:00:00+00', '2026-07-24 00:00:00+00', '2026-07-24 00:00:00+00')
on conflict do nothing;

-- The admin list. This is the whole of what makes the first account an admin: the
-- access token hook reads this table and stamps `bluehex_admin` onto the role claim,
-- and every admin privilege in the schema belongs to that Postgres role. See
-- `docs/adr/0001-admins-are-a-postgres-role.md`. Nothing in the application grants
-- it, and a row added here takes effect on the account's next token refresh.
insert into public.admins (user_id) values
  ('55555555-0000-4000-8000-000000000001')
on conflict do nothing;

-- practitioner_contacts is the parent: `practitioners.contact_id` is `not null`,
-- so every contact row is written before the profile that points at it. `created_by`
-- is left null — there is no account to attribute authorship to, and null fails
-- closed, since `created_by = auth.uid()` is then null rather than true for every
-- caller. Contact details are never published: see
-- `docs/adr/0002-links-are-published-addresses-are-not.md`.
insert into public.practitioner_contacts (id, contact_email, contact_phone, contact_note) values
  ('11111111-0000-4000-8000-000000000001', 'mara.ellison@example.invalid', '+61 400 000 001', 'Prefers email.'),
  ('11111111-0000-4000-8000-000000000002', 'toby.nakamura@example.invalid', null, null),
  ('11111111-0000-4000-8000-000000000003', 'devon.achebe@example.invalid', null, null),
  ('11111111-0000-4000-8000-000000000004', 'priya.raghavan@example.invalid', '+61 400 000 004', 'Weekdays only.'),
  ('11111111-0000-4000-8000-000000000005', 'hollis.fenn@example.invalid', null, null),
  ('11111111-0000-4000-8000-000000000006', 'ines.okonkwo@example.invalid', null, 'Applied through the meetup.'),
  ('11111111-0000-4000-8000-000000000007', 'rafael.duarte@example.invalid', null, null),
  ('11111111-0000-4000-8000-000000000008', 'sabine.aleryd@example.invalid', null, null)
on conflict do nothing;

-- The profiles. `approved_at` is written by hand for the approved rows because
-- `practitioners_guard` is a `before update` trigger and no update happens here —
-- an insert straight to `approved` would otherwise leave the stamp null, and
-- `approved_at` is what a review queue sorts on. `approved_by` names the seeded
-- admin now that there is an account to name; it is null wherever `approved_at` is,
-- because the two are one act and a profile that was never approved was never
-- approved by anybody.
--
-- Fixed timestamps rather than `now() - interval …`, so two resets a week apart
-- produce the same rows.
insert into public.practitioners
  (id, handle, contact_id, user_id, name, headline, location, country_code, bio, focus,
   availability, website_url, github_url, linkedin_url, booking_url, status, approved_at,
   approved_by)
values
  -- 01 — the badge, in full. Two credentials, both verified, so the derived
  -- profile-level rollup is true. Three services, which is the cap: worth having
  -- somebody at it, because a filter axis everybody maxes out is the failure the
  -- cap exists to prevent and it should be visible on the roster.
  ('22222222-0000-4000-8000-000000000001', 'seed0001', '11111111-0000-4000-8000-000000000001',
   '55555555-0000-4000-8000-000000000002', 'Mara Ellison', 'Staff engineer, agent platforms', 'Sydney', 'AU',
   'Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible.',
   '{Agents,Evals,MCP}', 'Evenings and weekends, and about one day a fortnight.',
   'https://example.invalid/mara', 'https://github.example.invalid/mara-ellison', null, null,
   'approved', '2026-07-02 04:15:00+00', '55555555-0000-4000-8000-000000000001'),

  -- 02 — one unverified credential is enough to withhold the badge. This is the
  -- profile that proves the rollup is "every credential verified" rather than
  -- "any credential verified", and the two read identically on a profile holding one.
  ('22222222-0000-4000-8000-000000000002', 'seed0002', '11111111-0000-4000-8000-000000000002', null,
   'Toby Nakamura', 'Independent consultant', 'Wellington', 'NZ',
   'Retrieval pipelines and the unglamorous data work underneath them.',
   '{RAG,Data}', 'Booked until March.',
   null, null, 'https://www.linkedin.example.invalid/in/toby-nakamura', 'https://example.invalid/book/toby',
   'approved', '2026-07-09 22:40:00+00', '55555555-0000-4000-8000-000000000001'),

  -- 03 — nothing at all: no credentials, no services, no links, no availability.
  -- Approved and findable, carrying no badge and never falsely able to. What he is
  -- working through is in his bio, in his own words, which is what the model offers
  -- instead of an in-progress row — `earned_at` is `not null` and there is no such
  -- thing as a credential you have not earned. A roster that made this look like a
  -- broken profile would be wrong about the population the directory launches with.
  ('22222222-0000-4000-8000-000000000003', 'seed0003', '11111111-0000-4000-8000-000000000003', null,
   'Devon Achebe', 'Backend developer, moving into AI work', 'Melbourne', 'AU',
   'Writing Go for payments by day, working through the Academy track on weekends. Two courses down, aiming at the Certification next year.',
   '{Agents,MCP}', null,
   null, null, null, null,
   'approved', '2026-07-11 01:05:00+00', '55555555-0000-4000-8000-000000000001'),

  -- 04 — the only holder of a Claude Certification, and the only profile where
  -- `certified` is true. It is derived rather than stored — "holds a credential
  -- whose catalogue entry is a certification" — so a population where every
  -- credential is an Academy course can never tell the derivation from a constant.
  ('22222222-0000-4000-8000-000000000004', 'seed0004', '11111111-0000-4000-8000-000000000004', null,
   'Priya Raghavan', 'Solutions architect', 'Singapore', 'SG',
   'Ten years of integration work. Most of what I do now is helping teams decide what not to hand to a model.',
   '{Architecture,Evals}', 'Two days a week, from September.',
   'https://example.invalid/priya', null, null, 'https://example.invalid/book/priya',
   'approved', '2026-07-15 09:30:00+00', '55555555-0000-4000-8000-000000000001'),

  -- 05 — three credentials, none verified. Credentials are the practitioner's own
  -- claim; the badge is Bluehex's check of them, and this profile is what the
  -- difference looks like on screen.
  ('22222222-0000-4000-8000-000000000005', 'seed0005', '11111111-0000-4000-8000-000000000005', null,
   'Hollis Fenn', 'Freelance developer', 'Brisbane', 'AU',
   'Small teams, short engagements, mostly getting a first agent into production without it becoming somebody''s second job.',
   '{Agents,Tooling}', 'Available now.',
   'https://example.invalid/hollis', 'https://github.example.invalid/hollis-fenn', null, null,
   'approved', '2026-07-20 11:00:00+00', '55555555-0000-4000-8000-000000000001'),

  -- 06 — in the queue. `pending` is invisible to `anon`, and so are its credentials
  -- and services: the child follows its parent through `profile_is_approved()`. It
  -- holds both so that the hiding is a real assertion rather than a vacuous one.
  ('22222222-0000-4000-8000-000000000006', 'seed0006', '11111111-0000-4000-8000-000000000006',
   '55555555-0000-4000-8000-000000000003', 'Ines Okonkwo', 'Data engineer', 'Perth', 'AU',
   'Pipelines, warehouses, and lately the question of what a model should be allowed to read.',
   '{Data,RAG}', 'Weeknights.',
   null, 'https://github.example.invalid/ines-okonkwo', null, null,
   'pending', null, null),

  -- 07 — rejected, and carrying the review note that says why. The note is a row
  -- rather than a column because a column cannot be scoped to the person it is
  -- about; it is inserted below, after the profile it references exists.
  ('22222222-0000-4000-8000-000000000007', 'seed0007', '11111111-0000-4000-8000-000000000007', null,
   'Rafael Duarte', 'Prompt consultant', 'Auckland', 'NZ',
   'I write prompts.',
   '{Prompting}', null,
   null, null, null, null,
   'rejected', null, null),

  -- 08 — withdrawn while holding a verified credential. `status` and `verified` are
  -- independent axes rather than a sequence, and this is the pairing that says so:
  -- the check still stands, the profile is simply not in the directory.
  ('22222222-0000-4000-8000-000000000008', 'seed0008', '11111111-0000-4000-8000-000000000008', null,
   'Sabine Aleryd', 'Platform engineer', 'Stockholm', 'SE',
   'Took a staff job and stopped taking outside work. Leaving the profile up in case that changes.',
   '{Agents}', null,
   null, null, null, null,
   'withdrawn', null, null)
on conflict do nothing;

-- One current note per rejected profile, not a history. `written_by` names the
-- seeded admin — a note is somebody's judgement and the column exists to say whose.
insert into public.practitioner_review_notes (practitioner_id, note, written_at, written_by) values
  ('22222222-0000-4000-8000-000000000007',
   'The headline and bio do not say what you would actually do for somebody. Tell us about one engagement and we will look again.',
   '2026-07-18 23:05:00+00', '55555555-0000-4000-8000-000000000001')
on conflict do nothing;

-- Held credentials. `catalogue_id` is resolved from the natural key rather than
-- written as a literal, and a label that no longer exists resolves to null and is
-- refused by `not null` — loudly, at reset, naming this file.
--
-- `verified_at` is left to `credentials_guard`, which stamps it on insert whenever
-- `verified` is true. `verified_by` is written here and names the seeded admin. The
-- guard takes it as given for a privileged caller — `coalesce(new.verified_by,
-- auth.uid())` — and `auth.uid()` is null in a seed, so leaving it out is what would
-- produce the state the product never produces: a check standing with nobody's name
-- against it. An admin going through `set_credential_verified()` always leaves one.
--
-- The seed runs as `postgres`, which `credentials_guard` counts as privileged, so
-- `verified` is honoured on the way in. A practitioner writing the same row gets it
-- forced to false — that is the load-bearing rule of the whole schema and the
-- reason it is a trigger and not just a grant.
insert into public.practitioner_credentials
  (id, practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public, verified,
   verified_by)
values
  -- Mara: both verified, and one of each `evidence_public`. The public one is the
  -- only route by which `evidence_url_public` is ever non-null for `anon`.
  ('33333333-0000-4000-8000-000000000101', '22222222-0000-4000-8000-000000000001',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy'
       and label = 'Building with the Claude API'),
   '2026-01-22', 'https://example.invalid/certificates/mara-ellison-api', true, true, '55555555-0000-4000-8000-000000000001'),
  ('33333333-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy'
       and label = 'Introduction to Model Context Protocol'),
   '2026-03-04', 'https://example.invalid/certificates/mara-ellison-mcp', false, true, '55555555-0000-4000-8000-000000000001'),

  -- Toby: one checked, one not. The second is what withholds his badge.
  ('33333333-0000-4000-8000-000000000201', '22222222-0000-4000-8000-000000000002',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy' and label = 'Claude 101'),
   '2025-11-30', null, false, true, '55555555-0000-4000-8000-000000000001'),
  ('33333333-0000-4000-8000-000000000202', '22222222-0000-4000-8000-000000000002',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy' and label = 'Claude Code 101'),
   '2026-05-02', 'https://example.invalid/certificates/toby-nakamura-cc101', true, false, null),

  -- Priya: the certification, verified.
  ('33333333-0000-4000-8000-000000000401', '22222222-0000-4000-8000-000000000004',
   (select id from public.credential_catalogue
     where kind = 'certification' and platform = 'Pearson VUE'
       and label = 'Claude Certified Developer - Foundations (CCDV-F)'),
   '2026-06-11', 'https://example.invalid/certificates/priya-raghavan-ccdv-f', true, true, '55555555-0000-4000-8000-000000000001'),

  -- Hollis: three claims, none checked.
  ('33333333-0000-4000-8000-000000000501', '22222222-0000-4000-8000-000000000005',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy' and label = 'Claude 101'),
   '2026-02-14', null, false, false, null),
  ('33333333-0000-4000-8000-000000000502', '22222222-0000-4000-8000-000000000005',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy' and label = 'Claude Code 101'),
   '2026-02-27', null, false, false, null),
  ('33333333-0000-4000-8000-000000000503', '22222222-0000-4000-8000-000000000005',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy'
       and label = 'Introduction to agent skills'),
   '2026-04-19', null, false, false, null),

  -- Ines: on a `pending` profile, so `anon` sees neither the profile nor this.
  ('33333333-0000-4000-8000-000000000601', '22222222-0000-4000-8000-000000000006',
   (select id from public.credential_catalogue
     where kind = 'course' and platform = 'Anthropic Academy'
       and label = 'AI Fluency: Framework & Foundations'),
   '2026-06-30', null, false, false, null),

  -- Sabine: verified, on a withdrawn profile.
  ('33333333-0000-4000-8000-000000000801', '22222222-0000-4000-8000-000000000008',
   (select id from public.credential_catalogue
     where kind = 'certification' and platform = 'Pearson VUE'
       and label = 'Claude Certified Associate - Foundations (CCAO-F)'),
   '2026-04-02', null, false, true, '55555555-0000-4000-8000-000000000001')
on conflict do nothing;

-- What each of them offers. Both kinds appear, because they render differently: a
-- catalogue row drives the roster's filter chips and a custom label is free text
-- that never becomes one. `practitioner_services_one_kind` refuses a row naming
-- both or neither, which is also what turns a stale catalogue label below into an
-- immediate failure rather than a quietly missing service.
--
-- Mara is at the cap of three. Devon and Sabine have none, which is legal and
-- normal — not everybody is selling something.
insert into public.practitioner_services (id, practitioner_id, catalogue_id, label) values
  ('44444444-0000-4000-8000-000000000101', '22222222-0000-4000-8000-000000000001',
   (select id from public.service_catalogue where label = 'Architecture and advisory'), null),
  ('44444444-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001',
   (select id from public.service_catalogue where label = 'Evaluation and testing'), null),
  ('44444444-0000-4000-8000-000000000103', '22222222-0000-4000-8000-000000000001',
   (select id from public.service_catalogue where label = 'Team training'), null),

  ('44444444-0000-4000-8000-000000000201', '22222222-0000-4000-8000-000000000002',
   (select id from public.service_catalogue where label = 'Implementation'), null),
  -- the custom label: offered, rendered, and deliberately not a filter chip
  ('44444444-0000-4000-8000-000000000202', '22222222-0000-4000-8000-000000000002',
   null, 'Retrieval pipeline rescue'),

  ('44444444-0000-4000-8000-000000000401', '22222222-0000-4000-8000-000000000004',
   (select id from public.service_catalogue where label = 'Team training'), null),

  ('44444444-0000-4000-8000-000000000501', '22222222-0000-4000-8000-000000000005',
   (select id from public.service_catalogue where label = 'Code review'), null),
  ('44444444-0000-4000-8000-000000000502', '22222222-0000-4000-8000-000000000005',
   (select id from public.service_catalogue where label = 'One-to-one tutoring'), null),

  ('44444444-0000-4000-8000-000000000601', '22222222-0000-4000-8000-000000000006',
   (select id from public.service_catalogue where label = 'Implementation'), null),

  ('44444444-0000-4000-8000-000000000701', '22222222-0000-4000-8000-000000000007',
   null, 'Prompt library spring-clean')
on conflict do nothing;
