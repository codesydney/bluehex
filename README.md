# Bluehex

The Claude consulting arm of [Code.Sydney Pty Ltd](https://code.sydney).

A [Next.js](https://nextjs.org) (App Router) starter, deployed on
[Vercel](https://vercel.com).

## Getting started

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
live in [`AGENTS.md`](./AGENTS.md). `CLAUDE.md` is a symlink to it, so there is a
single source of truth — edit `AGENTS.md`.
