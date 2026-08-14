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

Every object in `findings.json` needs `path`, `line` and `body`; `side` defaults to
`RIGHT`. The script rejects the file if any are missing, because GitHub answers a bad
comment with a 422 that takes the entire review down with it.

## Workflow

### 1. Find the PR

Take it from the argument, or infer from the branch:
`gh pr view --json number,title,baseRefName,author`.
No PR for the current branch means there is nothing to comment on — say so and stop.

Take `author` now because the tone of the review depends on it (see Conventions), and
guessing is worse than not calibrating at all. `gh pr list --author <login> --state all
--limit 5` tells you whether this is their first contribution here.

### 2. Get the diff

```bash
gh pr diff <N>
```

Read the surrounding source too, not just the diff. Most real findings depend on context
the diff does not show.

### 3. Run the review pass — Codex first

Check availability in this order:

1. `ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs` — plugin
   likely installed. **Delegate to the `codex:codex-rescue` subagent** via the Agent tool,
   asking for a review of the branch with file and line references.
2. `command -v codex` — CLI but no plugin. Shell out to `codex exec` with the same brief.
3. Neither — review it yourself.

**Fall through on failure, not just on absence.** The file check is evidence that the
plugin is installed; it is not proof the subagent is registered under that name. If the
delegation errors, drop to the next option rather than stopping — a check that passes
while the thing it stands for is missing is the one failure the chain would otherwise
not survive.

Record which engine ran — it belongs in the summary's attribution line (see Attribution).

### 4. Verify every finding before posting

**This is the step that matters.** Automated reviewers produce confident, plausible,
wrong findings. For each one, open the file and confirm the claim holds. Drop what does
not survive. Correct what is right-for-the-wrong-reason.

**A finding you cannot verify is dropped, not posted with a caveat.** Disclosing that you
guessed does not refund the author the time it costs them to disprove it, and there is no
budget pressure that makes an unverified finding worth posting. If the pass ran out of
room, post fewer findings.

Where a finding is real but the fix belongs to an open decision, say so and link the
issue rather than proposing a patch that pre-empts it.

Then give each survivor a severity — see **Rank every finding**. Here is where to do it,
now that you know what the finding actually is.

### 5. Post

**Read Rank every finding and Length before writing anything.** Both sit below this step
but are requirements, not background — a review written straight from steps 1–5 will be
missing its severity labels and three times its budget.

Write findings to JSON — one object per inline comment:

```json
[
  {
    "path": "src/components/practitioner-directory.tsx",
    "line": 104,
    "side": "RIGHT",
    "body": "**major** — Missing focus indicator. `outline-none` with no replacement..."
  }
]
```

`line` must be a line **present in the diff**, or GitHub rejects the entire review with a
422. Use `side: "LEFT"` to anchor to a removed line. Anything you cannot anchor goes in
the summary instead.

Write the summary to a markdown file — **Length** below says what belongs in it. Check it
against the budget before posting, because you will not eyeball this correctly:

```bash
wc -w summary.md
```

Then run the script.

## Attribution

**Say the review was automated, at the top of the summary, before any finding:**

> *Automated review — <engine that ran the pass>, verified by <engine that posted>.
> Findings were checked against the source before posting.*

It goes first because it changes how everything under it is read. Someone deciding how far
to trust a finding needs to know a model produced it before they weigh it, not in a
footnote once they already have. Buried attribution is the same as none.

Fill both slots rather than naming one engine, because the usual flow has two: Codex runs
the pass, Claude Code verifies each finding under step 4 and posts. That is materially
different evidence from either alone, and "a second model actually looked at this" is true
of it in a way it is not of a single-engine pass. When one engine did both, say so — the
slots collapse to "run and verified by Claude Code (Opus 5)".

The slots are placeholders on purpose. Whichever engine ran is whatever step 3 actually
reached on this run — not whichever one a previous review named.

This is the **opposite** of the rule for commits, and the two get conflated. Commit
messages carry no trailers at all (see AGENTS.md), tool attribution among them, because a
trailer naming the tool biases the automated review that runs here. The review itself is
the one place attribution belongs — nobody is reviewing the review, and a generated review
passing as a human one is the thing that would actually mislead.

## Rank every finding

Open each inline comment with its severity, before the claim:

```
**major** — This loop cannot fail. The overlay holds exactly six tabbable...
```

- **major** — the change is wrong or will bite: a defect, a correctness or security
  problem, a test that passes for the wrong reason, something that breaks in production.
  The author should not merge without addressing it or arguing it down.
- **minor** — real but not blocking. Brittleness, a missing case, a config trap, docs the
  change now contradicts. Worth fixing, fine to defer, and fine to disagree with.
- **nit** — preference. Naming, phrasing, ordering, style the linter does not enforce.
  Explicitly optional: the author may close it without replying and owes no justification.

Ranking is what earns the right to raise everything. A nit labelled as a nit costs the
author two seconds; the same nit unlabelled, sitting beside a real defect, makes them
weigh both equally and resent the review. So rank honestly in both directions — inflating
a nit to minor to get it fixed is how the labels stop being believed.

## Length

**Inline comments are unbounded.** Give a finding the words it needs to be verifiable:
the mechanism, the failing case, the fix. A comment nobody can check is one the author has
to re-derive, and that costs more than the reading.

**The summary is what has a budget — around 150 words**, checked with `wc -w`, not by eye.
It is a landing page, not a recap, and holds exactly four things in this order:

1. The attribution line (see **Attribution**).
2. The verdict.
3. The count by severity — "1 major, 3 minor, 1 nit".
4. The single most useful next action.

The findings are already on the lines they concern, so restating them is pure duplication.

Findings you could not anchor to a line are the one thing that can overflow this. One or
two fit as a sentence each. More than that means the summary is not the right container:
post them as a separate PR comment and let the summary point at it, rather than spending
the budget everything else needs.

When it runs long, cut in this order:

1. Anything the inline comments already say.
2. Anything restating what the diff shows — the author wrote it.
3. Caveats and asides that change nothing about what the author will do.
4. Process narration: what was read, what was checked, what was considered and dropped.

## Conventions

- Default event is `COMMENT`. Only use `REQUEST_CHANGES` when explicitly asked — it blocks
  merge, and that is the human's call.
- Say what is wrong and why it bites, not just what to change.
- Let the severity labels carry the triage rather than piling on. Ranking a nit is what
  makes it cheap to raise; raising it twice is not.
- Pitch it for the person who wrote it, using the `author` from step 1. A first
  contribution and a senior's refactor need the same findings, not the same tone — lead
  with what the change gets right when it is someone's first. Do not guess at this: a
  senior's refactor opened with praise reads as condescension, which is worse than the
  neutral version. Unknown means neutral.
- Mark the review as automated and name the engine — see Attribution. No trailers on any
  commit that follows, though (see AGENTS.md) — that ban is on trailers as a category, not
  on tool attribution alone.
