# Bluehex — scope

What is committed, what is proposed, and what each thing costs. The purpose of this
document is to make effort visible at the point a scope decision gets made, so the
trade-off is a choice rather than a surprise.

Anything not written here is an idea, not a commitment. Ideas are welcome — this is
where they get a number attached and become work.

## Reading the estimates

Two different things, deliberately separated:

- **Effort** — engineering days, one day being roughly six focused hours.
- **Elapsed** — how long that takes to arrive in the real world, given this is
  built in spare time rather than as anyone's day job.

The gap between those two columns is the whole reason this document exists. A
one-day change lands next week. A twelve-day change lands next quarter.

**Capacity assumption:** roughly **1.5 engineering days a week** — a weekend
session plus a few weeknight ones. This varies with the rest of life and is the
number to revise first if the elapsed column starts looking wrong.

**Buffer:** larger items carry a multiplier, because uncertainty scales with size
and integration work reliably finds surprises that a half-day task cannot hide.
Items under a day are quoted flat; multi-day items are quoted as a buffered range.
This is applied to make the numbers survive contact with reality, not to argue for
a smaller scope — the same buffer would apply if the larger option were the one
being recommended.

Estimates are honest in both directions. Where something is unknown it says so and
carries a spike instead of a number.

---

## Shipped

| Item | Notes |
| --- | --- |
| Hero and site chrome | Live at bluehex.au, ported from Code.Sydney |
| Directory shell | Search and filters; renders invitation cards while empty |
| CI, Node pin, deploy workflow | Green on `main`; dependency release floor in place |

The directory currently holds zero profiles by design — real people only, no
placeholder entries.

---

## In scope now

Small, uncontested, no decision needed first.

| Item | Effort | Elapsed | Notes |
| --- | --- | --- | --- |
| Country flag on profile cards | 0.25d | days | Add `countryCode` to `Practitioner`; SVG assets, not emoji — Windows has no flag glyphs. Good first ticket, and delegable. |
| Prototype route with sample profiles | 0.5d | days | Not linked from the site, never in production. Doubles as the recruiting artifact — a candidate can see what their profile will look like. |
| Credential proof URL | 0.25d | days | Optional field on `Credential` so a badge can link to the evidence a human checked. The whole of the verification mechanism — see Settled, below. |
| Practitioner intake path | 0.5d | days | A documented route from "person agrees" to "profile published" — mail link, PR template, and the checklist Bluehex verifies against. |

**Subtotal: ~1.5 days effort, about a week elapsed.** No buffer applied — these are
small and well understood.

---

## The plan

### How profiles get in

**Decided: self-service is the destination. Curated intake is phase one.**

These are not alternatives. Curated intake is the first step of the same path —
the directory needs profiles in it during the two to three months self-service
takes to build, or the site sits empty for a quarter while auth gets written.

| Phase | Effort | Elapsed | Scope |
| --- | --- | --- | --- |
| **1 — Curated intake** | 1–1.5d | ~1 week | Profile arrives by mail or pull request, Bluehex checks the credentials, commits it. No database, no accounts, no secrets. |
| **2a — Supabase and the read path** | 2–3d | ~2 weeks | Supabase project, local stack via the Supabase CLI, SQL migrations in version control, generated TypeScript types, env plumbing across CI and Vercel, seed of the curated profiles, directory reading from the database. No auth. |
| **2b — Authentication** | 3–4d | ~2.5 weeks | Supabase Auth: accounts, sessions, sign-up with email verification, password reset, route protection, RLS policies. |
| **2c — Profile writes** | 8–10d | ~6 weeks | Profile CRUD, avatar upload, validation, claiming of curated profiles, approval queue, admin dashboard. Carries a permanent security and maintenance obligation afterwards. |

**Total for phase two: 13–17 days**, down from 14–18. Supabase Auth supplies sign-up,
verification mail, password reset and session handling as product rather than code,
which is most of what made 2b expensive when it was going to be built by hand.

The order is a dependency chain, not a preference. Profile *reads* need no auth and
can come first, which puts the directory on real data early and de-risks everything
after it. Profile *writes* cannot precede auth: every mutation needs an authenticated
actor, profiles carry an account foreign key that does not exist until the user table
does, and access policies are written against the authenticated user. Building writes
first means rewriting every mutation and every policy afterwards.

Almost none of phase one is discarded when phase two lands. The verification
checklist, the profile shape, the `countryCode` and proof-URL fields and the
published profiles themselves all carry over. The throwaway is the mail template,
about half a day.

**The profile model is designed once, before intake starts collecting.** Phase one
does not depend on the phase-two system being built — the `Practitioner` type and
the directory rendering already exist, so a profile can be taken by mail and
committed today. It depends on the *schema* being settled, which is a different
and much cheaper thing.

The reason is asymmetric cost. Migrating twenty-five rows from a typed array into
Postgres is a script. Going back to twenty-five people to ask for a field that was
never collected is a fortnight of chasing humans, and it spends goodwill with
exactly the people the directory is trying to attract. So phase one collects the
full phase-two field set — including the claim email — even where it renders only
part of it.

This makes two items listed under "In scope now" prerequisites rather than
independents: `countryCode` and the credential proof URL both want to exist before
the first profile is taken in.

Phase two is buffered hardest of anything here, deliberately. Authentication is the
classic estimate-breaker: the happy path is quick, and the remaining eighty per cent
— session edge cases, email deliverability, storage permissions, the moderation flow
nobody specs up front — is where the weeks go.

Both phases end in the same place: a human at Bluehex reads the credentials and
decides. Verification is manual either way — that is the product. Self-service does
not remove that work, it changes who types the profile in.

### Open design questions for phase two

