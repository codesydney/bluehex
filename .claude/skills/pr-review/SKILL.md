---
name: pr-review
description: Review a pull request and post the findings as inline review comments anchored to the offending lines. Prefers the Codex integration for the review pass and falls back to Claude Code when Codex is unavailable. Use when asked to review a PR, review the current branch, get a second opinion on changes, or run a review pass before merging.
---

# PR Review

Reviews a pull request and leaves the findings **on the PR as inline comments**, anchored
to the lines they concern. A review that only exists in a terminal session is lost the
moment the session ends.

## Quick start

```bash
.claude/skills/pr-review/scripts/post-review.sh 15 findings.json summary.md
```

## Workflow

### 1. Find the PR

Take it from the argument, or infer from the branch: `gh pr view --json number,title,baseRefName`.
No PR for the current branch means there is nothing to comment on — say so and stop.

### 2. Get the diff

```bash
gh pr diff <N>
```

Read the surrounding source too, not just the diff. Most real findings depend on context
the diff does not show.

### 3. Run the review pass — Codex first

Check availability in this order:

1. `ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs` — plugin
   installed. **Delegate to the `codex:codex-rescue` subagent** via the Agent tool, asking
   for a review of the branch with file and line references.
2. `command -v codex` — CLI but no plugin. Shell out to `codex exec` with the same brief.
3. Neither — review it yourself. Say in the summary which engine ran; the reader should
   know whether a second model saw this.

### 4. Verify every finding before posting

**This is the step that matters.** Automated reviewers produce confident, plausible,
wrong findings. For each one, open the file and confirm the claim holds. Drop what does
not survive. Correct what is right-for-the-wrong-reason.

Where a finding is real but the fix belongs to an open decision, say so and link the
issue rather than proposing a patch that pre-empts it.

### 5. Post

Write findings to JSON — one object per inline comment:

```json
[
  {
    "path": "src/components/practitioner-directory.tsx",
    "line": 104,
    "side": "RIGHT",
    "body": "**Missing focus indicator.** `outline-none` with no replacement..."
  }
]
```

`line` must be a line **present in the diff**, or GitHub rejects the entire review with a
422. Use `side: "LEFT"` to anchor to a removed line. Anything you cannot anchor goes in
the summary instead.

Write the summary to a markdown file: what was reviewed, which engine ran, the verdict,
and anything not anchorable to a line. Then run the script.

## Conventions

- Default event is `COMMENT`. Only use `REQUEST_CHANGES` when explicitly asked — it blocks
  merge, and that is the human's call.
- Lead each comment with a bold one-line claim, then the reasoning. Reviewers skim.
- Say what is wrong and why it bites, not just what to change.
- Separate "fix now" from "forward-looking" so the author can triage.
- No tool attribution in any commit that follows (see AGENTS.md). Attribution in the
  review comment itself is fine and useful — a reader should know a model wrote it.
