# Bluehex

The Claude consulting arm of [Code.Sydney Pty Ltd](https://code.sydney).

A [Next.js](https://nextjs.org) (App Router) starter, deployed on
[Vercel](https://vercel.com).

## Getting started

### Node

The Node version is pinned in [`.nvmrc`](./.nvmrc), and `engines.node` in
`package.json` states the same major. The deploy workflow reads `.nvmrc`, so matching it
locally means you build on exactly the version CI builds on. Vercel reads `engines.node`
and runs the latest release of that major, so production agrees on the major but not
necessarily the patch. `pnpm install` warns if you are on the wrong major but does not
stop you.

**Linux and macOS — [nvm](https://github.com/nvm-sh/nvm)**

On macOS first install the Xcode command line tools (`xcode-select --install`), and if
you have never created one, `touch ~/.zshrc` — the installer needs a profile file to
write to. Then:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
```

Open a new shell, then from the repository root:

```bash
nvm install   # reads .nvmrc, installs that version if missing, and switches to it
```

On later visits `nvm use` is enough.

**Windows — [nvm-windows](https://github.com/coreybutler/nvm-windows)**

Run these from an **Administrator** PowerShell. nvm-windows switches versions by
rewriting a symlink, which Windows only permits elevated, so `install` and `use` both
fail in an ordinary shell.

```powershell
winget install CoreyButler.NVMforWindows
```

nvm-windows [deliberately does not read `.nvmrc`](https://github.com/coreybutler/nvm-windows/issues/556),
so pass the file's contents yourself from the repository root:

```powershell
nvm install (Get-Content .nvmrc)
nvm use (Get-Content .nvmrc)
```

If you would rather not do that every time, use WSL and follow the Linux instructions.

**asdf**

asdf ignores `.nvmrc` until you opt in. Once, per machine:

```bash
echo 'legacy_version_file = yes' >> ~/.asdfrc
```

The `nodejs` plugin then reads `.nvmrc` in this repository. Note the setting applies to
all your asdf plugins, not just Node. Then from the repository root:

```bash
asdf plugin add nodejs   # skip if you already have it
asdf install             # reads .nvmrc and installs that version
```

### pnpm

This project uses [pnpm](https://pnpm.io). If you don't have it yet:

```bash
npm install -g pnpm
```

Then install and run:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the home page.

The site builds and runs from a clean clone without any of the below — with no Supabase configured the directory reads as empty rather than failing, which is what lets CI build with no database at all. But an empty directory is most of the product missing, and signing in is not possible without one, so in practice everything from here on is part of the setup rather than an optional extra.

### Docker

The local database is a Supabase stack the CLI runs in containers, so Docker is the one
prerequisite that is not `pnpm install`. Any of Docker Desktop, Docker Engine, Rancher
Desktop, Podman, OrbStack or colima will do — the test is whether `docker ps` works.

- **macOS and Windows** — there is no Linux kernel underneath, so something has to
  supply one in a VM. [Docker Desktop](https://docs.docker.com/desktop/) is the usual
  answer and is not optional in the way it is on Linux.
- **Linux** — the kernel is already there, so
  [Docker Engine](https://docs.docker.com/engine/install/) from Docker's own repository
  is the install. Do the
  [post-install step that adds you to the `docker` group](https://docs.docker.com/engine/install/linux-postinstall/);
  skipping it surfaces later as a permission error on `/var/run/docker.sock` that never
  mentions the group.
- **Windows** — you are already expected to be in WSL for the Node version pin, so run
  the CLI there rather than in PowerShell.

### The local database

```bash
cp .env.example .env.local
pnpm db:start
```

The first `pnpm db:start` pulls around a dozen container images and takes a few minutes;
later ones take seconds. It prints a block of URLs and keys when it finishes —
`pnpm exec supabase status` reprints them. The values are the same on every machine, so
the `.env.example` you just copied already matches.

Two of those URLs are worth a bookmark: Studio at
[127.0.0.1:54323](http://127.0.0.1:54323) to browse the data, and Mailpit at
[127.0.0.1:54324](http://127.0.0.1:54324), which catches every email the stack sends —
which is how you sign in locally, below.

| Command | Description |
| --- | --- |
| `pnpm db:start` | Start the local stack |
| `pnpm db:stop` | Stop it (the data survives) |
| `pnpm db:reset` | Drop the database, re-apply every migration from scratch, and re-run the seed |
| `pnpm db:types` | Regenerate `src/lib/database.types.ts` after a schema change |

`db:reset` and `db:types` both read the running stack, so `pnpm db:start` first. Note `pnpm dev` does not start it either.

`db:start` against a stack that is already up is a no-op, so it will not pick up a seed or a migration that arrived with the branch you just pulled. `pnpm db:reset` is what does that.

The schema is the migrations in [`supabase/migrations/`](./supabase/migrations) — the `bluehex_admin` role and the access token hook first, then the profile core, the two Bluehex-owned catalogues, credentials, services and the public `handle`. `src/lib/database.types.ts` is generated from all of it, and [`AGENTS.md`](./AGENTS.md#database--the-plumbing-and-the-contract-for-the-rest) says what each one carries and why.

Schema changes are migrations, created with
`pnpm exec supabase migration new <name>` and committed. Changing the schema through
Studio leaves no diff and no history, so the next person's `pnpm db:reset` silently
undoes it. Run `pnpm db:types` afterwards so the generated types keep up.

### The seed

`supabase/seed.sql` runs at the end of every `pnpm db:reset` — and on the `supabase start` in CI's `Schema` workflow — and never against the hosted project. That last clause is what makes it safe to keep two quite different things in one file:

- **The credential catalogue.** The 24 real Claude credentials, which `20260820201450_catalogues.sql` deliberately creates the table empty of, because a wrong label in migration history is permanent. [`supabase/seed/credential-catalogue.json`](./supabase/seed/credential-catalogue.json) is the canonical record and `seed.sql` is one loader for it; [`supabase/seed/README.md`](./supabase/seed/README.md) explains why, and a drift test fails if the two disagree.
- **An invented population.** Eight practitioners with their credentials and services, six unclaimed and two owned, plus three accounts. Fixtures, not reference data — this is the one place invented people are allowed, and the reason is the same clause: it never reaches the hosted project.

So a reset leaves you a directory with something in it rather than an empty page, `/p/seed0001` … `/p/seed0008` reaching the eight profiles by a handle that does not change from one reset to the next, and an account you can actually sign in as.

**An edit to the seed reaches you through a reset and by no other route.** The loader is additive — `on conflict do nothing` throughout — so re-running it by hand inserts what is missing and keeps the stale copy of anything that changed. That is deliberate rather than a rough edge; the reasoning is in the header of `seed.sql`.

### Signing in

Magic link only. There is no password in the product, which means there is none to type here and none committed to the repository.

Start `pnpm dev`, go to [/sign-in](http://localhost:3000/sign-in), enter one of the seeded addresses, then open [Mailpit](http://127.0.0.1:54324) and follow the link in the message that just arrived. No mail provider is configured or needed — Mailpit catches everything the stack sends.

| Address | What it signs you in as |
| --- | --- |
| `admin@bluehex.example.invalid` | An admin: the review queue at `/admin` |
| `mara.ellison@example.invalid` | A practitioner whose profile is approved — `/profile` over a finished one |
| `ines.okonkwo@example.invalid` | A practitioner still `pending` — `/profile` over one in review |

If no mail arrives at all right after a `pnpm db:reset`, the sign-in request is 502ing on a stale container address rather than failing on anything you typed — see [Tests](#tests) for the one-line fix.

Any other address works too; `signInWithOtp` creates the account on first use. It just owns no profile, which is its own useful state to look at. What it will not be is an admin: that is the `bluehex_admin` role stamped onto the access token by the hook, so adding a row to `public.admins` takes effect on the next token refresh rather than immediately.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) at http://localhost:3000 |
| `pnpm build` | Production build, including the TypeScript type-check |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (flat config, `eslint-config-next`) |

`next build` no longer runs ESLint, so `pnpm lint` is a separate step — run it yourself
alongside the tests rather than expecting the build to catch a lint error.

## Tests

| Command | Description |
| --- | --- |
| `pnpm test` | Vitest over `src/` — unit tests, no Docker. This is the check that gates every merge |
| `pnpm test:watch` | The same project, watching |
| `pnpm test:db` | Vitest over `tests/db/` — the schema's grants, policies and guard triggers, against the running local stack |
| `pnpm test:e2e` | Playwright: builds, serves on port 3100, and drives desktop and mobile Chromium |

**`pnpm test:db` uses the same database `pnpm dev` does.** There is no second stack keeping it away from yours, and it is not a read-only suite: it signs accounts up and deletes them again, writes fixture profiles and credentials, and revokes a column grant to prove the trigger still refuses the write without it before granting it back. A clean run puts all of that back. A run you interrupt, or one that fails partway through a file, does not — and what it leaves behind is a stray profile in your directory or a privilege your next query is missing, neither of which announces itself as a leftover.

**So expect to reset often.** `pnpm db:reset` after a db run that did not finish cleanly, after pulling a branch that touches `supabase/migrations/` or `supabase/seed.sql`, and any time the directory in front of you stops matching what the seed says should be there. It takes seconds and it is the only way back to a known state.

Two things that will otherwise send you debugging the wrong file:

- **When the stack is not answering, the suite reports `skipped` rather than failed.** The fixtures cannot be built, so the files that need them never run and the summary line stays green-ish. Read the exit code, not the summary.
- **Kong caches a stale container address across a reset.** `pnpm db:reset` brings the auth container back on a new Docker IP while `supabase_kong_bluehex` keeps routing to the old one, so every sign-up 502s — and, per the point above, the suite goes quiet instead of red. `docker restart supabase_kong_bluehex` fixes it; the rest of the stack can stay up.

`pnpm test` and `pnpm lint` need none of this. The database suite is deliberately not part of the merge check, which is why a stopped Docker daemon cannot fail the run that gates a pull request; CI runs it in a `Schema` workflow of its own.

## Deployment

Deployed on Vercel from `main`, and **production is the only deployed environment.** Vercel's Git integration is not in use, so a pull request gets CI and nothing else — there are no preview deployments and no preview URL to check a change on. Shipping is [`vercel-deploy.yml`](./.github/workflows/vercel-deploy.yml), which builds with the Vercel CLI and deploys once `CI` is green — and `Schema` too, where a run of it exists. A documentation-only push produces no `Schema` run at all, and ships without one.

The consequence is worth stating rather than discovering: **anything that depends on the hosted database is proved for the first time in production.** There is no staging rehearsal to catch a query that works against the local stack and not against the hosted project, which is why review carries more weight here than it would somewhere with previews, and why the schema reaches the hosted project on its own deploy rather than alongside the code that reads it: that same workflow applies the migrations before it builds.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set in that production environment. The build still succeeds with neither of them — deliberate, so a build cannot break for want of a variable — but a build succeeding says nothing about whether the deployment works. Without them every database read fails, and for a statically rendered page the failure lands at build time rather than at request time, because that page's query runs on the build machine.

They have to be set *before the build*, not just before the app runs. Next inlines
`NEXT_PUBLIC_*` into the bundle as literal strings, so a built artifact ignores whatever
environment it is later started with. The deploy workflow already gets this right —
`vercel pull` fetches them ahead of `vercel build` — but it is why re-running a build
with different variables changes nothing, and rebuilding is the only way to point one at
a different project.

## Database

[Supabase](https://supabase.com) — Postgres with the auth that comes bundled, run
locally through the Supabase CLI and hosted when deployed. Queries go through the
Supabase client rather than an ORM, because authorization is row level security and the
client carries the user's JWT, so policies resolve against the right identity. A pooled
server-side connection carries no per-user identity unless every request installs it,
which is the part that goes wrong silently.

The hosted project exists and production points at it. The site reads from it — the directory, one profile, the enquiry form's subject — and writes to it, through sign-in and the profile editor. This supersedes an earlier Neon and Drizzle plan; the switch was made to buy authentication rather than build it. The rationale and the constraints to follow are in [`AGENTS.md`](./AGENTS.md#database--the-plumbing-and-the-contract-for-the-rest).

## Toolchain notes

`pnpm outdated` will report `typescript` and `eslint` as behind. That's deliberate —
both newer majors break `pnpm lint`:

- **TypeScript** is held at `^6.0.3`; `typescript-eslint` rejects TypeScript 7 outright.
- **ESLint** is held at `^9`; `eslint-plugin-react` still calls an API removed in ESLint 10.

Both unblock once `eslint-config-next` updates its bundled plugins.

Separately, `pnpm-workspace.yaml` sets a 7-day floor on how recently a version may have
been published before pnpm will install it (`minimumReleaseAge`). Compromised npm releases
are usually caught and pulled within hours, so waiting a week keeps that window out of our
lockfile. Two things follow, and neither is a broken install:

- `pnpm add` and `pnpm update` may hand you an older version than the newest one. pnpm
  says so, in parentheses: `(x.y.z is available)`. `pnpm outdated` asks the registry
  directly, so it will keep listing versions the floor is currently declining to take.
- Asking for an exact version younger than 7 days fails with
  `ERR_PNPM_NO_MATCHING_VERSION` — which reads like the version does not exist. It does;
  the rest of the error gives the real reason and its publish date.
- `pnpm dlx` is not covered. It resolves in a throwaway project that never reads
  `pnpm-workspace.yaml`, so it will happily run a version `pnpm add` just refused. Passing
  `--config.minimumReleaseAge=10080` to `pnpm` applies the floor to a one-off `dlx`, but
  only what is in `pnpm-lock.yaml` gets it automatically.

If a fix genuinely needs to land inside that window, add the package to
`minimumReleaseAgeExclude` rather than removing the floor. The full reasoning is in
[`AGENTS.md`](./AGENTS.md#dependency-releases-are-held-for-7-days).

That last point is why `vercel` is a devDependency here. The deploy workflow builds with
`vercel build` and ships with `vercel deploy --prebuilt`, so the CLI produces the artifacts
that go to production — keeping it in the lockfile is what puts it under the floor. It is
also why `pnpm install` pulls more than a one-page site looks like it should: the CLI is
about 250 MB of the tree, and you get it whether or not you ever deploy.

## Contributing

How to pick up an issue and open your first pull request: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Architecture, invariants, and deeper conventions live in [`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` imports it — edit `AGENTS.md`, not a second copy).
