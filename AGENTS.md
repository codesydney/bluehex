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
- `pnpm test` — Vitest, once (what CI runs)
- `pnpm test:watch` — Vitest, watching
- `pnpm test:db` — Vitest against the local Supabase stack (needs `pnpm db:start`); local-only, CI never runs it
- `pnpm test:e2e` — build, serve and test the production app on port 3100 in desktop and mobile Chromium
- `pnpm db:start` / `pnpm db:stop` — the local Supabase stack (needs Docker running)
- `pnpm db:reset` — drop the local database and re-apply every migration from scratch
- `pnpm db:types` — regenerate `src/lib/database.types.ts` from the local schema

`pnpm dev` does not start the database — run `pnpm db:start` alongside it. `db:reset`
and `db:types` both need it running too.

Two runners and three places a test can live. **Vitest** owns two of them, as two projects in `vitest.config.mts` run by different commands, because scanning the whole repository picks up Playwright's `e2e/*.spec.ts` — the two runners share a file extension and nothing else — along with whatever a `.spec.ts` in a git-ignored working directory happens to be.

- **`src/`** — unit tests over application code. `pnpm test` runs this project alone, and it is what CI runs.
- **`tests/db/`** — the schema's invariants, asserted against the local Supabase stack through PostgREST and through Postgres directly. `pnpm test:db` runs this project alone, and **CI never runs it**: there is no Docker on the runner. `pnpm db:start` first, or every test fails on the connection.
- **`e2e/`** — **Playwright**, which is not a Vitest project at all.

Putting a Vitest file anywhere else means it is silently never run.

**Database tests are not application code**, which is why `tests/db` is a project of its own rather than a directory under `src/`: they need a running stack, longer timeouts than a unit test has any use for, and serial execution, because they mutate global state — grants, roles, rows in `auth.users` — that no two files may hold at once. Keeping them out of `pnpm test` is also what stops a stopped Docker daemon from failing the suite CI gates on.

Vitest resolves the `@/*` alias through `resolve.alias`, restated by hand — Vite does not read `paths` out of `tsconfig.json`, and a `projects` array does not inherit the root `resolve` block either, so it is restated in **both** projects. Nothing but the tests themselves checks that the three still agree.

The `tests/db` harness is `tests/db/harness/`: the four callers (`anon`, two practitioners, an admin), a `sql()` seam that runs as `postgres`, and the helpers for reading a refusal. Use `expectPermissionDenied(caller, result)` rather than asserting a status code by hand — PostgREST answers **401 for `anon` and 403 for a signed-in caller on the same `permission denied`**, so the status reports who asked rather than what was decided, and a hand-written `expect(status).toBe(403)` is really an assertion that the caller held a token. Rules a status code cannot express — the ownership state machine raising `23514`, a foreign key, a unique constraint — are asserted with `expectSqlstate`. And set up through `sql()`, assert through a caller: re-reading a row as `postgres` proves nothing about a policy, because `postgres` bypasses every one of them.

Note that `next build` no longer runs ESLint, so `pnpm lint` is the only thing enforcing the lint rules — run it explicitly alongside `pnpm test`, `pnpm test:db` and `pnpm test:e2e`.

## Skills

Skills are checked into the repo, so every contributor gets them without any local setup. Ask for one by name, e.g. `/code-tour`. They live in `.agents/skills/` and are linked from `.claude/skills/` — see below, and note that the two lists that follow are a distinction of provenance, not of location.

Written here:

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

