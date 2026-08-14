<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Bluehex

Guidance for AI coding agents working in this repository.

`CLAUDE.md` is a one-line file containing `@AGENTS.md`, which Claude Code resolves
as an import of this file — so Claude Code and any agent that reads `AGENTS.md` get
identical instructions. Edit this file, never `CLAUDE.md`.

> The block above is managed by `next dev` — it rewrites it in place between the
> `nextjs-agent-rules` markers. Leave the markers intact and commit any regenerated
> change with your work to keep the tree clean. It may also relocate the block to the
> end of the file; move it back to the top and commit that.

## Project

Bluehex is the Claude consulting arm of Code.Sydney Pty Ltd. The site is a one-pager:
a hero, then a directory of Claude practitioners that visitors search and filter to
find someone to hire.

The directory is the product. Anyone in the community can publish a profile listing
their Claude credentials; Bluehex alone marks a profile **Verified**, meaning it has
checked those credentials. That badge is the whole value proposition — treat anything
touching it as load-bearing. Marketing copy beyond the hero is deliberately absent.

## Commands

This project uses **pnpm** (see `packageManager` in `package.json`). Don't use `npm`
or `yarn` — they would create a competing lockfile.

- `pnpm install` — install dependencies
- `pnpm dev` — start the dev server (Turbopack) at http://localhost:3000
- `pnpm build` — production build (also runs the TypeScript type-check)
- `pnpm start` — serve the production build
- `pnpm lint` — ESLint (flat config, `eslint-config-next`)

There is no test runner configured yet. Note that `next build` no longer runs ESLint,
so `pnpm lint` is the only thing enforcing the lint rules — run it explicitly.

## Skills

`.claude/skills/` holds skills checked into the repo, so every contributor gets them
without any local setup. Ask for one by name, e.g. `/code-tour`.

- **`code-tour`** — a guided walk through one real flow, end to end, where the learner
  does the work and answers are withheld rather than handed over. Reach for it after
  code has landed faster than it was understood, which on this project is most weeks.
- **`pr-review`** — reviews a PR and posts the findings as inline comments anchored to
  the lines they concern. Uses Codex for the review pass when it is installed and falls
  back to Claude Code otherwise.
- **`pr-review-resolve`** — the other half: works through the open threads, fixes what
  holds, replies to every one, and resolves only what was actually addressed.

Reviews belong on the pull request, not in a chat session. A finding nobody can find
later did not happen.

## Working here, if you are new

Two things will waste your time otherwise:

- **Most answers you find online will be for older versions.** Next.js 16, React 19 and
  Tailwind v4 are all recent enough that search results, tutorials and model training
  data are frequently wrong for this codebase — confidently wrong, which is worse. The
  local docs in `node_modules/next/dist/docs/` are the source of truth. Being confused by
  a stale answer is the environment, not you.
- **This project uses pnpm.** Every tutorial you read will say `npm`. Using it creates a
  competing lockfile and a confusing diff.

Ask early. A question costs a minute; a day spent stuck on a stale Stack Overflow answer
costs a day.

## Toolchain pins

Two dev dependencies are deliberately held behind `latest`. Don't bump them as a
drive-by; both take `pnpm lint` down with a hard error:

