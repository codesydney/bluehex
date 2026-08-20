# `supabase/seed/`

The canonical record of data that is real but has no permanent home yet.

## `credential-catalogue.json`

Every Claude credential that exists as at 2026-08-21 — the twenty Anthropic Academy courses published at <https://anthropic.skilljar.com/> and the four Claude Certification exams published at <https://www.pearsonvue.com/us/en/anthropic.html>, transcribed as those pages name them and confirmed by Bluehex.

**This file is the source of truth, and it is JSON rather than SQL because it is portable.** Where the catalogue is permanently housed is still open: an admin surface, an API call, eventually a migration. When that is decided, whatever loads it gets re-pointed at this file rather than retyping 24 strings — and retyping is the whole risk, because a wrong label is a wrong credential name displayed behind the Verified badge, which is the one thing the directory sells.

`supabase/seed.sql` is one loader for it, and the only one today. It runs on any stack somebody boots — at the end of `pnpm db:reset` locally, and on the `supabase start` in `.github/workflows/schema.yml` — and never against the hosted project, which is exactly why it is the right provisional home: nothing loaded there can reach production, and nothing loaded there is permanent the way migration history is. `20260820201450_catalogues.sql` still creates `credential_catalogue` empty on purpose — see the amendment in `docs/spec/profile-and-credentials.md`.

The two files are kept honest by `tests/db/credential-catalogue-seed.test.ts`, which reads this JSON, queries the database after a reset, and fails if they disagree. That drift guard is what makes a canonical record plus a separate loader safe to have at all. **Edit the JSON and `seed.sql` together.**

**`pnpm db:reset` is the only way to pick up an edit to these rows.** The loader is additive, not authoritative: its `on conflict (kind, platform, label) do nothing` makes a hand re-run exit clean rather than converge, so re-running it against an already-seeded stack keeps the old `sort_order` or `active` and, if a label changed, inserts the new row beside the stale one. That is deliberate — a loader that deleted or overwrote to converge would retire credentials people hold the moment this file went stale, and correcting a live catalogue is an admin `UPDATE` (`correct_catalogue_entry()` once there are claims against the entry), never a re-run of a seed file.

### Shape

An array, in the order a grouped picker renders it:

```json
{
  "kind": "course",
  "platform": "Anthropic Academy",
  "label": "Claude 101",
  "courseUrl": "https://anthropic.skilljar.com/claude-101",
  "sortOrder": 0
}
```

- `kind` and `platform` are the two axes #103 split out of the single `source` column, and each is one of the two values in its own `check` constraint: `kind` is `course` or `certification`, lowercase because it is a closed internal category; `platform` is `Anthropic Academy` or `Pearson VUE`, title case because it is a proper noun. The twenty courses are `course` on `Anthropic Academy` and the four certifications are `certification` on `Pearson VUE`, so the two axes happen not to cross here — that is what the catalogue contains today, not a rule.
- `courseUrl` is the page the entry is published on, and it is the one field that legitimately disagrees with `platform`: the four certifications are delivered by Pearson VUE while their pages live on `anthropic-partners.skilljar.com`, a partner Skilljar tenant rather than the Academy's. Three of the Academy slugs also do not match their titles — `Building with the Claude API` is at `claude-with-the-anthropic-api`, `Claude with Amazon Bedrock` at `claude-in-amazon-bedrock`, and `Claude on Google Cloud` at `claude-with-google-vertex`. Both are Anthropic's, and neither is a transcription error to tidy up.
- `sortOrder` restarts at 0 per platform. `unique (kind, platform, label)` does not constrain it, so the duplicate values across the two platforms are expected rather than a mistake to tidy up.
- There is no `active` key. All 24 take the column default, and retirement is an admin flag flip later — never a deletion, because someone earned it.
- The Pearson exam codes stay inside `label`. There is no code column and no slug; the code is Pearson's own public name for the exam rather than an identifier we invented.
- `AI Fluency for pK-12 Educators` is deliberately absent. It is a path containing two courses rather than a course, `CONTEXT.md` defines a catalogue entry as a named Anthropic Academy course or a named Claude Certification, and the two titles it contains are not published on the page.