Vendored from [supabase/agent-skills](https://github.com/supabase/agent-skills):

- **`supabase`** — the whole product surface: client libraries and `@supabase/ssr`,
  auth and sessions, RLS, migrations, Edge Functions, and the debugging workflows for
  when something returns a status code nobody expected.
- **`supabase-postgres-best-practices`** — Postgres rather than Supabase specifically.
  Worth loading before schema work, not after: column types, indexes, RLS policies and
  the tests that prove them, and the migration patterns that avoid taking a lock on a
  table in production.

Both are relevant to what is being built here — the `verified` column rule under
Database is exactly the class of problem the second one covers.

### How skills are stored

Not as ordinary directories. The real files live in `.agents/skills/<name>/`, and `.claude/skills/<name>` is a **symlink** into it. That layout lets one copy serve any agent tool that looks in its own directory, rather than duplicating 200 KB per tool. Git stores the symlinks natively; on Windows they need `core.symlinks` enabled, which is another reason the Node section points Windows contributors at WSL.

This holds for every skill, ours as much as the vendored ones: `.claude/skills/` contains nothing but links, and a new skill is created in `.agents/skills/<name>/` and symlinked from there. Writing one as a real directory under `.claude/skills/` works, which is the problem — it works for Claude Code and is invisible to every other tool, so the breakage shows up as a skill someone else does not have rather than as an error.

`skills-lock.json` records where each vendored skill came from and pins it by **content hash**, not by version. Do not trust the `version` field inside a `SKILL.md` — upstream leaves it behind (`supabase` reads `0.1.2` in frontmatter against a changelog whose latest entry is `0.1.7`). The hash is the real pin.

**The lockfile is also what tells you which skills are ours.** A skill named in `skills-lock.json` is vendored: edits belong upstream, because a local change is silently reverted by the next update and there is no diff to explain it. A skill absent from it — `code-tour`, `pr-review`, `pr-review-resolve` — is ours to edit in place. Do not read anything into the directory alone; `.agents/` now holds both.

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

## Invariants beat scope

Scope is hard to set upfront, because the constraints that matter usually only become
visible once the work has started. Invariants are not: they say what is unacceptable
rather than what to build, so they can be stated before anyone knows the shape of the
answer. **Plans go stale the moment you learn something; invariants survive learning.**

- **Nothing throwaway gets committed.** If it exists only to prove something during
  development, it does not belong in the repository — least of all in migration history,
  which is permanent and is read as the story of how the schema got here.
- **No schema lands before the model it encodes is settled.**
- **An invariant has to be violable.** If nobody could break it, and you could not point
  at the breach in a diff, it is a preference. Four real ones beat ten where six are
  decoration, because the six teach everyone to skim.

**When a premise is removed, revisit the requirement that rested on it rather than
building machinery to keep satisfying it.** This is the one that actually bites, because
each step looks reasonable and only the pile is wrong. The tell is work that defends an
earlier decision instead of delivering value — a third state added to a check, then a
fourth, then a workaround for the type system. That accumulation is visible in a diff
without understanding the domain, and it is the signal to stop and ask.

Recorded because it happened here: a `connection_check` table was added to give a
walking skeleton something to read, and when it was cut for not belonging in migration
history, the page that read it grew a four-state probe rather than being cut too. Both
went in the end. See #32.

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

## Pull requests

**Open every pull request as a draft.** `gh pr create --draft`, or the dropdown beside the
button in the web UI. Marking it ready for review is a separate, deliberate act, and it
belongs to the author — an agent opening a pull request stops at draft and does not mark it
ready unless asked.

This is not a formality, because the draft flag is load-bearing here: CI skips draft pull
requests, so it decides whether a build runs at all. A draft says the branch is pushed and
nothing is being asked for yet. Ready for review says two things at once — I want eyes on
this, and I want a build.

**From a fork, marking it ready creates the run but does not start it.** GitHub holds
workflow runs on pull requests from forks until a maintainer approves them, so the check
sits at `Awaiting approval` rather than building. Nothing is wrong and there is nothing for
you to press — ask, and someone with write access clicks it.

The cost is that a draft gets no CI feedback, which is the point but is still surprising
the first time. If you want a run before you are ready for review, mark it ready and put it
back to draft afterwards (`gh pr ready --undo`); there is no way to ask for a build while
it stays a draft. It is not a free toggle, though — marking a pull request ready notifies
everyone watching the repository and puts it in their review queue, so it spends someone
else's attention to get yourself a build.

## Prose formatting

**Do not hard-wrap prose.** One paragraph is one line — in Markdown, in PR and issue bodies, and in the body of a commit message. Editors and renderers soft-wrap already, so a hard wrap buys nothing and costs a reflow: insert a word near the top of a wrapped paragraph and every line beneath it shifts, turning a one-word edit into a twenty-line diff. The reviewer then reads the reflow instead of the change, which is the opposite of what a small diff is for.

The **commit title** is the exception and stays a single short line, around 72 characters. `git log --oneline`, `git shortlog` and GitHub all truncate it, so there the length is a real constraint rather than a formatting preference.

Files written before this rule are still hard-wrapped. Reflow a paragraph when you are already editing it; do not reflow whole files on their own, because a pure-reflow commit is unreviewable and buries the history of every line it touches.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 (via `@tailwindcss/postcss`; no `tailwind.config` file — configured in CSS)
- TypeScript 6, path alias `@/*` → `src/*`
- Supabase (Postgres) through `@supabase/supabase-js`, local stack via the Supabase CLI
- Vitest for unit tests (`src/`), Playwright for end-to-end (`e2e/`)

## Architecture

- `src/app/` — App Router routes, layout, and global styles. Pages are React Server
  Components by default.
- `src/app/page.tsx` — the home page: hero, then the practitioner directory.
- `src/components/` — shared chrome and UI primitives. `practitioner-directory.tsx` is
  the one client component, because search and filters are local state.
- `src/lib/` — data and configuration, no rendering. `site.ts` is the single source of
  truth for naming, nav, contact details and legal links; `practitioners.ts` holds the
  directory data and its types; `supabase.ts` is the database client.
  `database.types.ts` is **generated** — regenerate it with `pnpm db:types` after a
  migration rather than editing it.
- `supabase/` — `config.toml` for the local stack and `migrations/` for the schema.
  Both are committed.

`practitioners.ts` ships an empty array on purpose. **Real people only** — no placeholder
profiles. The directory renders an invitation card for the empty slots instead.

`certified` and `verified` are two separate ideas and must stay that way. `certified` is
the practitioner's own claim to hold a Claude Certification; `verified` means Bluehex
checked the credentials. Either can be true without the other, and the badge reflects
`verified` only.

They are two booleans in `practitioners.ts` today, but only `verified` survives as a
stored column: once credentials are rows of their own, `certified` is "holds a credential
whose catalogue entry is a Claude Certification" and gets derived rather than stored, so
the two cannot disagree. The separation of the two *ideas* is the invariant; the second
column is not. See `docs/spec/profile-and-credentials.md`.

**A practitioner cannot type a credential name.** Credentials reference
`credential_catalogue`, a Bluehex-owned list of every Claude credential that exists, and
the only thing keeping the model narrow is that nobody but `bluehex_admin` can insert into
it. `CONTEXT.md` always said the word was deliberately narrow; until 2026-08-16 nothing
enforced it and `label` was free text. If a future change puts a text column back on a
credential row, that is the invariant breaking — and like the `verified` rule below, it
fails silently rather than loudly.

Keep the tree this thin until something needs otherwise.

## Database — the plumbing, and the contract for the rest

What exists: the local Supabase stack, a lazy client in `src/lib/supabase.ts`, generated
types, and the environment wiring. An earlier SQLite (`better-sqlite3`) setup was
removed, and a Drizzle/Postgres one was scaffolded and stripped back out, before this.

**There is exactly one migration, and it holds no product data.** It creates the
`bluehex_admin` role, the `public.admins` list and the `custom_access_token_hook` that
stamps the role onto an access token — the thing every later policy and grant refers to.
The product schema starts with `practitioners`.

Nothing queried the database before that, and nothing queries it now: a health-check
table existed briefly to prove the connection and was taken back out before it was ever
committed, because it would have sat in the migration history permanently, describing a
table dropped a fortnight later, to prove something the first real query proves for free.

What does not exist yet: the `practitioners` table, any *product* RLS policy, auth in the
application, and the hosted project's copy of the hook setting. The token-side machinery
landing is not the app having auth — there is no `@supabase/ssr` client and no sign-in
flow, and every policy in the spec is written against `auth.uid()`, so none of them is
reachable from the app until #14. The rest of this section is the contract for building
those — treat it as binding, not as a description of current state.

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
- **A new table is invisible to the API until you `grant` on it, and the failure looks
  like a broken policy.** Postgres checks the privilege first and only then evaluates
  RLS, so a table with a correct policy and no grant returns `42501 permission denied`
  and never consults the policy at all. It is easy to assume the grant is inherited,
  because the `public` schema carries two different sets of default privileges — see
  `pg_default_acl`:

  ```
  owner supabase_admin  tables -> anon, authenticated get arwdDxtm  (everything)
  owner postgres        tables -> anon, authenticated get Dxtm      (no read or write)
  ```

  Migrations run as `postgres`, so every table a migration creates lands under the
  second set. Tutorials and dashboard-created tables land under the first, which is why
  most advice on this never mentions grants. Write them explicitly. It fails closed,
  which is the right way round, and it is the same privilege layer the `verified` rule
  below depends on — so being in the habit is worth more than the keystrokes.
- **Make the client lazy** — a `getClient()` function, not a top-level `export const db`. The module gets imported during `next build`, so reading environment variables eagerly breaks builds wherever a required variable is absent (CI, preview deployments).
- **Cache the client at module scope**, not only on `globalThis`. A `globalThis`-only
  cache is typically skipped in production and leaks a new client per call.
- **Queries are async**, unlike the synchronous `better-sqlite3` setup, so a Server Component that reads from the database must be `async`. Most of them will not also need `await connection()`. Per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`, `connection()` exists for a component that produces per-request output *without* touching a request-time API — its worked example is a synchronous `better-sqlite3` query, which is precisely the setup being replaced here. A Supabase server client reads cookies to resolve the session, and `cookies()` is a request-time API, so the render is already request-bound and `connection()` adds nothing. Reach for it only on a read that touches neither cookies nor headers, such as an anonymous public query — plausibly the directory listing itself. `export const dynamic` is on its way out in Next 16, so `connection()` is still the tool when one is needed.
- **Two keys, and the difference decides where code may run.** The anon/publishable key is shipped to the browser by design and is not a secret: `NEXT_PUBLIC_*` is where it belongs, and there is no reason to proxy reads through a server action to hide it. The service role key bypasses RLS outright — every policy on the table is decorative for any code holding it — so it is server-only: never `NEXT_PUBLIC_*`, never imported by a client component or by a module a client component can reach, and reserved for the admin write path rather than used as an escape hatch when a policy is inconvenient. Both belong in `.env.local` (git-ignored); `.env.example` is the committed template, kept alive by the `!.env.example` exception in `.gitignore` against the blanket `.env*` rule.

  Current Supabase issues both under new names — `sb_publishable_…` and `sb_secret_…`, superseding the legacy `anon` and `service_role` JWTs, which the CLI still prints. This repo uses the publishable key, as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No secret key is in the repo at all, and adding one is a decision, not a step.

  **`NEXT_PUBLIC_*` is baked in at build time, and the build's values win.** Next inlines these by literal text substitution wherever they are defined when `next build` runs — the server bundle included, not just the browser one. Verified by grepping `.next/server` after a build: the URL and key are there as string literals. So the environment a built artifact is *run* with cannot override them, and passing a different value to `next start` silently changes nothing.

  The one case that does read the runtime environment is a variable **absent** at build time: the lookup then survives into the bundle and resolves when the request is served. That is the only reason `next build` with no variables set produces something that still works when given them at run time, and it is easy to mistake for the general rule. It is not — it is the exception.

  Two consequences. Testing a built artifact against a different Supabase project means rebuilding, not re-running with a different environment. And on Vercel the values must exist *before* the build, which the deploy workflow already handles: `vercel pull` fetches the project's environment variables ahead of `vercel build`.
- **`verified` must never be writable by the practitioner.** Self-service puts an untrusted writer next to Bluehex's own attestation for the first time. The policy: a practitioner may write their own credential rows, with `verified` not among the columns they can set, and only `bluehex_admin` sets it — never the service role, see `docs/adr/0001-admins-are-a-postgres-role.md`. **RLS alone cannot express that**, so the policy needs a mechanism named or it does not exist. A policy's `USING` clause sees the existing row and `WITH CHECK` sees the proposed one, but a policy has no `OLD` to compare against — "this row is yours to update, but this column must not change" is not sayable. The natural `for update using (auth.uid() = user_id)` reads exactly like the paragraph above, passes review, and lets any practitioner `PATCH` themselves `{"verified": true}`. Use both of these, since neither is sufficient alone:
  - **Column privileges** — what Supabase calls column level security. `revoke update on practitioners from authenticated`, then `grant update (…) on practitioners to authenticated` naming each practitioner-writable column. PostgREST honours these, so the write is refused at the privilege layer whatever the policies say. The grant list is maintained by hand as the schema grows: a column added later is not writable until it is named, which fails closed and is the right way round.
  - **A `before update` trigger** forcing `new.verified = old.verified` for non-admin callers. Triggers do see `OLD`, so this is the only place the invariant can be stated directly, and it still holds if a later migration re-grants the column by accident.

  This is the most load-bearing line in the schema — getting it wrong silently destroys the only thing the directory sells, and it fails open rather than loudly.

`status` (`pending`, `approved`, `rejected`, `withdrawn`) joins `verified` as the second
Bluehex-owned axis. They are independent rather than a sequence — `status` governs whether
a profile is publicly visible, `verified` governs whether the badge shows — so a badge can
be withdrawn without unpublishing the profile, and a profile can be published without ever
being vouched for, which is the normal case.

**Where the schema is decided, and in what order to read it:**

- **`CONTEXT.md`** — the glossary. What a Profile, an Owner, a Claim and a Credential are,
  and which words not to overload.
- **`docs/adr/0001-admins-are-a-postgres-role.md`** — why admins are a Postgres role
  stamped by an access token hook rather than a flag or the service role key, and what
  that costs.
- **`docs/adr/0002-links-are-published-addresses-are-not.md`** — why a profile publishes a practitioner's links but never their email or phone. Read it before concluding that `practitioner_contacts` is over-built or that the published links are a mistake; the two look contradictory and are not. It also records what the links changed about the enquiry form, which still mails Bluehex and nobody else.
- **`docs/spec/profile-and-credentials.md`** — the model: what a profile contains, who
  owns it, what the badge attests to, and the DDL with its grant lists, triggers and RPCs.
  Binding on the first migration.
- **`docs/profile-lifecycle.md`** — the #35 spike report and its proof transcript.
  Historical: parts of it are superseded, and its own header says which.

The parts most likely to catch you out:

- **Verification is per credential**, not per profile. The profile-level badge is derived —
  at least one credential, and every credential verified — and is not stored. `certified`
  is not stored either, and neither is a practitioner's progress through the catalogue.
- **There is no in-progress credential.** Every credential row is earned; `earned_at` is
  `not null`. Someone working towards a certification is shown as holding fewer catalogue
  entries, not as holding an unverifiable row.
- **Reads are column-scoped as well as writes**, so `anon` cannot see `user_id`, `status`
  or who approved a profile. **`select *` is refused; every query must name its columns.**
- **The `config.toml` hook line and the migration creating `custom_access_token_hook` are
  one commit.** Enabling the hook without the function takes down every sign-in with a 500.
  Both landed together in `20260815012304_admin_role_and_access_token_hook.sql`; the same
  rule governs any later move of the hook, and the hosted project's Auth Hooks setting is
  enabled with that migration's deploy, never before it.
- **Admin authority lags revocation by the life of an access token** — removing someone
  from `admins` takes effect on their next refresh, not immediately.
- **Contact details live in `practitioner_contacts`, never on the profile**, and `anon` has
  no grant on that table by any route.

## Deployment

Target is Vercel, deployed from the `main` branch of `codesydney/bluehex`. Pushes to
`main` ship to production; pull requests get preview deployments.

`next build` passes with no environment variables set, which is what the lazy client in
`src/lib/supabase.ts` is for and is worth keeping true. It does not follow that a
deployment can reach Supabase: `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be in Vercel's preview and production
environments, or a deployed read fails at request time rather than at build time. Both
are set as of August 2026. Nothing queries the database yet, so the first feature to do
so is the first thing that will actually test this — a green deploy is not evidence.
