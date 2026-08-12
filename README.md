# Bluehex

The Claude consulting arm of [Code.Sydney Pty Ltd](https://code.sydney).

A [Next.js](https://nextjs.org) (App Router) template backed by [SQLite](https://www.sqlite.org)
via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).

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

Open [http://localhost:3000](http://localhost:3000). The placeholder home page reads
its tagline from SQLite, so a successful load confirms the database wiring works.

## Database

The SQLite file is created on first run at `data/bluehex.db` (git-ignored). The schema
lives in `src/lib/db.ts` and is applied idempotently on connection. Override the file
location with the `DATABASE_PATH` environment variable.
