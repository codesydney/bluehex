-- Seed data for a stack somebody boots. Runs automatically after every migration has
-- been applied — at the end of `pnpm db:reset` locally, and on the `supabase start` in
-- `.github/workflows/schema.yml`, which is what lets the schema suite assert against
-- these rows in CI. Never run against the hosted project.
--
-- What it carries today is `credential_catalogue`: the 24 real Claude credentials,
-- which `20260820201450_catalogues.sql` deliberately creates empty. Where that list
-- is permanently housed is still open — an admin surface, an API call, eventually a
-- migration — and this file is the provisional home precisely because it never runs
-- against the hosted project. Nothing loaded here can become a wrong credential name
-- in production, and nothing loaded here is permanent the way a migration is.
--
-- `supabase/seed/credential-catalogue.json` is the canonical record and the
-- statements below are one loader for it, kept honest by the drift test in
-- `tests/db/credential-catalogue-seed.test.ts`. Edit the JSON and this file
-- together; see `supabase/seed/README.md`.
--
-- Two things to hold to, as this file grows:
--
--   * Make it re-runnable. `db:reset` is the only path here, so a plain `insert` is
--     fine, but anything hand-run wants `on conflict do nothing`.
--   * Seed data is fake data, and this is the one place that is fine — it never leaves
--     a developer's machine. The "real people only" rule in AGENTS.md is about the
--     directory the public sees, not about local fixtures. Do not confuse the two by
--     seeding the hosted project.
--
-- The credentials below are the exception that proves the second rule rather than a
-- breach of it: they are real reference data, not a fixture, and they are here
-- instead of in migration history only because their permanent home is undecided.

-- ---------------------------------------------------------------------------
-- credential_catalogue
-- ---------------------------------------------------------------------------

-- The twenty Anthropic Academy courses published at https://anthropic.skilljar.com/
-- and the four Claude Certification exams published at
-- https://www.pearsonvue.com/us/en/anthropic.html, transcribed as those pages name
-- them and confirmed by Bluehex.
--
-- Three transcription decisions, so nobody re-derives them:
--
--   * `sort_order` restarts at 0 per source, matching how a grouped picker renders
--     them. `unique (source, label)` does not constrain it, so the duplicate values
--     across the two sources are expected.
--   * The Pearson exam codes stay inside `label`. There is no code column and no
--     slug — the code is Pearson's own public name for the exam rather than an
--     identifier we invented.
--   * `AI Fluency for pK-12 Educators` is excluded. It is a path containing two
--     courses rather than a course, `CONTEXT.md` defines an entry here as a named
--     Anthropic Academy course or a named Claude Certification, and the two titles
--     it contains are not published on the page.
--
-- `active` takes its default for all 24: retirement is a flag flip, never a delete.
insert into public.credential_catalogue (source, label, sort_order) values
  ('Anthropic Academy', 'Claude 101', 0),
  ('Anthropic Academy', 'Claude Code 101', 1),
  ('Anthropic Academy', 'Claude Platform 101', 2),
  ('Anthropic Academy', 'Introduction to Claude Cowork', 3),
  ('Anthropic Academy', 'Claude Code in Action', 4),
  ('Anthropic Academy', 'AI Fluency: Framework & Foundations', 5),
  ('Anthropic Academy', 'Building with the Claude API', 6),
  ('Anthropic Academy', 'Introduction to Model Context Protocol', 7),
  ('Anthropic Academy', 'AI Fluency for educators', 8),
  ('Anthropic Academy', 'AI Fluency for students', 9),
  ('Anthropic Academy', 'Model Context Protocol: Advanced Topics', 10),
  ('Anthropic Academy', 'Claude with Amazon Bedrock', 11),
  ('Anthropic Academy', 'Claude on Google Cloud', 12),
  ('Anthropic Academy', 'Teaching AI Fluency', 13),
  ('Anthropic Academy', 'AI Fluency for nonprofits', 14),
  ('Anthropic Academy', 'Introduction to agent skills', 15),
  ('Anthropic Academy', 'Introduction to subagents', 16),
  ('Anthropic Academy', 'AI Capabilities and Limitations', 17),
  ('Anthropic Academy', 'AI Fluency for Small Businesses', 18),
  ('Anthropic Academy', 'AI Fluency for Builders', 19),
  ('Claude Certification', 'Claude Certified Associate - Foundations (CCAO-F)', 0),
  ('Claude Certification', 'Claude Certified Architect - Foundations (CCAR-F)', 1),
  ('Claude Certification', 'Claude Certified Architect - Professional (CCAR-P)', 2),
  ('Claude Certification', 'Claude Certified Developer - Foundations (CCDV-F)', 3)
on conflict (source, label) do nothing;
