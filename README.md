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

There is no configuration to do — the app has no database and no environment
variables. It builds and runs from a clean clone.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) at http://localhost:3000 |
| `pnpm build` | Production build, including the TypeScript type-check |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (flat config, `eslint-config-next`) |

`next build` no longer runs ESLint, so `pnpm lint` is a separate step — worth wiring
into CI rather than relying on the build to catch lint errors.

## Deployment

Deployed on Vercel from `main`. Pushes to `main` go to production; pull requests get
preview deployments. The build needs no environment variables.

## Database

There isn't one yet. The plan is [Supabase](https://supabase.com) — Postgres with the auth that comes bundled, running locally through the Supabase CLI and hosted when deployed. Queries go through the Supabase client rather than an ORM, because authorization is row level security and the Supabase client carries the user's JWT, so policies resolve against the right identity. A pooled server-side connection carries no per-user identity unless every request installs it, which is the part that goes wrong silently.

This supersedes an earlier Neon and Drizzle plan; the switch was made to buy
authentication rather than build it. The rationale and the constraints to follow when
adding it are recorded in [`AGENTS.md`](./AGENTS.md#database--planned-not-built).

### Running it locally

**None of this works yet.** There is no `supabase/` directory and no Supabase dependency in `package.json`, so `pnpm exec supabase` will not resolve today. This is written down now because the container runtime is the slow part of the setup and it is better discovered before the database lands than during it.

The Supabase stack is a set of Docker containers, so a working container runtime is the one real prerequisite. What that takes depends on the platform, and the difference is not cosmetic:

- **macOS and Windows** — install [Docker Desktop](https://docs.docker.com/desktop/). There is no Linux kernel underneath to run containers on, so Docker Desktop supplies one inside a VM; it is doing real work here rather than being a convenience wrapper. On Windows use the WSL 2 backend and enable integration for the distro you work in (Settings → Resources → WSL integration), then run the CLI from inside that distro rather than from PowerShell — this project already expects Windows contributors to be in WSL for the Node version pin, so it is the same distro either way.
- **Linux** — install [Docker Engine](https://docs.docker.com/engine/install/) from Docker's own apt or dnf repository, not the distribution's `docker.io` package, which is habitually several versions behind. The kernel is already yours, so there is no VM and Docker Desktop is unnecessary; installing it anyway is not harmful but adds a second `desktop-linux` context, and `docker ps` then answers differently depending on which context is active. Do the [post-install step](https://docs.docker.com/engine/install/linux-postinstall/) — add your user to the `docker` group, then log out and back in. Skipping it means every call needs `sudo`, which surfaces as a permission error on `/var/run/docker.sock` when the CLI reaches for the daemon, and that error does not obviously read as "you are not in the docker group".
- **Already have something Docker-compatible?** Rancher Desktop, Podman, OrbStack and colima are all supported. The test is whether `docker ps` works; if it does, the CLI is satisfied. Worth knowing if one is already installed, not worth installing if not.

Once the database lands, the loop from the repo root will be `pnpm install` (which brings the CLI down with everything else — it is a devDependency, not a global install), then `pnpm exec supabase start`. The first start pulls several GB of images and is slow in a way that later starts are not. `pnpm exec supabase status` prints the local URLs and keys to copy into `.env.local`; the API is on `localhost:54321`, Postgres on `54322` and Studio on `54323`. The containers keep running until `pnpm exec supabase stop`, which is worth remembering on a laptop.

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
