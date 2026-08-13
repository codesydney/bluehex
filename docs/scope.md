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
| **1 — Curated intake** | 1–1.5d | ~1 week | Profile arrives by mail or pull request, Bluehex checks the credentials, commits it. No accounts, no secrets, no moderation queue. |
| **2 — Self-service** | 14–18d | ~2–3 months | Accounts, auth, sessions, profile CRUD, avatar upload, validation, approval queue, email verification, password reset, access policies, claiming of curated profiles, and an admin dashboard. Carries a permanent security and maintenance obligation afterwards. |

Almost none of phase one is discarded when phase two lands. The verification
checklist, the profile shape, the `countryCode` and proof-URL fields and the
published profiles themselves all carry over. The throwaway is the mail template,
about half a day.

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

### Where profile data lives

| Option | Effort | Elapsed | Notes |
| --- | --- | --- | --- |
| Typed array in the repo | shipped | — | Current state. Every change is a reviewed commit — a real audit trail for a credential claim. |
| Postgres table, no auth | 1.5–2d | ~1.5 weeks | Satisfies "the community needs a member database somewhere durable" without any of Option B above. Schema, client, migration, seed script, read path. First database in the project, so some of this is one-off setup cost. |

Settled by the decision above: self-service needs a database, so Postgres arrives
with phase two at the latest. Bringing it forward is optional — the typed array is
sufficient for phase one, and a reviewed commit per profile is a genuine audit trail
for a credential claim. A database does not require accounts, so this can land early
if the durable member record is wanted before phase two.

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

## Direction — not scheduled, not estimated

Agreed as where this is heading, with no date and no number attached. These are
excluded from planning until something above is finished and one of them is chosen
deliberately.

- **Broader talent marketplace.** Beyond a directory: engagement requests, matching,
  and hiring flow, eventually for work outside the Claude and Anthropic ecosystem.
  Current agreement is Claude-focused for roughly the next two years.

Estimating a two-year direction produces arguments about invented numbers. When one
of these is picked up it gets broken down and sized then.

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
