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

**`pnpm dlx` ignores the floor.** This is the one that will catch you. `pnpm add` refuses a
version published four hours ago; `pnpm dlx` on the same package, same version, same
directory downloads it without a word. It is not that `dlx` fails to find
`pnpm-workspace.yaml` — passing the setting explicitly as
`pnpm --config.minimumReleaseAge=10080 dlx` does not help either. `dlx` resolves in a
temporary context the floor has no reach into. So reaching for `dlx` to bring a tool under
the policy looks like it works and does not. The only way a version is covered is by being
in `pnpm-lock.yaml`.

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

The repo has **no database**: no driver, no ORM, no `DATABASE_URL`, no `src/lib/db.ts`.
An earlier SQLite (`better-sqlite3`) setup was removed, and a Drizzle/Postgres one was
scaffolded and then stripped back out to keep the skeleton thin. The notes below are the
agreed plan for when it is reintroduced — treat them as the contract, not a description
of current state.

- **Target is Postgres**: local Postgres in development, [Neon](https://neon.com) when
  deployed. Drizzle ORM for schema and queries.
- **Use the `node-postgres` (`pg`) driver, not `@neondatabase/serverless`.** Neon's HTTP
  driver cannot talk to local Postgres — it speaks Neon's own HTTP protocol, so a
  `localhost` URL fails with `Error connecting to database: TypeError: fetch failed`.
  `pg` speaks the standard wire protocol and works against both local Postgres and Neon's
  pooled connection string. Only consider the HTTP driver if the app moves to the edge
  runtime.
- **Make the client lazy** — a `getDb()` function, not a top-level `export const db`.
  The module gets imported during `next build`, so reading `DATABASE_URL` eagerly breaks
  builds wherever that secret is absent (CI, preview deployments).
- **Cache the client at module scope**, not only on `globalThis`. A `globalThis`-only
  cache is typically skipped in production and leaks a new connection pool per call.
- **Queries are async**, unlike the synchronous `better-sqlite3` setup. A Server Component
  that reads from the database must be `async`, and should `await connection()` from
  `next/server` first to opt out of prerendering. `export const dynamic` is on its way out
  in Next 16 — prefer `connection()`.
- Local Postgres on this machine follows a `<project>_dev` naming convention.
- `DATABASE_URL` belongs in `.env.local` (git-ignored). Add a committed `.env.example`
  template at the same time — `.gitignore` already has the `!.env.example` exception,
  since the blanket `.env*` rule would otherwise swallow it.

## Deployment

Target is Vercel, deployed from the `main` branch of `codesydney/bluehex`. Pushes to
`main` ship to production; pull requests get preview deployments. The build requires no
environment variables.
