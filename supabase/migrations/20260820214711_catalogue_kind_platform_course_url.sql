-- `credential_catalogue.source` carried two axes at once. Its check constraint was
-- `check (source in ('Claude Certification', 'Anthropic Academy'))`, and those two
-- values are not the same kind of thing: `Claude Certification` names a credential
-- *kind* — the weight `CONTEXT.md` says the column exists to carry — while
-- `Anthropic Academy` names a *platform*. This splits them, and adds the link to the
-- page the entry is published on.
--
-- Reproduces the amended `credential_catalogue` DDL and grant block in
-- `docs/spec/profile-and-credentials.md`, which is normative. See #103.
--
-- Why now rather than after #50: #50 reads the weight axis to derive `certified`, and
-- it ships `catalogue_guard` and `correct_catalogue_entry()` against these column
-- names. Splitting first means it is written against the right shape once. Nothing
-- references a catalogue row yet — `practitioner_credentials` does not exist — and no
-- migration has reached the hosted project, so this is the cheapest this change will
-- ever be.
--
-- `kind` is lowercase because it is a closed internal category, following `status`'s
-- precedent in `20260819194255_profile_core.sql`. `platform` is title case because it
-- is a proper noun. Both stay check constraints rather than becoming rows: they are
-- genuine two-value axes, which is exactly the argument the spec makes for keeping
-- `source` in DDL while the labels became a table.
--
-- `platform` and `course_url` legitimately disagree on the four certifications: the
-- exam is delivered by Pearson VUE, while the page describing it lives on
-- `anthropic-partners.skilljar.com`, a different Skilljar tenant from the Academy.
-- That is the separation working rather than a data error, and it is the clearest
-- argument that the two are distinct facts.

-- ---------------------------------------------------------------------------
-- the two axes, and the link
-- ---------------------------------------------------------------------------

-- Added nullable, backfilled, then made `not null` — the table is not empty on any
-- stack that has run `supabase/seed.sql`, so a `not null` column cannot be added in
-- one statement without a default nobody wants left behind.
--
-- `course_url` is `public.https_url` rather than `text`, the domain created for the
-- published profile links in `20260819194255_profile_core.sql`: this column is
-- granted to `anon` and rendered as an `href`, which is the same exposure. It stays
-- **nullable** — an entry Bluehex knows of before its page exists is still a real
-- entry, and a placeholder URL would be worse than an absent one.
alter table public.credential_catalogue
  add column kind text
    check (kind in ('certification', 'course')),
  add column platform text
    check (platform in ('Anthropic Academy', 'Pearson VUE')),
  add column course_url public.https_url;

update public.credential_catalogue
   set kind     = case source
                    when 'Claude Certification' then 'certification'
                    when 'Anthropic Academy'    then 'course'
                  end,
       platform = case source
                    when 'Claude Certification' then 'Pearson VUE'
                    when 'Anthropic Academy'    then 'Anthropic Academy'
                  end;

alter table public.credential_catalogue
  alter column kind set not null,
  alter column platform set not null;

-- Dropping the column takes `unique (source, label)` and the two-value check with
-- it, which is why the replacement constraint is added after rather than before.
alter table public.credential_catalogue
  drop column source;

-- `unique (source, label)` becomes `unique (platform, label)`: the same label on the
-- same platform is a duplicate, and it is still what stops two admins adding the same
-- course twice. The same label as both a course and a certification is not a
-- duplicate, so `kind` is deliberately not in it.
alter table public.credential_catalogue
  add constraint credential_catalogue_platform_label_key unique (platform, label);

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- The half that fails silently. Reads on this table are column-scoped, and a column
-- added by `alter table` inherits nothing: without the line below `kind`, `platform`
-- and `course_url` are invisible to `anon` and `authenticated`, and every query
-- naming one is refused with `42501 permission denied` before any policy is
-- consulted. It fails closed, which is the right way round, and it is silent, which
-- is why `tests/db/catalogues.test.ts` asserts the read rather than trusting this
-- line. The grant on `source` went with the column.
--
-- `select` only, and to `anon` as well as `authenticated` — the picker needs the
-- list, and so does a public profile rendering held credentials against the whole
-- set. No write on any of the three to `authenticated`: nobody but `bluehex_admin`
-- writes this table, and that omission is the entire enforcement of "a practitioner
-- cannot invent a credential". `bluehex_admin` holds table-level privileges, so the
-- new columns are already covered there.
grant select (id, kind, platform, label, course_url, active, sort_order)
  on public.credential_catalogue to anon, authenticated;
