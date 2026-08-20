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
--   * Make it re-runnable, and know what that buys. Both paths above hand this file a
--     database the migrations have just created, so `on conflict do nothing` is not
--     what makes `db:reset` or `supabase start` work — it is what makes a hand-run
--     harmless. And harmless is all it is: the loader is additive, never convergent.
--     A re-run inserts what is missing and skips what conflicts, so it cannot carry an
--     *edit* across. An edited row reaches an already-seeded stack through
--     `pnpm db:reset` and by no other route; a correction to a live catalogue is an
--     admin `UPDATE`, per `docs/spec/profile-and-credentials.md`.
--   * Seed data is fake data, and this is the one place that is fine. It runs on a
--     developer's machine and on a CI runner, and never against the hosted project —
--     that last clause is the line, not the machine. The "real people only" rule in
--     AGENTS.md is about the directory the public sees, not about local fixtures. Do
--     not confuse the two by seeding the hosted project.
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
-- Four transcription decisions, so nobody re-derives them:
--
--   * `sort_order` restarts at 0 per platform, matching how a grouped picker renders
--     them. `unique (kind, platform, label)` does not constrain it, so the duplicate values
--     across the two platforms are expected.
--   * The Pearson exam codes stay inside `label`. There is no code column and no
--     slug — the code is Pearson's own public name for the exam rather than an
--     identifier we invented.
--   * `AI Fluency for pK-12 Educators` is excluded. It is a path containing two
--     courses rather than a course, `CONTEXT.md` defines an entry here as a named
--     Anthropic Academy course or a named Claude Certification, and the two titles
--     it contains are not published on the page.
--   * Three `course_url` slugs deliberately do not match their titles —
--     `Building with the Claude API` is published at `claude-with-the-anthropic-api`,
--     `Claude with Amazon Bedrock` at `claude-in-amazon-bedrock`, and
--     `Claude on Google Cloud` at `claude-with-google-vertex`. Those are Anthropic's
--     URLs; do not "fix" them to match the label.
--
-- The four certifications carry `platform = 'Pearson VUE'` and a `course_url` on
-- `anthropic-partners.skilljar.com`. That disagreement is the two axes working rather
-- than a data error: the exam is delivered by Pearson VUE, and the page describing it
-- lives on a partner Skilljar tenant, which is a different tenant from the Academy.
-- It is the clearest argument that platform and page are distinct facts.
--
-- `active` takes its default for all 24: retirement is a flag flip, never a delete.
--
-- The `on conflict (kind, platform, label) do nothing` below is additive, per the header: it
-- makes a hand re-run exit clean, not converge. Edit any of these rows and pick the
-- change up with `pnpm db:reset` — a re-run skips the conflicting row and keeps the old
-- value, and an edited *label* no longer matches the conflict target at all, so it
-- inserts beside the stale one. `do update` would not close that second hole either.
insert into public.credential_catalogue (kind, platform, label, course_url, sort_order) values
  ('course', 'Anthropic Academy', 'Claude 101',
   'https://anthropic.skilljar.com/claude-101', 0),
  ('course', 'Anthropic Academy', 'Claude Code 101',
   'https://anthropic.skilljar.com/claude-code-101', 1),
  ('course', 'Anthropic Academy', 'Claude Platform 101',
   'https://anthropic.skilljar.com/claude-platform-101', 2),
  ('course', 'Anthropic Academy', 'Introduction to Claude Cowork',
   'https://anthropic.skilljar.com/introduction-to-claude-cowork', 3),
  ('course', 'Anthropic Academy', 'Claude Code in Action',
   'https://anthropic.skilljar.com/claude-code-in-action', 4),
  ('course', 'Anthropic Academy', 'AI Fluency: Framework & Foundations',
   'https://anthropic.skilljar.com/ai-fluency-framework-foundations', 5),
  ('course', 'Anthropic Academy', 'Building with the Claude API',
   'https://anthropic.skilljar.com/claude-with-the-anthropic-api', 6),
  ('course', 'Anthropic Academy', 'Introduction to Model Context Protocol',
   'https://anthropic.skilljar.com/introduction-to-model-context-protocol', 7),
  ('course', 'Anthropic Academy', 'AI Fluency for educators',
   'https://anthropic.skilljar.com/ai-fluency-for-educators', 8),
  ('course', 'Anthropic Academy', 'AI Fluency for students',
   'https://anthropic.skilljar.com/ai-fluency-for-students', 9),
  ('course', 'Anthropic Academy', 'Model Context Protocol: Advanced Topics',
   'https://anthropic.skilljar.com/model-context-protocol-advanced-topics', 10),
  ('course', 'Anthropic Academy', 'Claude with Amazon Bedrock',
   'https://anthropic.skilljar.com/claude-in-amazon-bedrock', 11),
  ('course', 'Anthropic Academy', 'Claude on Google Cloud',
   'https://anthropic.skilljar.com/claude-with-google-vertex', 12),
  ('course', 'Anthropic Academy', 'Teaching AI Fluency',
   'https://anthropic.skilljar.com/teaching-ai-fluency', 13),
  ('course', 'Anthropic Academy', 'AI Fluency for nonprofits',
   'https://anthropic.skilljar.com/ai-fluency-for-nonprofits', 14),
  ('course', 'Anthropic Academy', 'Introduction to agent skills',
   'https://anthropic.skilljar.com/introduction-to-agent-skills', 15),
  ('course', 'Anthropic Academy', 'Introduction to subagents',
   'https://anthropic.skilljar.com/introduction-to-subagents', 16),
  ('course', 'Anthropic Academy', 'AI Capabilities and Limitations',
   'https://anthropic.skilljar.com/ai-capabilities-and-limitations', 17),
  ('course', 'Anthropic Academy', 'AI Fluency for Small Businesses',
   'https://anthropic.skilljar.com/ai-fluency-for-small-businesses', 18),
  ('course', 'Anthropic Academy', 'AI Fluency for Builders',
   'https://anthropic.skilljar.com/ai-fluency-for-builders', 19),
  ('certification', 'Pearson VUE', 'Claude Certified Associate - Foundations (CCAO-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-associate-foundations-certification', 0),
  ('certification', 'Pearson VUE', 'Claude Certified Architect - Foundations (CCAR-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification', 1),
  ('certification', 'Pearson VUE', 'Claude Certified Architect - Professional (CCAR-P)',
   'https://anthropic-partners.skilljar.com/claude-certified-architect-professional-certification', 2),
  ('certification', 'Pearson VUE', 'Claude Certified Developer - Foundations (CCDV-F)',
   'https://anthropic-partners.skilljar.com/claude-certified-developer-foundations-certification', 3)
on conflict (kind, platform, label) do nothing;
