@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: `next dev` regenerates the `@AGENTS.md` import above and the `AGENTS.md` file
> itself — leave both in place and commit them with your changes to keep the tree clean.

## Project

Bluehex is the Claude consulting arm of Code.Sydney Pty Ltd. This repo is a Next.js
(App Router) + SQLite template; the current home page is a placeholder.

## Commands

- `npm run dev` — start the dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build (also runs the TypeScript type-check)
- `npm start` — serve the production build
- `npm run lint` — ESLint (flat config, `eslint-config-next`)

There is no test runner configured yet.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 (via `@tailwindcss/postcss`; no `tailwind.config` file — configured in CSS)
- TypeScript, path alias `@/*` → `src/*`
- SQLite through `better-sqlite3` (synchronous, native module)

## Architecture

- `src/app/` — App Router routes, layout, and global styles. Pages are React Server
  Components by default, so they can call the database directly (see `src/app/page.tsx`).
- `src/lib/db.ts` — the single SQLite entry point. It exports a shared `Database`
  instance, applies the schema idempotently via `migrate()` on first connect, and caches
  the connection on `globalThis` to survive dev hot-reloads. Add new tables by extending
  `migrate()` (use `CREATE TABLE IF NOT EXISTS` so it stays re-runnable).

### SQLite notes

- `better-sqlite3` is a native module and is declared in `serverExternalPackages`
  (`next.config.ts`) so the bundler leaves it alone. It must only be imported from
  server code — never from a `"use client"` component.
- The database file defaults to `data/bluehex.db` (created at runtime, git-ignored).
  Override the path with the `DATABASE_PATH` environment variable.
- `better-sqlite3` is fully synchronous — no `await` on queries; queries block the
  request, which is expected and fine for this workload.
