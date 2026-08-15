# Bluehex — scope

What is committed, what is proposed, and what each thing costs. The purpose of this
document is to make effort visible at the point a scope decision gets made, so the
trade-off is a choice rather than a surprise.

Anything not written here is an idea, not a commitment. Ideas are welcome — this is
where they get a number attached and become work.

**This document owns cost, not design.** `docs/spec/profile-and-credentials.md` owns what
a profile contains and how ownership works, `docs/profile-lifecycle.md` owns the lifecycle
and the write path, `CONTEXT.md` owns the vocabulary, and `docs/adr/` owns the decisions.
Where this file and any of those disagree, they win — and the disagreement is a bug in this
file. Sections here point at them rather than restating them, because a document that
restates a spec drifts from it and a document that points at one cannot.

## Reading the estimates

Two different things, deliberately separated:

- **Effort** — engineering days, one day being roughly six focused hours.
- **Elapsed** — how long that takes to arrive in the real world, given this is
  built in spare time rather than as anyone's day job.

The gap between those two columns is the whole reason this document exists. A
one-day change lands this week. A twelve-day change lands next month.

**Capacity assumption:** roughly **4 engineering days a week**. This is the number to
revise first if the elapsed column starts looking wrong, and it is worth understanding
how it is built, because it is not a measure of available time.

It has two factors. The first is **attention** — about a day and a half a week, a weekend
session plus a few weeknight ones, which is the sustainable baseline rather than a busy
fortnight. The second is a **multiplier of roughly 2.5–3x**, because the work is
agent-augmented: a day of attention now clears appreciably more than a day of hand-coding
did. Multiply the two and you get four.

The multiplier is measured, not hoped for. In the first five days this repository took
delivery of the site, CI, the Node pin, the dependency floor, the deploy workflow,
Playwright coverage, the local Supabase stack, the profile and credential spec, ADR-0001
and the first migration — on this document's own pricing, something like ten to fourteen
engineering days. An earlier draft assumed 1.5 days a week and would have called that
seven to nine weeks.

**Attention is the binding constraint, not typing speed.** That is the whole reason the
two factors are kept separate: the multiplier is stable, and the attention figure is the
one that moves with the rest of life. If these numbers start slipping, it is almost
certainly because the first factor changed.

**Buffer:** larger items carry a multiplier, because uncertainty scales with size
and integration work reliably finds surprises that a half-day task cannot hide.
Items under a day are quoted flat; multi-day items are quoted as a buffered range.
This is applied to make the numbers survive contact with reality, not to argue for
a smaller scope — the same buffer would apply if the larger option were the one
being recommended.

Estimates are honest in both directions. Where something is unknown it says so and
carries a spike instead of a number.

**The multiplier is not uniform, which the elapsed column cannot show.** Work labelled
`afk` on the issue tracker — schema, policies, tests, the migrations the spec already
contains the DDL for — compresses hard, because it is close to transcription from a
settled design. Work labelled `hitl` barely compresses at all: #41 and #48 are a hosted
project, dashboard settings and tokens, and #14 needs decisions rather than code. A phase
made mostly of `afk` tickets will beat its estimate; one gated on `hitl` will not.

Two effects push the other way, and they are why the capacity figure is deliberately short
of the observed rate. **Review load rises with generated volume** — and `verified` is the
one thing the product rests on, where `AGENTS.md` warns the natural-looking policy passes
review and still lets any practitioner `PATCH` themselves `{"verified": true}`. That needs
more attention per line, not less. And **thorough design finds work as well as saving it**:
2a went *up* when the spec revealed four tables where one was assumed.

---

## Shipped

| Item | Notes |
| --- | --- |
| Hero and site chrome | Live at bluehex.au, ported from Code.Sydney |
| Directory shell | Search and filters; renders invitation cards while empty |
| Contact page | `/contact`, with a `mailto:` stopgap — a real backend is #2 |
| CI, Node pin | `ci.yml` runs build and lint on every PR; dependency release floor in place |
| End-to-end tests | Playwright against a production build (`pnpm test:e2e`) |
| Local Supabase stack | CLI stack, committed `config.toml`, `.env.example`, generated types |
| First migration | `bluehex_admin`, `public.admins`, and the access token hook — ADR-0001 |

**Two workflows are switched off at the GitHub end**: *Vercel Deploy* and *End-to-end
tests* are both `disabled_manually`. Only *CI* runs on a pull request today, so nothing
ships on a merge to `main` until deploy is turned back on. Check with
`gh workflow list --all` rather than assuming — this is toggled by hand and the file
being present says nothing about whether it runs.

The directory currently holds zero profiles by design — real people only, no
placeholder entries.

---

## In scope now

Small, and none of them blocked on a decision.

| Item | Effort | Elapsed | Notes |
| --- | --- | --- | --- |
| Country flag on profile cards | 0.25d | a day | Add `countryCode` to `Practitioner`. SVG assets, not emoji — Windows has no flag glyphs. Lands as `country_code` in the schema later; the spec keeps it separate from free-text `location` for exactly this reason. Good first ticket, and delegable. |
| Prototype route with sample profiles | 0.5d | a day | Not linked from the site, never in production. Doubles as the recruiting artifact — a candidate can see what their profile will look like. |
| Credential proof URL | 0.25d | a day | Optional field on `Credential` so a badge can link to the evidence a human checked. Becomes `evidence_url` on the credential row; note the spec pairs it with `evidence_public`, so collect the opt-in alongside it. |

