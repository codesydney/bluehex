# Handoff — profile and credential model

**State:** design done, tickets cut and published 2026-08-15.
**Next step:** get #44 reviewed and merged, then start #47.
**Branch:** `spike/profile-status` · **PR:** #44 (open, ready for review) · **Date:** 2026-08-15

> **Tickets as published** — the table further down is the pre-cut plan; these are the
> real numbers. #47 Admin role/hook · #48 Push migrations from CI (HITL) · #49
> `practitioners` · #50 `practitioner_credentials` · #51 `practitioner_contacts` · #52
> Withdrawal and erasure · #53 Directory reads from the database · #54 Reconcile
> `docs/scope.md`.
>
> Order **#47 → #48 → (#49 → #50 → #51 → #52)**, #53 gated on #50 and #48.
>
> Changes against the plan below: **#45 is a hard prerequisite for #49** (every schema
> ticket's done-when is a list of assertions); **#48 is its own issue rather than scope on
> #41** (different actors, different done-when); the loose ends were placed rather than
> pooled — ADR-0001 line → #47, deleting `docs/profile-lifecycle.md` → #45, `docs/scope.md`
> → #54. Cross-reference comments are on #9, #41, #45 and PR #44.

---

## Where things stand

Documentation only — no schema, no migration, no code. `main` is untouched.

Read in this order:

| file | what it is |
| --- | --- |
| `CONTEXT.md` | the glossary — Profile, Owner, Claim, Credential, the axes |
| `docs/adr/0001-admins-are-a-postgres-role.md` | why a Postgres role and an auth hook, not a flag or the service key |
| `docs/spec/profile-and-credentials.md` | **binding** — the model, DDL, grants, policies, triggers, RPCs, tests |
| `docs/profile-lifecycle.md` | superseded #35 spike report, kept only for its proof transcript. Its header says do not implement from it |

The design closes #35 and the design half of #9. #14 consumes it.

## Verified — do not re-litigate

- **The access token hook is available on the hosted project.** Confirmed in the dashboard
  2026-08-15. Postgres-function type is offered, so no Edge Function is needed. Schema
  `public`, function `custom_access_token_hook`.
- **The dashboard's function field is a dropdown of functions that exist**, and that name
  is not listed, because no migration has ever been applied to the hosted project. That is
  a real interlock — the "hook enabled before its function exists" outage is not reachable
  by accident from the dashboard. Enable it as part of deploying the first migration.
- **The hook can overwrite the `role` claim**, and `sub` / `aud` survive it, so
  `auth.uid()` still resolves to the person. Proved locally, 46 assertions.
- **Every signed-in user is the same Postgres role (`authenticated`)** under PostgREST.
  This is the fact the whole admin design turns on.

## The tickets

Seven slices. All AFK except ticket 0 — the human decisions were spent in the grill-spec
session.

| # | Ticket | Type | Blocked by | Touched areas |
|---|---|---|---|---|
| 1 | Admin role, `admins` table, access token hook | AFK | — | `supabase/migrations`, `supabase/config.toml` |
| 0 | Apply migrations to the hosted project | **HITL** | 1 | `.github/workflows` |
| 2 | `practitioners` table, policies, guard, admin RPCs | AFK | 1 | `supabase/migrations`, `src/lib/database.types.ts` |
| 3 | `practitioner_credentials`, verification, badge clearing | AFK | 2 | `supabase/migrations`, `src/lib/database.types.ts` |
| 4 | `practitioner_contacts` | AFK | 3 | `supabase/migrations`, `src/lib/database.types.ts` |
| 5 | Withdrawal, account deletion, erasure | AFK | 4 | `supabase/migrations`, `src/lib/database.types.ts` |
| 6 | Directory reads from the database | AFK | 3, 0 | `src/lib`, `src/components`, `src/app` |

Order: **1 → 0 → (2 → 3 → 4 → 5)**, with 6 gated on both 3 and 0.

### What each delivers

1. An admin's access token carries `role: bluehex_admin`; everyone else's says
   `authenticated`. Ships the `config.toml` line **in the same commit** as the function —
   enabling the hook without it takes down every sign-in with a 500.