- **`typescript` is pinned to `^6.0.3`, not 7.** `typescript-eslint` 8.67.0 throws
  `typescript-eslint does not support TS 7.0` on load. Tracked upstream at
  [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
- **`eslint` is pinned to `^9`, not 10.** `eslint-plugin-react` 7.37.5 (the latest
  release) calls the removed `context.getFilename()` and crashes under ESLint 10.

Both unblock once `eslint-config-next` updates its bundled plugins. When retrying,
bump them together and confirm `pnpm lint` exits 0 before committing.

### Dependency releases are held for 7 days

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (minutes), so pnpm will not resolve
a version published less than 7 days ago. If `pnpm add` or `pnpm update` gives you an
older version than you expected — pnpm prints `(x.y.z is available)` when it does — that
is the setting working, not a stale cache. Pinning an exact version younger than the floor
does not fall back, it fails: `ERR_PNPM_NO_MATCHING_VERSION`, which reads like the version
does not exist until you get to the publish date further down the error. pnpm 11 makes
that fallback configurable via `minimumReleaseAgeStrict`; pnpm 10 has no such option.

On pnpm 10 the floor fires only where a new version would *enter* the lockfile, so CI's
`--frozen-lockfile` install is unaffected. That is a property of the version rather than
of the flag — pnpm 11 re-applies the floor to every entry in the loaded lockfile unless
`trustLockfile` is set, so revisit this when the major changes. To take a fix sooner, add
the package to `minimumReleaseAgeExclude` rather than removing the floor.

**`pnpm dlx` does not read this file.** This is the one that will catch you. `pnpm add`
refuses a version published four hours ago; `pnpm dlx` on the same package, same version,
same directory runs it without a word. `dlx` resolves in a throwaway project of its own,
and `pnpm-workspace.yaml` does not travel there. So reaching for `dlx` to bring a tool
under the policy looks like it works and does not.

The setting does apply if you hand it over on the command line —
`pnpm --config.minimumReleaseAge=10080 dlx <pkg>@<version>` is refused exactly as
`pnpm add` would refuse it. Useful for a one-off, but it is a step nobody is obliged to
take, so it is not a substitute for the version being in `pnpm-lock.yaml`. The lockfile is
what makes the floor automatic rather than opt-in.

If you go to check any of this yourself, test with a package that has a binary. `dlx` on a
package with none fails with `ERR_PNPM_DLX_NO_BIN`, which arrives *after* resolution and
masks whether the floor fired; and a second `dlx` run reuses the first one's cache, so it
prints no resolution line at all. Both together will convince you the floor was ignored
when it was not.

That is why the **Vercel CLI is a devDependency** rather than a `npm install --global` in
the deploy workflow, and why the workflow calls it as `pnpm exec vercel`. With
`vercel deploy --prebuilt` the CLI compiles the artifacts that ship — Vercel does not
rebuild them — so a CLI release changes production output with no diff in this repo. It is
a build-time dependency, not a tool, and it publishes several times a week. Being in the
lockfile puts it under the floor and turns every bump into a reviewable diff. The cost,
accepted knowingly: it is roughly 250 MB and 280 packages that every contributor installs
whether or not they ever deploy.

### Node 24

`.nvmrc` holds the version and every workflow reads it via `node-version-file`, so the
major is never copied into a workflow. `engines.node` in `package.json` states the same
major because that is the one Vercel honours — it overrides the version chosen in Project
Settings. Those two files are the only places the number appears; change both together.

`.nvmrc` pins an exact version (`24.19.0`), not a bare major. A bare `24` works for nvm
and `setup-node`, but asdf reads legacy version files literally and would look for a
version called "24", failing with `Run 'asdf install nodejs 24'` even when a 24.x release
is installed. Resolving a partial version under asdf needs
`ASDF_NODEJS_LEGACY_FILE_DYNAMIC_STRATEGY=latest_installed` exported in every shell; an
exact version needs nothing. `engines.node` stays a major range because Vercel selects a
major, not a patch.

Node 24 because Vercel builds and runs 24.x, 22.x and 20.x only, 24 is its default, and
[20 is disabled in Project Settings from 1 October 2026](https://vercel.com/changelog/node-js-20-is-being-deprecated).
This matters more than it looks: the deploy workflow builds with `vercel deploy --prebuilt`,
so the artifacts are compiled on the runner and shipped as-is. A build/runtime mismatch
produces a green deploy, not a red build.

Nothing enforces the version locally — `pnpm install` only warns on the wrong major, since
`engine-strict` is off. Reading `.nvmrc` takes one of:

- **nvm**: `nvm use` reads it natively.
- **asdf** (what this project's author uses): add `legacy_version_file = yes` to
  `~/.asdfrc`, which lets the `nodejs` plugin read `.nvmrc` and `.node-version`. It is a
  per-machine setting, so each contributor sets it once, and it applies to every asdf
  plugin — not just Node.
- **Windows**: [nvm-windows deliberately does not read `.nvmrc`](https://github.com/coreybutler/nvm-windows/issues/556)
  and asdf has no native Windows support. Use WSL and follow the Linux setup, or pass
  the file's contents by hand from an Administrator PowerShell — installing does not
  switch, so both commands are needed:
  `nvm install (Get-Content .nvmrc); nvm use (Get-Content .nvmrc)`.

## Commit conventions

**Do not add trailers to commit messages.** No `Co-Authored-By`, no
`Generated with`, no tool attribution of any kind. Automated code review runs
against this repository, and a trailer advertising which tool wrote the change
can bias the review. Commit messages should describe the change and nothing else.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 (via `@tailwindcss/postcss`; no `tailwind.config` file — configured in CSS)
- TypeScript 6, path alias `@/*` → `src/*`
- No database, no test runner, no runtime environment variables

## Architecture

- `src/app/` — App Router routes, layout, and global styles. Pages are React Server
  Components by default.
- `src/app/page.tsx` — the home page: hero, then the practitioner directory.
- `src/components/` — shared chrome and UI primitives. `practitioner-directory.tsx` is
  the one client component, because search and filters are local state.
- `src/lib/` — data and configuration, no rendering. `site.ts` is the single source of
  truth for naming, nav, contact details and legal links; `practitioners.ts` holds the
  directory data and its types.

`practitioners.ts` ships an empty array on purpose. **Real people only** — no placeholder
profiles. The directory renders an invitation card for the empty slots instead.

`certified` and `verified` are two separate booleans and must stay that way. `certified`
is the practitioner's own claim to hold a Claude Certification; `verified` means Bluehex
checked the credentials. Either can be true without the other, and the badge reflects
`verified` only.

Keep the tree this thin until something needs otherwise.

## Database — planned, not built

The repo has **no database**: no client, no ORM, no `DATABASE_URL`, no `src/lib/db.ts`.
An earlier SQLite (`better-sqlite3`) setup was removed, and a Drizzle/Postgres one was
scaffolded and then stripped back out to keep the skeleton thin. The notes below are the
agreed plan for when it is reintroduced — treat them as the contract, not a description
of current state.

- **Target is [Supabase](https://supabase.com)** — Postgres, plus the auth that comes
  with it. Local development runs the Supabase CLI stack; deployed is a hosted Supabase
  project. This supersedes an earlier Neon plan, and the reason is auth: the product
  needs end-user accounts, and buying that rather than building it is the entire
  justification. Neon was cheaper and otherwise preferred, so if the auth requirement
  ever disappears the decision should be revisited rather than inherited.
- **No ORM — query through the Supabase client.** Authorization is row level security, and the Supabase client carries the user's JWT on every request so `auth.uid()` resolves in policy. Note what the constraint actually is: Postgres enforces RLS against the *connected role*, and has no idea whether the SQL arrived via an ORM. What bites is a pooled server-side connection carrying no per-user identity — policies then either do not apply at all (the `postgres` role in a Supabase connection string bypasses RLS) or apply to the wrong identity, unless every request installs the caller's claims for itself. That is silent when it goes wrong, and it forces a second authorization model in application code. Direct SQL is still the right tool where RLS was never the control, such as a migration or a background job. Types come from `supabase gen types typescript`, not from a schema declared in TypeScript.
- **Migrations live in the repository.** Create them with the Supabase CLI and commit
  them. Schema changes made through the dashboard leave no diff and no history, and this
  is the easiest thing in this section to get wrong once the dashboard is open in a tab.
- **The Supabase CLI is a devDependency, invoked as `pnpm exec supabase`** — not a global install, and for the same reason as the Vercel CLI above. In the lockfile it comes under the 7-day release floor and every bump is a reviewable diff; installed globally it is whatever each machine happens to have, which for a tool that writes migrations is a difference that reaches the schema. Note that `pnpm dlx supabase` escapes the floor entirely, because `dlx` resolves in a throwaway project that never reads `pnpm-workspace.yaml`.
- **Adding it needs `supabase` in `onlyBuiltDependencies`**, or it installs broken in a way that does not look broken. The npm package is a wrapper whose postinstall downloads the platform binary, and pnpm 10 blocks dependency lifecycle scripts by default. Without the allowlist entry `pnpm install` reports success, the binary is never fetched, and the failure arrives later at `pnpm exec supabase` — far from the cause. This is the case the comment above `ignoredBuiltDependencies` in `pnpm-workspace.yaml` was written for: the entries listed there resolve binaries through optional platform packages and are safe to leave blocked, whereas this one genuinely needs its script to run.
- **`supabase init` output is committed** — `supabase/config.toml` and everything under `supabase/migrations/`. The config file pins the local stack's versions and ports, so it is what makes one contributor's local Postgres the same as another's.
- **Local development needs a Docker-compatible runtime**, which is the one prerequisite that is not `pnpm install`. The per-platform setup is in the [README](./README.md#running-it-locally) rather than here, because it is a machine setup task a human does once, not a constraint on the code.
- **Make the client lazy** — a `getClient()` function, not a top-level `export const db`. The module gets imported during `next build`, so reading environment variables eagerly breaks builds wherever a required variable is absent (CI, preview deployments).
- **Cache the client at module scope**, not only on `globalThis`. A `globalThis`-only
  cache is typically skipped in production and leaks a new client per call.
- **Queries are async**, unlike the synchronous `better-sqlite3` setup, so a Server Component that reads from the database must be `async`. Most of them will not also need `await connection()`. Per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`, `connection()` exists for a component that produces per-request output *without* touching a request-time API — its worked example is a synchronous `better-sqlite3` query, which is precisely the setup being replaced here. A Supabase server client reads cookies to resolve the session, and `cookies()` is a request-time API, so the render is already request-bound and `connection()` adds nothing. Reach for it only on a read that touches neither cookies nor headers, such as an anonymous public query — plausibly the directory listing itself. `export const dynamic` is on its way out in Next 16, so `connection()` is still the tool when one is needed.
- **Two keys, and the difference decides where code may run.** The anon/publishable key is shipped to the browser by design and is not a secret: `NEXT_PUBLIC_*` is where it belongs, and there is no reason to proxy reads through a server action to hide it. The service role key bypasses RLS outright — every policy on the table is decorative for any code holding it — so it is server-only: never `NEXT_PUBLIC_*`, never imported by a client component or by a module a client component can reach, and reserved for the admin write path rather than used as an escape hatch when a policy is inconvenient. Both belong in `.env.local` (git-ignored). Add a committed `.env.example` template at the same time — `.gitignore` already has the `!.env.example` exception, since the blanket `.env*` rule would otherwise swallow it.
- **`verified` must never be writable by the practitioner.** Self-service puts an untrusted writer next to Bluehex's own attestation for the first time. The policy: a practitioner may write their own row, with `verified` not among the columns they can set, and only an admin or the service role sets it. **RLS alone cannot express that**, so the policy needs a mechanism named or it does not exist. A policy's `USING` clause sees the existing row and `WITH CHECK` sees the proposed one, but a policy has no `OLD` to compare against — "this row is yours to update, but this column must not change" is not sayable. The natural `for update using (auth.uid() = user_id)` reads exactly like the paragraph above, passes review, and lets any practitioner `PATCH` themselves `{"verified": true}`. Use both of these, since neither is sufficient alone:
  - **Column privileges** — what Supabase calls column level security. `revoke update on practitioners from authenticated`, then `grant update (…) on practitioners to authenticated` naming each practitioner-writable column. PostgREST honours these, so the write is refused at the privilege layer whatever the policies say. The grant list is maintained by hand as the schema grows: a column added later is not writable until it is named, which fails closed and is the right way round.
  - **A `before update` trigger** forcing `new.verified = old.verified` for non-admin callers. Triggers do see `OLD`, so this is the only place the invariant can be stated directly, and it still holds if a later migration re-grants the column by accident.

  This is the most load-bearing line in the schema — getting it wrong silently destroys the only thing the directory sells, and it fails open rather than loudly.

A third column is planned alongside the `certified` and `verified` booleans described under Architecture: `status` (`registered`, `approved`, `rejected`). The three are independent axes rather than a sequence — `status` governs whether a profile is publicly visible, `verified` governs whether the badge shows. Kept separate deliberately, so a badge can be withdrawn without unpublishing the profile.

## Deployment

Target is Vercel, deployed from the `main` branch of `codesydney/bluehex`. Pushes to
`main` ship to production; pull requests get preview deployments. The build requires no
environment variables.