**Subtotal: ~1d effort, a couple of days elapsed.** No buffer applied — these are small
and well understood.

Both field additions are **prerequisites rather than independents**: they want to exist
before the first profile is taken in. See *Design the model once*, below.

The intake path itself is not listed here — it is phase one, costed once, in the table
below. It appeared in both places in an earlier draft and was double-counted.

---

## The plan

### How profiles get in

**Decided: self-service is the destination. Curated intake is phase one.**

These are not alternatives. Curated intake is the first step of the same path —
the directory needs profiles in it during the month or so self-service takes to build,
or the site sits empty while auth gets written.

| Phase | Effort | Elapsed | Scope |
| --- | --- | --- | --- |
| **1 — Curated intake** | 1–1.5d | ~2 days | Profile arrives by mail or pull request, Bluehex checks the credentials, commits it. Mail template, PR template, and the checklist Bluehex verifies against. No database, no accounts, no secrets. |
| **2a — Schema and the read path** | 3–4.5d | ~1 week | #49, #50, #45, #41, #48, #53. No auth in the application. |
| **2b — Authentication** | 3–4d | ~1 week | Supabase Auth: accounts, sessions, sign-up with email verification, password reset, route protection. |
| **2c — Profile writes** | 8–10d | ~2–2.5 weeks | #14, #52. Profile CRUD, avatar upload, validation, claiming, approval queue, admin dashboard. Carries a permanent security and maintenance obligation afterwards. |

**Total for phase two: 14–18.5 days**, about **four to five weeks** elapsed.

**2a moved, and it moved in both directions.** The plumbing that made up much of the
original 2–3d estimate has landed — local stack, migrations in version control, generated
types, `.env.example`, and env wiring in both workflows. Against that, the grill-spec
session revealed the schema is materially larger than the estimate assumed: not one table
but four (`practitioners`, `practitioner_contacts`, `practitioner_credentials`,
`practitioner_review_notes`), plus guard triggers, column-level grants, and the admin
RPCs. The second effect is bigger than the first, so 2a goes **up** from 2–3d to 3–4.5d
even though real work has shipped.

That is the document working as intended rather than an embarrassment: the spike found the
cost before the calendar did.

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

Both phases end in the same place: a human at Bluehex reads the credentials and
decides. Verification is manual either way — that is the product. Self-service does
not remove that work, it changes who types the profile in.

### Design the model once, before intake starts collecting

Phase one does not depend on the phase-two system being built — the `Practitioner` type
and the directory rendering already exist, so a profile can be taken by mail and committed
today. It depends on the *schema* being settled, which is a different and much cheaper
thing, and which **is now done**: `docs/spec/profile-and-credentials.md`.

The reason it mattered is asymmetric cost. Migrating twenty-five rows from a typed array
into Postgres is a script. Going back to twenty-five people to ask for a field that was
never collected is a fortnight of chasing humans, and it spends goodwill with exactly the
people the directory is trying to attract. So phase one collects the full phase-two field
set even where it renders only part of it.

**Read the field list off the spec's DDL, not off this document.** One correction worth
naming because an earlier draft of this file got it wrong: there is no `claim_email` field
to collect. The spec rejected a separate claim address — two email columns identical in
almost every row is the same duplicated-fact objection that removed `certified` — and uses
`practitioner_contacts.contact_email`, the address the practitioner actually replied from.
Collect that.

### Profile lifecycle, ownership, and where the data lives

**Owned by the spec.** `docs/spec/profile-and-credentials.md` for what a profile contains,
how ownership works, and the DDL; `docs/profile-lifecycle.md` for the lifecycle, the roles
and the write path; `CONTEXT.md` for the vocabulary; ADR-0001 for how admin privilege is
held. All four are settled and proved against the local stack.

Four things this document previously described and got wrong, recorded here only so nobody
reintroduces them from an old copy:

- **`status` is `pending`, `approved`, `rejected`, `withdrawn`** — four values, not three.
  There is no `registered`. `withdrawn` is the practitioner's own lever, not Bluehex's.
- **`verified` lives on the credential row, not the profile.** The badge is *derived* —
  at least one earned credential, and every earned credential verified. `certified` is
  derived too and is not stored at all.
- **Editing an approved profile does not send it back for re-approval.** Edit in place,
  no kick-back; the badge clears instead when attested content changes.
- **A profile cannot change owners.** `null → A` claims, `A → null` unassigns and forces
  `withdrawn`, `A → B` raises `23514` — admins included.

The one line worth keeping in a *cost* document is the one that carries a cost:
**`verified` is what the product rests on**, and it is protected by column privileges
rather than by RLS alone — a policy has no `OLD` to compare against, so "this row is yours
but this column must not change" is not sayable as a policy. Getting that wrong is not a
bug that degrades the product, it is the end of it. #45 owns the tests that prove it.

