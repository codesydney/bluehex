# Contributing to Bluehex

Thanks for helping. This file is the human on-ramp for first-time contributors. Architecture notes, invariants, and agent-oriented detail live in [`AGENTS.md`](./AGENTS.md) — **this file does not copy those rules**, it points at them so there is a single source of truth.

| File | Job |
| --- | --- |
| [`README.md`](./README.md) | What Bluehex is, and how to run it |
| **`CONTRIBUTING.md` (this file)** | How a newcomer opens their first change |
| [`AGENTS.md`](./AGENTS.md) | Conventions, architecture, and why the constraints exist |

## Before you start

1. **Comment on the issue** you want, wait to be **assigned**, then start. That stops two people doing the same work.
2. **Use pnpm**, never npm or yarn. npm/yarn create a competing lockfile. Setup commands are in the [README](./README.md); more detail is under [Commands](./AGENTS.md#commands) and [Working here, if you are new](./AGENTS.md#working-here-if-you-are-new) in `AGENTS.md`.
3. **Contributors are invited and push branches on this repo**, not forks. Forking is the usual open-source default, but here it changes CI: workflow runs from forks wait for maintainer approval instead of starting. Prefer a branch on `codesydney/bluehex` once you have write access.
4. Ask early. A question costs a minute; a day on a stale Stack Overflow answer for Next.js / React / Tailwind versions this repo does not use costs a day. See [Working here, if you are new](./AGENTS.md#working-here-if-you-are-new).

## The two rules that bite first-timers

### 1. Every pull request opens as a draft

Use `gh pr create --draft`, or the draft option in the GitHub UI. **Marking it ready is a separate, deliberate act and belongs to you** (or a human maintainer) — not to an agent opening the PR on your behalf.

This is load-bearing, not etiquette: **CI skips draft pull requests** (see #36), so the draft flag decides whether a build runs at all. Full wording, including how to get a build before you are ready for review and what happens on forks, is under [Pull requests](./AGENTS.md#pull-requests) in `AGENTS.md`.

### 2. No trailers in commit messages

Do **not** add `Co-Authored-By`, `Generated with`, or any tool-attribution trailer. Automated review runs against this repository; a trailer that names the tool can bias it. Commit messages describe the change and nothing else. See [Commit conventions](./AGENTS.md#commit-conventions) in `AGENTS.md`.

Also: **do not hard-wrap prose** in Markdown, PR bodies, or commit bodies (commit **title** stays a short single line). See [Prose formatting](./AGENTS.md#prose-formatting).

## Suggested workflow

1. Get assigned to an issue (comment first).
2. Branch from `main` on this repository (not a fork, if you can push here).
3. Make a focused change. Keep the diff reviewable.
4. Run what the change needs locally — at minimum `pnpm lint` when you touch app code; e2e and DB commands are listed under [Commands](./AGENTS.md#commands).
5. Open a **draft** pull request.
6. When you want review **and** a CI run, mark it ready yourself.

## Optional contributor survey

There is a short form for new contributors:

https://docs.google.com/forms/d/e/1FAIpQLSeAg-ZZfodP3hH1v_hRmowGyAi8cp5W4kHT3FO63wSpipunWg/viewform

It asks what you have built, which languages you use, where you are based, and how much time you have, so maintainers can point work at people it suits.

**It is optional and not a gate.** You do not wait for a reply before picking up an issue, and skipping it costs you nothing. Responses go to **David and Engramar only**.

## Going deeper

When you need more than the first PR:

- Invariants and “why we refuse throwaway commits” → [Invariants beat scope](./AGENTS.md#invariants-beat-scope)
- Toolchain pins (TypeScript, Node, dependency hold) → [Toolchain pins](./AGENTS.md#toolchain-pins)
- Stack and architecture → [Stack](./AGENTS.md#stack) / [Architecture](./AGENTS.md#architecture)
- Database contract → [Database](./AGENTS.md#database--the-plumbing-and-the-contract-for-the-rest)
