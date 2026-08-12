---
name: pr-review-resolve
description: Work through the open review comments on a pull request — fix what is right, reply to every thread with what happened, and resolve only the threads actually addressed. Use when asked to address review feedback, action a code review, respond to review comments, or clear the open threads on a PR.
---

# PR Review Resolve

The other half of `pr-review`. Takes the open threads on a PR, acts on them, and closes
the loop by replying to each one.

**The rule that matters: never resolve a thread without replying to it.** A resolved
thread with no reply tells the reviewer nothing about whether you fixed it, disagreed
with it, or missed the point. Resolving is the receipt, not the answer.

## Quick start

```bash
.claude/skills/pr-review-resolve/scripts/threads.sh list 15
.claude/skills/pr-review-resolve/scripts/threads.sh reply <thread-id> "Fixed in abc1234."
.claude/skills/pr-review-resolve/scripts/threads.sh resolve <thread-id>
```

## Workflow

### 1. List the open threads

```bash
.claude/skills/pr-review-resolve/scripts/threads.sh list <N>
```

Returns unresolved threads with their id, path, line and comment bodies. Outdated threads
are flagged — the code under them has already moved, so read before assuming they apply.

### 2. Triage each one

A review comment is a claim, not an instruction. Decide per thread:

- **Fix** — the finding holds and the fix belongs in this PR.
- **Defer** — real, but the fix belongs to an open decision or a separate issue. Do not
  patch around a modelling question just to close a thread.
- **Disagree** — the claim does not hold. Say why, with the evidence.

Verify before fixing. A confidently wrong comment that gets "fixed" makes the code worse
and the thread still gets resolved, which hides it.

### 3. Apply the fixes

Group them into coherent commits — one per theme, not one per thread. Run `pnpm lint`
and `pnpm build` before pushing. No tool attribution in commit messages (see AGENTS.md).

### 4. Reply to every thread, then resolve selectively

Reply to **all** of them, including deferred and disagreed:

| Outcome | Reply | Resolve |
| --- | --- | --- |
| Fixed | what changed and the commit sha | yes |
| Deferred | why, and the issue that now owns it | no |
| Disagreed | the evidence that the claim does not hold | no |

Leaving a thread open is a feature — it is how the reviewer knows there is something
still to discuss. Resolving everything to get a clean PR page defeats the mechanism.

### 5. Summarise on the PR

One comment covering what was fixed, what was deferred and where it went, and what was
rejected and why. The per-thread replies are for the reviewer; the summary is for whoever
reads the PR in six months.

## Notes

- The reply and resolve operations are GraphQL only — there is no REST equivalent for
  resolving. The script handles both.
- A thread id is not a comment id. Get ids from `list`, never from a comment URL.
- If the branch has moved since the review, threads may be `isOutdated`. Re-read the
  current code before acting; the finding may already be gone.