**No ORM**, and migrations live in the repository rather than the dashboard. Both are
settled and both are already recorded in `AGENTS.md`, which is current — it was rewritten
to Supabase in #28 and this document's claim that it was stale is no longer true.

### Still open

- **Whether Bluehex recovers any visibility of enquiries** — a blind copy would put it back in the path it was deliberately removed from. Not blocking anything.

### Meetup banner

| Item | Effort | Elapsed | Notes |
| --- | --- | --- | --- |
| Upcoming events banner | 1–1.5d | ~2 days | #59 (read the iCal feed into a typed `Event`) and #60 (show the next event on the home page), which own the work. Verified 2026-08-14: the group's public iCal feed is live and needs no authentication. Ten upcoming events, weekly Thursdays. Buffered for the parsing details — iCal line folding, `Australia/Sydney` timezone handling against a UTC runtime, and failing soft when the feed is unreachable. |

The Meetup Pro GraphQL API is available but not needed for this. Its cost is not the
query — it would introduce **the first secret** into the project, and couple production to
a personal subscription. Worth it only for RSVP counts, past events, member data, or
multiple groups.

Note the premise precisely, because it changed: the project *does* now require runtime
environment variables — `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. What it still has is **no secret**. The publishable
key is meant to reach the browser and is protected by row level security rather than by
secrecy; a Meetup Pro token would be the first credential that has to be kept.

Fail soft: an undocumented upstream feed must not be able to take the homepage down.

---

## Marketplace scope — bounded

The broader marketplace ambition is bounded to **profiles, an approval process,
authentication, and enquiry by email**. That is the whole of it.

**Decided 2026-08-16 — enquiries produce email, delivered to the practitioner.** A visitor enquires through the app and the enquiry becomes an email, via the existing `/contact` page reached from a card button that prefills which practitioner it concerns. The mail is addressed to the practitioner with the visitor's address in `Reply-To`; the address itself is never published, and the exchange leaves the product at the first reply.

This supersedes the 2026-08-15 decision that Bluehex stays in the path. It costs this document a line it used to be able to write — Bluehex no longer sees who is hiring — and it moves work into #2, which can no longer be satisfied by a form service pointed at a fixed address. See `docs/spec/profile-and-credentials.md`, which owns the mechanism and its costs.

**Decided 2026-08-16 — a profile may publish links, but never an address or a phone number.** `website_url`, `github_url`, `linkedin_url` and `booking_url` are public, practitioner-writable columns; `practitioner_contacts` keeps every protection it had. The test is a route to a *page* versus a route to a *person*; `docs/adr/0002-links-are-published-addresses-are-not.md` owns the argument.

**This reprices #2 downwards rather than up.** With links on the profile, the enquiry form stops being the only way to reach a practitioner and becomes the fallback for visitors the practitioner has given no other route to. The server-side send, the first secret and the abuse handling are all still needed, but they are no longer the single point the directory's usefulness rests on — which makes #2 sequenceable after the link fields rather than before them.

**The test, so a reviewer can apply it without re-deriving the argument: an enquiry form
that produces an email is not a marketplace. It becomes one the moment a practitioner
reads and answers enquiries in the app.**

Explicitly **not** being built, and not to be inferred from the word "marketplace":

- Practitioner↔visitor messaging in the app — inboxes, threads, notifications, read
  state, replying in-app
- Matching, ranking or recommendation
- Payments, invoicing, contracts or escrow
- Ratings and reviews
- Availability, rates, or booking and scheduling *in the app* — a `booking_url` pointing
  at a practitioner's own scheduling page is a link, not a booking system, and was
  admitted on 2026-08-16; Bluehex holds no calendar, no slots and no reservations

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

**The profile and credential model** — settled by the #35 spike and the #9 grill-spec
session, and recorded in `docs/profile-lifecycle.md` and
`docs/spec/profile-and-credentials.md`. **How admins hold privilege** — ADR-0001.

**One spike has run and it is closed.** #35 proved the lifecycle, the roles and the write
path against the local stack; everything it established is in `docs/profile-lifecycle.md`.
No spike is currently open.

---

## The question that needs answering first

The directory launches with no certified practitioners — two people have started the
courses and none have finished.

**What does Verified attest to for the first fifty profiles?**

If it means "holds a Claude Certification," the directory is empty at launch. If it
means "vetted community member, Claude-capable," that is a coherent product but a
different one from the original brief, and the badge copy has to say so.

**This gates what the badge says, not whether profiles can be collected.** Curated intake
can start immediately and should — nothing in phase one waits on this. What waits is the
copy, and any public claim about what the badge means.

The spec sharpens the question rather than dissolving it. Verification is now per
credential, and the profile badge is derived from *evidence-backed* credentials — at least
one earned, all earned ones verified. So a practitioner working towards a certification
has credentials that can never roll up to a badge, because in-progress credentials sit
outside the rollup entirely. The mechanism is decided; what it is allowed to mean is not.

The badge is the entire value proposition. Everything above is plumbing around it.
