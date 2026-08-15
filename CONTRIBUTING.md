# Contributing to Bluehex

Everything here is what you need *before* your first pull request, in roughly the order
you hit it. The conventions and architecture behind these rules live in
[`AGENTS.md`](./AGENTS.md) and that file stays the single source of truth — this one links
to it rather than repeating it, so there is never a second copy to drift.

## Two rules that are easy to breach

Both are cheap to follow and awkward to undo, so they come first.

**Open every pull request as a draft.**

```bash
gh pr create --draft
```

Marking it ready for review is a separate, deliberate act and it belongs to you. This is
not etiquette — CI skips draft pull requests, so the flag decides whether a build runs at
all, and there is no way to ask for a build while staying a draft. See
[Pull requests](./AGENTS.md#pull-requests) for what to do when you want a run before you
are ready, and for why a fork's first build needs a maintainer to press approve.

**Do not put trailers in commit messages.** No `Co-Authored-By`, no `Generated with`, no
tool attribution of any kind — the message describes the change and nothing else.
Automated review runs against this repository and a trailer naming the tool that wrote the
change can bias it. See [Commit conventions](./AGENTS.md#commit-conventions).

This one is only visible after you have already written the commit, so it is worth
checking before you push: `git log --format='%(trailers)' origin/main..HEAD` should print
nothing.

## Setup

Use **pnpm**, never `npm` or `yarn` — either produces a competing lockfile.

```bash
pnpm install
pnpm dev
```

Node version, the Supabase stack and the database commands are all in the
[README](./README.md#getting-started); the full command list is under
[Commands](./AGENTS.md#commands).

## Before you push

```bash
pnpm lint       # must exit 0
pnpm test:e2e   # where the change could affect it
```

`next build` no longer runs ESLint, so `pnpm lint` is the only thing enforcing the lint
rules — running the build is not a substitute. Playwright is the end-to-end runner and
there is no unit test runner, so `pnpm test:e2e` is the whole automated safety net.

## Working on the code

Read [Invariants beat scope](./AGENTS.md#invariants-beat-scope) before changing anything
structural — it is the shortest description of how decisions get made here, and it will
save you a round of review.

If you are touching the database, [Database](./AGENTS.md#database--the-plumbing-and-the-contract-for-the-rest)
is the contract the rest of the app depends on.

Dependency upgrades are held for 7 days after release; see
[Dependency releases are held for 7 days](./AGENTS.md#dependency-releases-are-held-for-7-days).

## Opening the pull request

Link the issue it closes, say what you decided and why where the change involved a
judgement call, and keep the description to what a reviewer needs. Then open it as a
draft — see above.
