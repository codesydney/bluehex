# Bluehex

The Claude consulting arm of [Code.Sydney Pty Ltd](https://code.sydney).

A [Next.js](https://nextjs.org) (App Router) starter, deployed on
[Vercel](https://vercel.com).

## Getting started

### Node

The Node version is pinned in [`.nvmrc`](./.nvmrc), and `engines.node` in
`package.json` states the same major. CI and Vercel both read those files, so matching
them locally means your machine builds what production builds. `pnpm install` warns if
you are on the wrong major but does not stop you.

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
all your asdf plugins, not just Node.

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

There isn't one yet. The plan is Postgres — local in development, [Neon](https://neon.com)
when deployed, with [Drizzle ORM](https://orm.drizzle.team) on the `pg` driver. The
rationale and the constraints to follow when adding it are recorded in
[`AGENTS.md`](./AGENTS.md#database--planned-not-built).

## Toolchain notes

`pnpm outdated` will report `typescript` and `eslint` as behind. That's deliberate —
both newer majors break `pnpm lint`:

- **TypeScript** is held at `^6.0.3`; `typescript-eslint` rejects TypeScript 7 outright.
- **ESLint** is held at `^9`; `eslint-plugin-react` still calls an API removed in ESLint 10.

Both unblock once `eslint-config-next` updates its bundled plugins.

## Contributing

Repository conventions and architecture notes for both humans and AI coding agents
live in [`AGENTS.md`](./AGENTS.md). `CLAUDE.md` is a one-line file importing it, so
there is a single source of truth — edit `AGENTS.md`.
