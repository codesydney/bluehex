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

Open [http://localhost:3000](http://localhost:3000) for the placeholder home page.

The site builds and runs from a clean clone without any of the below. You only need the
next section to work on anything that touches the database.

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
[127.0.0.1:54324](http://127.0.0.1:54324), which catches every email the stack sends so
sign-in links work locally with no mail provider configured.

| Command | Description |
| --- | --- |
| `pnpm db:start` | Start the local stack |
| `pnpm db:stop` | Stop it (the data survives) |
| `pnpm db:reset` | Drop the database and re-apply every migration from scratch |
| `pnpm db:types` | Regenerate `src/lib/database.types.ts` after a schema change |

`db:reset` and `db:types` both read the running stack, so `pnpm db:start` first. Note
`pnpm dev` does not start it either.

**The database is empty.** There are no migrations yet — the schema starts with the
practitioners table, which is still being designed. So the stack comes up with nothing
in it, `src/lib/database.types.ts` describes no tables, and nothing in the app queries
anything. That is the honest state rather than an oversight: a health-check table
invented to have something to read would have to live in the migration history
permanently to prove a point that the first real query proves for free.

Schema changes are migrations, created with
`pnpm exec supabase migration new <name>` and committed. Changing the schema through
Studio leaves no diff and no history, so the next person's `pnpm db:reset` silently
undoes it. Run `pnpm db:types` afterwards so the generated types keep up.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) at http://localhost:3000 |
| `pnpm build` | Production build, including the TypeScript type-check |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (flat config, `eslint-config-next`) |
| `pnpm test:e2e` | Build, serve, and test the production app in desktop and mobile Chromium |

`next build` no longer runs ESLint, so `pnpm lint` is a separate step — worth wiring
into CI rather than relying on the build to catch lint errors.

## Deployment

Deployed on Vercel from `main`. Pushes to `main` go to production; pull requests get
preview deployments.

The build still succeeds with no environment variables set — that is deliberate, so a
preview build cannot break for want of a secret. It does not follow that the deployment
works: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be set
in Vercel's preview and production environments before the first query ships, or every
database read will fail at request time. They are set as of August 2026.

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

So far this is plumbing only: the local stack, the client, the type generation and the
environment wiring, with an empty database behind it. The practitioners table and its
policies come next, and they are the part that matters. This supersedes an earlier Neon
and Drizzle plan; the switch was made to buy authentication rather than build it. The
rationale and the constraints to follow are in
[`AGENTS.md`](./AGENTS.md#database--the-plumbing-and-the-contract-for-the-rest).

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

Repository conventions and architecture notes for both humans and AI coding agents
live in [`AGENTS.md`](./AGENTS.md). `CLAUDE.md` is a one-line file importing it, so
there is a single source of truth — edit `AGENTS.md`.