Not blocking phase one, but they shape the schema, so they want answering before
the database lands.

**How does a practitioner claim a curated profile?** Email address is the join.
A curated profile carries a pending claim email and no account; when someone signs
up with a matching address, the profile links to their account.

**Decided: no merge path.** Where the address does not match — the person signs up
with a different one, or an OAuth provider hands over a private no-reply — an admin
edits the claim email on the profile through a dashboard, and the account then
matches. Reconciliation is a human action rather than code.

Two things this depends on:

- **Sign-up must verify the address.** The admin sets who may claim the profile;
  proof of control comes from the standard verification mail, which phase two
  includes anyway. Without it, setting the claim email is enough to hand a Verified
  badge to whoever asks for it.
- **Set the claim email before inviting the person to sign up.** If they sign up
  first and create their own profile, there are two records for one person and the
  email swap collides. That is a process rule, not a code path — at this volume it
  is cheaper to sequence the invitation correctly than to build duplicate
  resolution.

Changing a claim email transfers ownership of a verified credential, so it is a
privileged action worth recording who performed it, even if nothing reads the log
for a long while.

**Who owns `verified`?** It must remain server-owned and unwritable by the profile
owner, and material edits to credentials should drop it pending re-check. Without
that, a profile can be verified on modest claims and then edited to carry larger
ones, and the badge stops attesting to anything.

With row level security as the enforcement mechanism, this stops being a principle
and becomes a specific policy: practitioners get write access to their own profile
with `verified` excluded from the writable columns, and only the service role or an
admin can set it. That policy is the most load-bearing line in the schema — it is
what the badge, and therefore the product, actually rests on. It deserves a test
that tries to set `verified` as a signed-in practitioner and asserts the write is
refused.

### Where profile data lives

Phase one runs on the typed array already in the repo, where every change is a
reviewed commit — a real audit trail for a credential claim. Phase 2a moves it to
Supabase Postgres.

**No ORM.** Queries go through the Supabase client rather than Drizzle, so that
authorization has one model instead of two. Supabase enforces access with row level
security, which depends on the request carrying the user's JWT for `auth.uid()` to
resolve in policy. A direct Postgres connection through an ORM bypasses that, leaving
authorization to be re-implemented in application code. Types come from
`supabase gen types typescript` rather than from a schema declared in code.

Two things to settle when 2a starts:

- **`AGENTS.md` is stale on the whole database section.** It names Neon as the
  deployed target, Drizzle for schema and queries, and the `pg` driver — all decided
  before Supabase was chosen. The section needs rewriting rather than patching, and
  it belongs to 2a: every agent working in this repository reads it as the contract.
- **Migrations live in the repository, not the dashboard.** Schema changes made
  through the Supabase UI leave no diff and no history. Use the Supabase CLI so every
  change arrives as a committed SQL migration and is reviewable like anything else.
  This is the single easiest thing to get wrong once the dashboard is open in a tab.

### Meetup banner

| Item | Effort | Elapsed | Notes |
| --- | --- | --- | --- |
| Upcoming events banner | 1–1.5d | ~1 week | Verified 2026-08-14: the group's public iCal feed is live and needs no authentication. Ten upcoming events, weekly Thursdays. Buffered for the parsing details — iCal line folding, `Australia/Sydney` timezone handling against a UTC runtime, and failing soft when the feed is unreachable. |

The Meetup Pro GraphQL API is available but not needed for this. Its cost is not the
query — it introduces the first secret into a project that currently requires no
runtime environment variables, and couples production to a personal subscription.
Worth it only for RSVP counts, past events, member data, or multiple groups.

Fail soft: an undocumented upstream feed must not be able to take the homepage down.

---

## Marketplace scope — bounded

The broader marketplace ambition is bounded to **profiles, an approval process, and
authentication**. That is the whole of it — and it is phase two above, so drawing the
boundary added no work and no time. The item was already in the plan under a
different name.

Explicitly **not** being built, and not to be inferred from the word "marketplace":

- Engagement or hire requests, and messaging between visitors and practitioners
- Matching, ranking or recommendation
- Payments, invoicing, contracts or escrow
- Ratings and reviews
- Availability, rates or booking

Any of these can be proposed later, and would be broken down and sized then. None is
scheduled and none should be assumed. Naming the exclusions is what makes the
boundary hold: an ambition described only by what it contains keeps growing, because
nothing in the description ever says stop.

Positioning stays Claude and Anthropic focused for roughly the next two years.

---

## Settled

Questions closed rather than scheduled. Recorded so they do not come back as open
items later.

**Meetup feed** — resolved 2026-08-14. The group's public iCal feed is live and needs
no authentication, so the banner requires no API, no secret and no Pro subscription.

**Automated credential verification — cut.** Claude credentials are issued through
Skilljar, whose API is tenant-scoped to Anthropic and therefore closed to Bluehex.
Mirroring to Credly was the only remaining route to an automated check and is not
being pursued.

Verification stays **manual, by design**. A practitioner supplies proof, a human at
Bluehex checks it, and `verified` is set by hand. This is not a stopgap awaiting
automation. The badge means Bluehex looked — that is the entire product, and a human
looking is what makes it worth anything. Automating it would remove the only step
that gives it value.

There are no open spikes.

---

## The question that needs answering first

The directory launches with no certified practitioners — two people have started the
courses and none have finished. Before building either intake option:

**What does Verified attest to for the first fifty profiles?**

If it means "holds a Claude Certification," the directory is empty at launch. If it
means "vetted community member, Claude-capable," that is a coherent product but a
different one from the original brief, and the badge copy has to say so.

The badge is the entire value proposition. Everything above is plumbing around it.