2. A signed-in practitioner creates and edits their own profile; `anon` sees only approved
   ones; a practitioner `PATCH`ing themselves `{"status":"approved"}` is refused, including
   after the column grant is restored by hand.
3. Credentials with per-credential verification. Editing one clears its own badge; renaming
   the profile clears all of them; `evidence_url` is invisible to `anon` unless opted in.
4. Contact details reachable by owner and admin, by no route reachable by `anon`.
5. Deleting an `auth.users` row leaves the profile present, unowned and withdrawn — rather
   than erroring on a dangling reference.
6. The directory renders from Postgres instead of the typed array, badge derived
   client-side. Still zero profiles, still invitation cards.

### On the edges

- **2 → 3 → 4 → 5 are partly artificial.** 2 → 3 is a genuine FK dependency. **4 and 5 are
  serialized only because every schema slice regenerates `src/lib/database.types.ts`** — a
  shared file, so parallel PRs would collide. Merge 4 into 3 if you would rather.
- **6 can run alongside 4 and 5.** It reads the generated types but never regenerates them,
  so it is file-disjoint from the schema chain.
- **0 sits after 1 on purpose.** A pipeline with no migration to push cannot be tested; it
  should be proved by the first real migration rather than built ahead of it.

### Ticket 0 in detail — it is missing infrastructure, not a nicety

All three workflows (`ci.yml`, `e2e.yml`, `vercel-deploy.yml`) contain **zero** references
to Supabase or migrations. A migration merged to `main` sits in the repo unapplied until
someone runs `supabase db push` by hand.

Why it blocks 6 specifically: tickets 1–5 are local-only, so repo/hosted drift is harmless.
Ticket 6 makes a *deployed page* query the database, and Vercel's preview and production
environments both point at the hosted project. Merge 6 without this and the live site
queries tables that do not exist.

Two things carry lead time:

- **`supabase/setup-cli` is a new third-party action**, and this repo locks Actions to an
  allowlist with SHA pins. It needs an admin allowlist edit before the workflow runs at all.
- **Preview deployments share the production database.** Harmless while 6 is read-only; not
  harmless once self-service writes land in #14. Neither fix is free — Supabase branching is
  paid, the alternative is a second project with its own Vercel environment variables.

Not covered by `db push`: the access token hook is per-project dashboard configuration, not
schema. It stays a manual step tied to ticket 1's deploy.

## Open questions the tickets inherit

The review pass on #44 re-opened two things as explicitly unsettled. Each needs a call
before or inside the ticket that carries it.

- **`user_id` is in `bluehex_admin`'s update grant**, so `assign_profile_owner()` is the
  *documented* path for claiming rather than the only one. Decide whether that is
  acceptable, or withdraw the grant so the RPC is enforced. → ticket 2
- **`contact_email not null` constrains contact rows that exist, not whether one exists.**
  An approved profile with no contact row is representable, and the enquiry button
  dead-ends. Options: a deferrable constraint, creating both rows in one RPC, or a test.
  → ticket 4

## Loose ends — not blocking

- **`docs/scope.md` is unmerged on `docs/scope-and-estimates` and contradicts this PR** in
  four places: `registered` vs `pending`, whether editing kicks a profile back to
  unapproved, "the service role or an admin" setting `verified`, and profiles requiring
  accounts. Merge it or explicitly supersede it — until then a reviewer may read it as
  current. This is the last two-vocabularies problem in the repo.
- **ADR-0001 says the design was "verified against the local stack"** and now understates
  what is known. The hosted availability check above belongs in it as a line.
- **`docs/profile-lifecycle.md` carries its own deletion condition:** delete it when its
  assertions land as committed tests with the first migration. Running tests are better
  evidence than a pasted terminal dump.

## Not in scope

The submission UI and the admin screen are #14, which this unblocks. The proof scripts are
not committed — they assert against a hand-applied schema and should land as real tests
with the migration, not as shell scripts.

---

Also posted as two comments on PR #44, in case this file is not to hand.
