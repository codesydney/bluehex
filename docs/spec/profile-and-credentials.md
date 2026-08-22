# Profile and credential model

The technical design for [#9](https://github.com/codesydney/bluehex/issues/9) — the
blocker on the first migration. Built inline during a grill-spec session.

Binding context, already settled: `docs/profile-lifecycle.md` (spike #35) owns the
lifecycle, the roles and the write path, and every claim in it was proved against the
local stack. `CONTEXT.md` owns the vocabulary. This document owns what a profile
*contains* and how ownership works.

## System architecture

### Ownership: a profile may exist before its owner does

**Decided.** `user_id` is **nullable**. Two ways a profile comes into existence, and
they are not symmetric:

| | who creates it | `user_id` at creation |
| --- | --- | --- |
| **Self-service** — the normal path | the practitioner, signed in | their own account, always |
| **Curated intake** — the bootstrap | Bluehex | null; the profile is unclaimed |

A practitioner **cannot** create an unclaimed profile. This needs no new mechanism:
the insert policy is already `with check (auth.uid() = user_id)`, so a signed-in user
can only insert a row they own, and `null` fails that check. Only `bluehex_admin` can
write a row with no owner.

Three properties fall out for free, which is why this shape was chosen over the
alternatives:

- **`unique (user_id)` still means one profile per account.** Postgres allows many
  nulls in a unique index, so any number of profiles can be unclaimed while no
  account can have two.
- **Unclaimed profiles are invisible and unwritable to every practitioner.**
  `auth.uid() = user_id` evaluates to null, not true, when `user_id` is null — so the
  owner policies exclude them without a single extra clause. It fails closed.
- **An unclaimed profile can still be `approved` and publicly visible**, which is the
  entire point of curated intake: the directory fills up before self-service ships.

**Rejected: creating an account for each curated practitioner at intake** so that
`user_id` could stay `not null`. It would have deleted the claim path entirely, which
is genuinely attractive, but it means making accounts for people who did not ask for
one. Not worth the surface it saves.

**Rejected: `user_id not null` with curated profiles staying in the typed array.** The
directory would then have two sources during the whole of the transition, and #35's
schema could not seed the profiles that exist today.

### Claiming: an admin assigns the owner

**Decided.** An unclaimed profile gains its owner by an admin setting `user_id` — an ordinary `PATCH`, with no RPC in the path. `practitioners_guard` stamps `owner_assigned_at/by` from `auth.uid()` on any change to `user_id`, so the provenance is written whether or not the caller thought about it.

That is a deliberate reversal of an earlier draft, which put the claim behind `assign_profile_owner()`. An RPC is bypassable by anyone holding the `update` grant, so it recorded provenance only for callers who chose to use it; the trigger records it for everyone. The RPC was doing no other work.

**A profile cannot change owners.** `user_id` has three transitions and the guard refuses one of them outright:

| transition | meaning | verdict |
| --- | --- | --- |
| `null → A` | claiming an unclaimed profile | legal, and clears the badge |
| `A → null` | the account was deleted, or an admin unassigns | legal, and forces `withdrawn` |
| `A → B` | — | **refused** |

This is a state machine, not a permission. A profile is a record *about a person*, and there is no story in which the record about one person legitimately becomes another person's account's. Treating it as a privilege to withhold leads to warning dialogs and audit columns defending an operation that should not be expressible; refusing it in the trigger costs four lines and holds for admins too.

A mis-assignment is still recoverable without database access: unassign (`A → null`, which withdraws the profile while its ownership is in question), then claim it to the right account.

### The claim is checked against the contact email

**Decided.** An unclaimed profile is claimed by matching the claimer's **verified** account email against `practitioner_contacts.contact_email` — the address the practitioner actually replied from during curated intake.

No new column: requiring a contact row at profile creation means Bluehex already recorded that address, and it is already the one they corresponded with. An earlier draft proposed a separate `claim_email`; two email columns identical in almost every row is the "two representations of one fact that can disagree" this document rejects `certified` for.

The reason it works as a lock is that it is not editable by the person who wants to claim — an unclaimed profile has no owner, so every owner policy evaluates to null and only admins can touch it at all. What that leaves is an admin editing the address, so **changing `contact_email` while the profile is unclaimed clears verification**, the same way a rename does. See Triggers.

**Known limitation: GitHub OAuth returns a `no-reply` address**, which can never match. Those practitioners claim by signing in with magic link instead, or an admin overrides — and the override is exactly where social engineering comes back, so it is a human check rather than a mechanism.

**Deferred: practitioner self-claim.** The "we have a profile for you" prompt after sign-up. The matching logic is now specified, so what remains is the prompt and the flow rather than the hard part. Not now, because curated intake is a bootstrap: a handful of profiles, all of them already getting a human's attention during verification.

**Gate:** revisit when either is true — **(a)** an unclaimed profile exists that Bluehex did not write, or **(b)** more than ten profiles are unclaimed at once. Either means intake has outgrown the bootstrap and the admin step stops being a minute's work.

## Credentials

### One entity, a child table, and deliberately narrow

**Decided.** A credential is a row in `practitioner_credentials`, a child of the
profile. Claude Certifications and Anthropic Academy certificates are the *same*
entity distinguished by `kind` — both come from Anthropic and both are checked by the
same human doing the same thing. They differ in weight, and weight is a property rather
than a type. (`kind` was called `source` until #103, which split
the weight axis from the `platform` that was sharing the column with it — see the
`credential_catalogue` DDL.)

**A child table rather than `jsonb`,** because credentials are what the badge attests
to. They need their own grants and their own trigger, and a `jsonb` column would make
the badge-clearing rule diff two documents while making every credential writable
whenever any of them is.

**One claim in the earlier draft of this section has been withdrawn**, because it is
not true of Claude Certifications: they do *not* all "arrive through Skilljar, evidenced
by a share URL". The Certifications are examined through Pearson VUE, and how a pass is
evidenced is not yet known — see "Evidence is a URL" for what that does and does not
change. The two are still one entity; the shared *delivery mechanism* was never what made
them one, and citing it as though it were would have made this decision look contingent on
a fact that has since moved.

### The catalogue: a practitioner names a credential, and cannot describe one

**Decided.** `credential_catalogue` is a Bluehex-owned table listing every Claude
credential that exists — each Anthropic Academy course and each Claude Certification, one
row apiece. `practitioner_credentials.catalogue_id` references it, and **`kind` and
`label` leave the practitioner's row entirely.** A practitioner picks from a list; there
is no free text anywhere in a credential.

**This closes a gap rather than adding a feature.** `CONTEXT.md` has always said the word
is deliberately narrow, and that "widening this term silently widens what the Verified
badge asserts". Nothing enforced it. `label` was free text against a two-value axis,
so `AWS Solutions Architect` filed under `Anthropic Academy` was a legal row that rendered
in the credentials block on the page whose entire job is credibility. The narrowness was
prose with no mechanism — the same failure `AGENTS.md` names on `verified`, where the
policy that reads correctly and enforces nothing is the one that passes review.

**A table, not a widened check constraint**, and this supersedes the reasoning that put
the axis in a check constraint in the first place. That argument was right about which
axis moves — Anthropic ships new credentials — and drew the wrong conclusion from it at
this cardinality. Two values are a constraint; roughly two dozen named courses
growing on somebody else's release schedule are data, and holding them in DDL means a
migration every time Anthropic publishes a course. `status` stays an enum for the reason
it always did: it grew once, and that is growth a deliberate migration should announce.

Three things fall out, and they are why this is worth more than the validation:

- **Weight becomes a property of the entry**, so a row claiming
  `platform = 'Anthropic Academy'` with `label = 'Claude Certification'` stops being
  representable. Two representations of one fact that can disagree — the objection that
  removed `certified` — applied here too and was not noticed.
- **`unique (practitioner_id, catalogue_id)`** becomes expressible: you cannot claim the
  same credential twice. Free-text labels could never support that, because
  `Prompt engineering` and `Prompt Engineering` are different strings.

  **It does not address credential theft, and it is easy to read as though it does.** The
  constraint is scoped to one practitioner, so two *different* practitioners claiming the
  same catalogue entry is legal — as it must be, since that is what happens every time two
  people pass the same course. The attack the review queue records as its known gap is one
  person submitting somebody else's certificate, and that is the same catalogue entry with
  a different `evidence_url`, which nothing here refuses. The catalogue narrowed what can
  be claimed; it did nothing about whose evidence backs the claim.
- **Progress becomes derivable**, which is what removes in-progress rows from the model
  entirely. See below.

**Bluehex maintains it, and that is a real cost, stated rather than discovered.** A course
Anthropic ships is unclaimable until somebody adds a row. That is an admin insert, not a
migration or a deploy — but it is a standing obligation on a human, and the failure mode
is a practitioner who cannot enter a credential they hold. Mitigated only by it being
visible: they will say so.

**Deferred: retiring an entry.** Anthropic will withdraw a course eventually, and the
people who earned it still earned it. An `active boolean` hides an entry from the picker
without invalidating existing claims, which is the right shape — included in the DDL below
because it costs one column now and a data migration later. What is *not* decided is what
a retired entry looks like on a profile. **Gate:** the first withdrawn course.

**Rejected: letting practitioners propose entries.** It reintroduces free text through a
queue, and the queue is the expensive part. Bluehex adds the row; a practitioner emails.

### Progress is derived from the catalogue, and in-progress rows are removed

**Decided, and it reverses an earlier decision in this document.** `earned_at` becomes
`not null`. There is no such thing as a credential row for something a practitioner has
not earned. What replaces it is **progress**: the catalogue is a known set, a profile
holds a subset of it, and "2 of 23" is a fact computed by comparing them — no row, no
column, no claim.

Two arguments arrived from opposite directions and resolve to the same schema.

**Against in-progress rows**, from the review-queue prototype: an in-progress credential
is a free, unfalsifiable claim rendering in the credentials list wearing the same row
shape as one a human checked. Skilljar issues a certificate on completion and there is no
public proof of enrolment, so nothing can ever check it and it never resolves — an entry
made in 2026 still reads "working towards" in 2028. Structure that cannot be verified,
sitting beside structure that was, is the confusion.

**For showing unearned credentials**, from the director's feedback: a practitioner working
through the Academy wants to see the whole track and their place in it, and that is
motivating rather than decorative. Making progress visible is a reason to come back.

**The catalogue satisfies the second while deleting the first**, which is why this is a
resolution rather than a trade. Every credential that exists is already a row Bluehex
wrote; showing a practitioner the ones they do not hold requires no assertion *from* them.
You cannot claim to be working on something, because there is nothing to write — the
surface renders the catalogue and marks what is held. The unfalsifiable claim disappears
and the motivational surface is strictly better, since it shows the whole track rather
than only the parts somebody remembered to type in.

**It also deletes machinery instead of adding it.** The review queue's rule that "a
profile with only in-progress credentials has nothing to verify, ever" existed to stop the
queue showing a permanently unclearable item. Remove the premise and the rule has nothing
left to warn about: every credential row is earned, therefore checkable. `evidence_url`
stays nullable for a different and narrower reason — an earned credential whose holder has
not supplied proof yet, which is approvable, never badgeable, and not a rejection.

**What is given up**, stated because it is a real loss and the mitigation is weaker than
the thing it replaces: a practitioner can no longer say *which* credentials they are
working towards, only that they hold the ones they hold. The bio carries it — "working
through the Academy track on weekends" is already sayable, already free text, and already
correctly framed as the practitioner's own words. That is less structured than a row, and
that is the point: an unverifiable claim should not have the same shape as a checked one.

### Where progress may be shown, and what it may be called

**Decided.** Progress is derived, so all of this is presentation with no schema
consequence — but it was settled before being drawn rather than after, because two of the
three surfaces get it wrong by default.

| surface | what it shows |
| --- | --- |
| **Directory roster** | held credentials only. No catalogue, no counts, no progress figure. |
| **Profile page** | held credentials by default, with a control revealing the rest — **Earned** / **Not earned** / **All**. |
| **Editor** | progress against the whole catalogue. |

**The roster carries none of it because of space.** The catalogue is roughly two dozen
entries; rendering it under every practitioner buries the credentials somebody actually
holds in a list of the ones they do not. The roster is dense on purpose and that is the
property to protect.

**The profile page defaults to Earned rather than All** for the same reason it exists at
all: a visitor opening a profile is deciding whether to enquire, and the honest answer to
that is what the person holds. The rest of the catalogue is available to anyone who wants
the context, one control away, and defaulted off.

**"2 of 23" reads as encouragement on your own editor and as 9% to an employer**, which is
why the figure itself lives on the editor. Same number, different reader, opposite effect.

**The label is load-bearing: unearned entries must never be called "in progress".** This is
the argument that removed in-progress rows, arriving one layer up in the UI, and it is
easy to miss because "in progress" is the natural English for the state being rendered.
A credential row saying "working towards" was at least an opt-in claim by the practitioner.
A *page* that labels every unheld catalogue entry "in progress" makes the same
unfalsifiable claim automatically, on their behalf, about credentials they have never
opened — asserting that somebody with two certificates is working on the other twenty-one.
That is strictly worse than what was deleted.

So the vocabulary is **Earned / Not earned / All**, or any phrasing that describes the
record rather than the person's intent. Anything implying effort, enrolment or intention
reintroduces the claim the model exists without.

### Not generalised to other kinds of qualification

**Decided.** A university degree, or any non-Anthropic certification, is not a
credential and does not go in this table. If it is ever wanted it is a **sister
feature** with its own table.

The reason is the badge rather than the schema. `verified` means "Bluehex checked the
credentials on this profile". Put a degree in the same table and that one boolean
silently starts asserting that Bluehex checked a university registrar — a different
check, by different people, against different evidence. The badge is the product, so
widening what it covers by accident is the expensive mistake. Positioning is also
decided: Claude and Anthropic focused for roughly the next two years.

**Deferred: what the badge means once a sister feature exists.** One profile-level
boolean cannot say "Claude credentials checked" and "degree checked" separately. Not a
problem today, and not worth a second column now.

**Gate:** the first sister-concept table. If non-Claude qualifications are ever built,
`verified` must be re-read before that work starts — not after.

### Consequence: the guard trigger from #35 is incomplete

Moving credentials off the profile row moves the attested content off the row the
guard trigger watches. `docs/profile-lifecycle.md` clears `verified` when `name` or
`certified` changes; with a child table, **adding or editing a credential would not
clear the badge**, which is the exact failure the rule exists to prevent.

So the child table needs its own trigger. **Superseded in part by the decision below to
verify per credential:** with `verified` living on the credential row, that trigger is an
ordinary `before update` on its own row — #35's pattern exactly, no privileged function.

The privileged function did not disappear, it changed direction. `name` is still attested
and still lives on the parent, so a rename must clear verification on every credential —
parent to child, and a practitioner has no privilege to write `verified` there. That is
`practitioners_rename_clears_credentials`, one of the two `security definer` functions in
the design (the other is `withdraw_profile()`), and it only ever sets the flag false.

### Evidence is a URL, and only a URL

**Decided.** `evidence_url`, nullable, on the credential row. The practitioner pastes
their certificate or share URL; a human at Bluehex opens it, reads the name on it, and
sets `verified`. Nullable because an earned credential whose holder has not supplied proof
is a real state — approvable, never badgeable, and not a rejection. It is no longer
nullable on account of in-progress credentials, which no longer exist.

Three things deliberately **not** built, recorded so the argument does not have to be
had twice:

- **No file upload.** Screenshots and PDFs were floated in #10. That is a Storage
  bucket, bucket policies, a size and type gate, and a moderation surface — for
  evidence a human reads once. A URL does the same job with no new subsystem.
- **No host validation**, and this got *stronger* rather than weaker. The original reason
  was that Skilljar serves tenants on custom subdomains and CNAMEs, so the host belongs to
  Anthropic and can move on their schedule. The Certifications being examined through
  Pearson VUE means the evidence for them will not be on a Skilljar host at all, so a host
  allow-list would have had to be widened before the first Certification could be entered.
  Check it is a URL; let the human read it.
- **No parsed credential ID.** Its only real benefit is catching two people submitting
  the same certificate, which the human check already catches — they can see whose name
  is on it. Structure that duplicates a check already being performed is not worth a
  column.

**Open, and it belongs to whoever enters the first Claude Certification: what a Pearson
VUE pass is evidenced *by*.** Skilljar issues a shareable certificate page and this design
rests on there being one. Whether a Pearson VUE result produces a public URL — a Credly
badge, a score report, anything linkable — is not known here and should not be guessed. If
it turns out there is no such URL, "evidence is a URL, and only a URL" does not survive
contact with the higher-weight half of the catalogue, and that is a spec change rather
than a workaround. **Gate:** the first practitioner to earn one. Nothing before then
depends on the answer, since nobody in the community holds one yet.

### `certified` is derived, not stored

**Decided.** The profile has no `certified` column. It is "has a credential whose
catalogue entry carries `kind = 'certification'`", derived from rows the
directory card is already embedding in order to list them. Every credential row is earned
now, so there is no second condition to test.

`AGENTS.md` defines `certified` as the practitioner's own claim to hold a Claude
Certification — and a credential row *is* that claim, since practitioners enter their
own credentials. Storing it as well means two representations of one fact that can
disagree, and the disagreement surfaces as a card claiming certification while listing
none, on the page whose entire job is credibility.

The derivation now reads `kind` off the catalogue rather than off the credential, which
is a second place the same duplicated-fact objection was quietly applying and is now
closed — see the catalogue decision above.

`AGENTS.md` has been reworded accordingly — the invariant is that the two *ideas* stay
separate, one self-asserted and one attested by Bluehex. The second column was never
the invariant.

### No slugs, and no profile identity problem

> **The gate below has been crossed, and #119 settled what was behind it.** #118 opened the public per-profile route; #119 made the identifier a `not null unique` `handle` column and removed the slug outright. The settled decision is *The identifier is `handle`* further down this file, and it is the binding one. What follows is the record of why the question was deferred rather than answered early, which is still worth reading — the deferral was correct, and the reasoning is what stopped a slug scheme being invented before anything needed one.

**Decided by inspection.** `src/app/` has two routes, the home page and contact, and
nothing in `practitioner-directory.tsx` links a card anywhere. Profiles render inline on
the directory; there is no profile URL, so there is nothing for a slug to name and
nothing for a name change to break. #9's identity question has no subject.

**Gate:** the first per-profile route. A profile page needs a stable identifier that is
not the display name, and that decision should be made when the page is, not before.

**Gate resolved in #119**, and the answer went further than "not the display name": the identifier is not derived from any other column at all. The intermediate scheme — six characters of the row's uuid, with a name slug in front of them — satisfied this gate's literal wording and still failed, because nothing enforced that two profiles could not take the same six characters. A stable identifier has to be a *unique* one, which is a promise only the schema can make.

## What the badge attests to, and why edits are not locked

**Decided.** `verified` attests to **evidence-backed claims only** — the credentials,
the education if a sister feature is ever built, and the `name` those are attached to.
It never attests to self-described expertise: `bio`, `headline`, `focus`, `services`,
`availability`, `location` and the published links — `website_url`, `github_url`,
`linkedin_url`, `booking_url` — are outside it and always will be. The links are the case worth stating, because a repository
or a portfolio site looks like evidence of work and is not evidence *Bluehex checked*. See
"links may be published" under Contact.

The principle is that Bluehex can only vouch for what a human can check. A certificate
can be opened and read; a degree can be checked against a registrar. "Good at RAG
pipelines" has no evidence to read, and a badge implying otherwise would assert
something Bluehex has no method for — which damages it more than a narrow badge does.

This retires the deferred question about a sister feature: **one badge covers every
evidence-backed table**, and each such table carries its own clearing trigger. Degrees
still live in their own table because the evidence and the check differ; the badge
covering both is a deliberate widening rather than the silent one that was objected to.

### The bug this fixes

#35's clearing rule watched `name` and `certified`. `certified` is now derived and the
credentials have moved to a child table, so **as written it watches nothing that can
carry a misrepresentation.** A practitioner verified on one Academy certificate could
rewrite `focus` to list five specialisms and keep the badge. The attested set above
replaces it.

### Edits are not locked

**Rejected: locking a profile after approval.** It would freeze every published profile
and make Bluehex the editor of record for other people's copy.

**Rejected: locking a profile after verification.** Defensible, and expensive in exactly
the way #35 escaped: a typo fix needs a human, verified practitioners cannot maintain
their own profiles, and the queue is permanent. It also does not resolve cleanly — an
unlock still has to decide what happens to the badge.

Instead:

- **Automatic clearing stays narrow.** The badge drops when the attested content
  changes, and only then. Everything else is freely editable and the profile stays up.
- **Drift is detectable for free.** `updated_at > verified_at` means "edited since we
  checked it" — no new column, and it gives Bluehex a review queue over every verified
  profile that has changed. An admin edit bumps `updated_at` too, so the queue has some
  false positives; at this volume that is cheaper than a column to suppress them.
- **Misrepresentation is an admin action, not a schema rule.** Status goes back to
  `pending` or `rejected`, which takes the profile down. Already decided in #35.

### The mitigation that is not in the schema

The badge belongs **next to the credentials on the card, not next to the person's
name**. A narrow badge placed where it reads as a whole-profile endorsement is
misleading no matter what the clearing rule does, and no schema rule can fix that
reading. This is a UI constraint that the directory work inherits.

Accepted consequence: `services` drives the directory's filtering and is never vetted,
with `focus` beside it on the profile in the same condition. That is how every directory
works, and the badge does not claim otherwise — but it is the reason the badge's placement
is load-bearing rather than cosmetic, and `services` sharpens it, because a visitor
filtering by "code review" and landing on a badged profile is one step from reading the
badge as Bluehex endorsing the service.

## Verification is per credential; the badge is a binary rollup

**Decided.** `verified`, `verified_at` and `verified_by` live on the **credential row**,
not the profile. The profile-level badge is **derived**, not stored — consistent with
`certified`.

The decisive argument is the incentive. Under a profile-level flag, adding a third
credential to a verified profile drops the whole badge until someone re-checks all
three — punishing practitioners for doing the thing the directory wants. Per credential,
the new row is unverified and the others are untouched. It also matches the workflow:
Bluehex checks certificates one at a time, and "three credentials, two checked" is a
real state a single boolean cannot hold.

`approved_at` / `approved_by` stay on the profile. That is `status`, a different axis.

They mean **currently approved, by whom, when**, and `practitioners_guard` is what makes that true rather than `approve_practitioner()`: the RPC is not the only door, because an admin holds `update (status)` and the ownership flow needs it to. So the trigger stamps both when a row arrives at `approved` down any path, and clears them when it leaves. #49 settled this — before it, a profile approved and then rejected kept the stamp and went on claiming an approval that had been taken back, which is what a review queue sorts on.

**The rollup rule:** the badge shows when the profile has **at least one credential and
every credential is verified**. It got simpler when in-progress rows were removed — the
rule used to carve them out explicitly, because a credential that could never be verified
would otherwise have denied the badge permanently to the group the directory exists to
include. There is nothing left to carve out: every credential row is earned and therefore
checkable, and a practitioner with nothing earned has no credentials rather than
unverifiable ones.

An earned credential with no `evidence_url` is the case that now carries that weight, and
it behaves differently on purpose: it *is* in the rollup, so it holds the badge back until
proof is supplied. That is correct — the practitioner can act on it, where nobody could
ever act on an in-progress row.

**Rejected: a "partially verified" badge.** #10 is explicit that a lesser badge must be
unmistakably different from a verified one or it devalues the real ones by association —
and in a grid of cards, two pills with ticks are not unmistakably different. It is also
gameable in the wrong direction: if partial still shows a badge, the incentive is one
real credential plus padding. A binary badge makes padding cost the mark outright.

Instead the nuance is shown per credential, which is strictly more information than the
word "partial" and cannot be misread as a whole-profile endorsement. If a
profile-level summary is wanted it should read as a **fact, not a badge** — "2 of 3
credentials verified". Facts do not get confused with endorsements.

**The principle:** *all nuance lives on the credential row; the profile badge stays
binary.* Partial verification and mixed credential sources are credential-level states.

**#10's "in progress" requirement is met by the catalogue, not by a credential row** —
this is the half of the principle that changed. It used to be answered by a credential
with no `earned_at`, shown as such and never touching the badge. It is now answered by
showing the catalogue with the practitioner's holdings marked against it, which delivers
the same visibility without anybody asserting anything unverifiable. See "Progress is
derived from the catalogue".

This is derived state, so partial-vs-binary is a presentation decision with **no schema
consequence**. It does not block the migration.

**Gate for materialising the rollup into a column:** when the directory stops fetching
every profile and needs to filter server-side. It is a client component filtering an
array today.

## What a practitioner offers: services, focus, availability

### `services` is the directory's axis; `focus` stays and is demoted

**Decided.** Services become what the directory filters on. `focus` survives unchanged as
free text and moves to the profile page. **`job_function`, proposed in the editor prototype
and never in this document, is dropped.**

*The storage described in this section — `services text[]` with a closed check constraint —
is superseded two sections down, where practitioners gain the ability to add their own. The
reasoning here is what survives; read it first, because the revision depends on it.*

Three taxonomies were live in one space, which is why this was blocking #49:

| | answers | verdict |
| --- | --- | --- |
| `focus` — free `text[]` | what do they *know* — Agents, MCP, RAG | kept, demoted to the profile |
| `job_function` — closed, single | what *kind* of practitioner — Engineering, Design | **dropped** |
| `services` — closed, multiple | what can I *buy* — tutoring, code review | **the filter** |

**The deciding question is who is doing the filtering.** A visitor arrives to hire
somebody, not to survey the community's skill distribution, and "one-to-one tutoring" is
what they came to type. `focus` answers a question they did not ask: knowing RAG does not
say whether you can be hired for an afternoon. `job_function` answers an even more distant
one — "Engineering" describes what a practitioner *is*, which a visitor can neither buy nor
usefully narrow by, since almost everyone here would tick it.

`job_function` is dropped rather than kept alongside because it was proposed to solve
exactly the problem `services` solves better. Its own argument was that `headline` is prose
and `focus` is technology, so neither filters — true, and it identified a real gap while
naming the wrong closed set to fill it. Keeping both would put two closed vocabularies on
one screen with no answer to which a visitor should use, and the honest reason to prefer
`services` is that somebody who wants to *buy* asked for it.

**Closed set, for the reason `job_function` was closed:** free text does not filter,
because `1:1 tutoring`, `one-on-one tutoring` and `tutoring` are three chips with one
person behind each. The set is short on purpose — every extra option splits the same people
into smaller buckets until no chip has anyone behind it — and carries no "Other", which
reliably becomes the largest bucket and means nothing.

### Superseded: the closed set is stable keys, and a practitioner may add their own

**Decided 2026-08-16, and it revises the two decisions above rather than replacing this
section.** The set the directory filters on becomes `service_catalogue` — stable keys,
Bluehex-owned, the same shape as `credential_catalogue`. Separately, a practitioner may
write services of their own that Bluehex has not listed.

**What is kept from the argument above is the part that was actually load-bearing: the
*filter* must be a closed set.** Everything in this section about fragmentation still holds
word for word. What was wrong was the inference that therefore nobody may say anything
else — a practitioner whose offering is not on a six-item list currently has no way to
state it at all, and the list will always be missing something, because Bluehex is guessing
at other people's businesses.

So the two halves are separated, and the separation is the whole design:

| | where it lives | filters? |
| --- | --- | --- |
| **Catalogue services** | `practitioner_services.catalogue_id` → `service_catalogue` | **yes** — these are the roster's chips |
| **Custom services** | `practitioner_services.label`, free text | **no** — rendered on the profile only |

**Custom services never become filter chips**, and that is the line that keeps this from
undoing the decision it revises. The moment `one-on-one tutoring` typed by one person
raises a chip beside `One-to-one tutoring`, the roster fragments exactly as this section
warned and `services` stops being navigable — which was the entire argument for preferring
it to `focus`. A visitor filters on a vocabulary Bluehex controls; a practitioner describes
themselves in their own words on their own page. Both are true at once and neither costs
the other anything.

**Promotion is the path between them, and it is an admin action.** When a custom service
recurs across profiles, Bluehex adds it to `service_catalogue` and re-points the rows that
used it. That is how the catalogue learns what the market actually sells rather than what
Bluehex guessed, and it is a strictly better source of vocabulary than the original list —
the practitioners are the ones who know. Nothing automates it; it is a query an admin runs
when curious, and the same "the human looking is the product" reasoning applies as it does
to verification.

**Rejected: letting a practitioner insert into `service_catalogue` directly.** It is the
same rejection the credential catalogue made, for a different reason. There the concern was
the badge; here it is that a self-service write to the filter vocabulary *is* the
fragmentation, one indirection later. Writing a custom service is not a proposal to widen
the catalogue, and treating it as one would build a moderation queue nobody asked for.

**Why a child table rather than two array columns.** `services text[]` and
`custom_services text[]` side by side would work and was rejected: the cap has to span both
(three services means three, not three plus three), and a constraint spanning two array
columns is exactly the kind of rule that gets half-enforced. One row per service, one cap
over the row count, and a `check` that a row names a catalogue entry *or* carries a label
and never both.

**What this costs**, stated rather than discovered: a third child table, a join the roster
did not previously need, and distinctness no longer being sayable in one constraint — a
practitioner can now write a custom service whose text matches a catalogue label.
`unique (practitioner_id, catalogue_id)` covers the catalogue half and the `is_distinct`
helper is deleted, having lost the array column it was written for. The remaining half is
not preventable in the schema and is not worth preventing: it renders as a duplicate on one
profile, an admin sees it during review, and promotion fixes it permanently.

**Multi-select, and it needs a cap.** Unlike `job_function` this genuinely is plural: a
person does tutoring *and* code review, and forcing one would make the filter lie. That
reopens the failure `job_function` avoided by being single — everyone ticks everything, and
a filter that matches all rows narrows nothing. **Capped at three**, enforced by the
database rather than by the form, because a form-only rule is not a rule. Three is a
guess at the right number, and **the cap** — not this section — is the cheapest thing here
to change. *(~~by a check constraint~~ — superseded: it is a trigger, since the cap now
counts sibling rows. See `practitioner_services_cap`.)*

**~~The cap needs a distinctness test beside it, or it is not a cap.~~ Superseded — there
is nothing to deduplicate once each service is a row.** The original problem was that
`cardinality` counts elements rather than distinct ones and `<@` is containment, so
`['Code review', 'Code review', 'Implementation']` satisfied both halves of the array
check: the profile offered two services while consuming all three slots, and the directory
rendered the same chip twice on the axis it filters by. That needed an `immutable` helper,
`public.is_distinct(text[])`, because a check constraint may not contain a subquery.
`unique (practitioner_id, catalogue_id)` says the same thing directly now, and the helper
is deleted. Custom labels are deliberately *not* deduplicated — see the section above.

**~~`text[]` with a check constraint, not a catalogue table.~~ Superseded — it is a
catalogue table after all.** The original reasoning was that the credential catalogue
tracks *Anthropic's* releases and must change without a deploy, while the service list is
Bluehex's own vocabulary, changes when positioning changes, and is small — so growth in DDL
is appropriate when the growth is a decision.

That held right up until practitioners were allowed to add their own. Promotion means the
list now grows from **evidence about what people actually sell**, which arrives on nobody's
schedule and is not a positioning decision — so it has the property that argued for a table
in the first place. Recorded rather than rewritten, because the original argument was sound
and it is the *premise* that moved: the list stopped being Bluehex's alone.

**Empty is legal and normal.** A practitioner who has not said what they sell is a profile
that appears in the directory and matches no service filter. Requiring it would turn
publishing a profile into declaring a commercial offering, which is not what everybody is
here for.

**The badge does not cover this**, and it is worth saying plainly because `services` reads
more like a commitment than `focus` did: `verified` attests to credentials a human checked
and the name attached to them. Offering an engagement is self-asserted, unattested and
freely editable, exactly like `bio`. Editing it never clears the badge.

### `availability` is a sentence, not a calendar

**Decided.** `availability text`, nullable, free text, practitioner-writable, published.
"Evenings and weekends", "about 20 hours a week", "booked until March".

**This does not breach scope.md's marketplace exclusion, and the exclusion has been
reworded because it read as though it did.** What is excluded is availability as *state
the application maintains* — real slots, bookings, a calendar that can be wrong. A
sentence the practitioner typed is a fact they assert, on the same footing as `headline`,
and it is stale in the way every self-described field is stale rather than in the way a
double-booked slot is wrong. It passes the same test `booking_url` passed in ADR-0002: it
carries no state, and nothing in the app has to stay true.

**Free text rather than a closed set**, which is the opposite call to `services` two
sections up, and the difference is whether it filters. Nobody browses a directory by
availability — it is read once, after a visitor has already decided they are interested,
which is the profile page rather than the roster. A closed set buys filtering nobody wants
and loses "booked until March", which is the most useful thing anybody will write in it.

**Gate:** if availability ever becomes something a visitor filters or sorts on, it needs a
structured field beside this one and this becomes the note. Do not retrofit parsing onto
the free text.

## Contact: held in its own table, never published

**Decided.** A practitioner's email address and phone number never appear on the profile. Enquiries are made through the app: the existing `/contact` page, reached from the profile page, which prefills which practitioner the enquiry is about. Deliberately not from a directory row — one call to action per surface.

This decision originally excluded `website_url` / `github_url` / `linkedin_url` as well, on the grounds that they route around Bluehex as effectively as an address does. **That half was reversed on 2026-08-16** — see "links may be published" below. What survives is the part about addresses and phone numbers, and it is not weakened by the reversal.

**The enquiry form mails Bluehex, and only Bluehex.** Unchanged as a decision — but its *reason* has changed, and the old one should not be relied on again. It used to follow from there being no other route: the profile published nothing that reached a practitioner, so the form was the only way through and Bluehex was necessarily in it. Published links end that. A visitor who wants to go direct now can, through the practitioner's own LinkedIn, site or booking page.

So the form pointing at Bluehex is a **choice about what to build**, not a consequence of the profile withholding everything. Bluehex is not preventing direct contact and should not be described as though it were; it is declining to *publish personal contact details*, and running one enquiry route of its own.

**Deferred, and expected to come back: enquiries reaching the practitioner without a human in the middle.** Cut for now because it buys little a published LinkedIn does not, and costs a server-side send, a mail provider credential — the project's first secret — and abuse handling that protects the whole directory rather than one inbox. The `mailto:` stopgap survives only because the form's recipient is fixed; every option below ends it.

Three shapes, and they are not variations on one. Recorded now so a reversal argues between them rather than rediscovering them:

| | what the visitor's mail hits | costs | revocable |
| --- | --- | --- | --- |
| **Bluehex relay** — today | `info@code.sydney`, forwarded by hand | none; already built | n/a |
| **Direct** | `contact_email`, visitor in `Reply-To` | send path, first secret, abuse handling | no — the address is disclosed on first reply |
| **Proxied alias** | a Bluehex-controlled address that forwards | the above, plus *inbound* mail routing and an alias per profile | yes — rotate the alias |

**The proxy is the one that fits this document's own test**, and it is worth seeing why rather than treating it as the fancy option. The objection to publishing an address is that it is a route to a *person*, not withdrawable once collected. A per-profile alias converts exactly that: the practitioner's real address is never disclosed, and a practitioner who starts getting spam rotates the alias instead of changing an address they have had for a decade. It turns an irrevocable identifier into a revocable one — the same move the page-versus-person test rewards everywhere else. It is also the most expensive, because receiving mail is a larger commitment than sending it.

**Nothing in the schema needs to change first, which is what makes deferring safe.** `contact_email` is already stored, already `not null`, and already unreachable by `anon` — so direct delivery is a send path and no migration. Only the proxy adds state, and even that can derive the alias from `practitioners.id` rather than storing one. So this is a deferral that does not accumulate a debt, and there is no "collect it now while you can" argument for pre-empting it.

**Gate:** the relay straining in practice — enquiries arriving faster than a human forwards them — or practitioners asking to be reached without Bluehex reading it first.

**What none of this changes:** contact details live in `practitioner_contacts` with no `anon` grant by any route. The invariants are "not published" and "never reachable by a browser". Who receives the enquiry was never one of them, which is why this paragraph can move without touching the table.

**Contact details are stored, in `practitioner_contacts` — a table of their own, not
columns on `practitioners`.** The reason is structural rather than stylistic: a table
with no `anon` grants cannot be leaked by a future `grant select on practitioners to
anon`. The same reasoning as `public.admins` — the reliable protection is "not
reachable", not "we remembered not to name it in the grant list".

This is also load-bearing rather than tidy: **an unclaimed profile has no `user_id`, so
no `auth.users` row, so no address anywhere.** Without this table Bluehex cannot contact
a person it wrote up itself, and curated intake does not work at all.

**"The enquiry button goes somewhere" is a schema invariant**, and the mechanism is the direction of the foreign key rather than a constraint or a check. The contact row is written first and `practitioners.contact_id` is `not null unique`, so a profile without a contact cannot be represented — there is no state to validate, no RPC to route through, and no application code to remember. `contact_email` being `not null` on top of that rules out the address being empty.

An earlier draft had the foreign key the other way, which made a contact row optional in the schema and left the guarantee to a deferred constraint or an RPC. Reversing it deleted the problem instead of policing it.

**Creating a profile is two requests** — contact, then profile — because whichever table holds the pointer has to be written second. The failure mode is deliberately the harmless one: an abandoned signup leaves a contact row nobody references, not a published profile nobody can reach. See `practitioner_contacts` under Program design for what that costs.

Self-service defaults the address to the account email; curated intake uses whatever address the person replied from. The constraint lands on Bluehex's workflow — a curated profile cannot be created before they have an address — and that is the right place for it.

That address does **double duty while the profile is unclaimed**: it is also what a claim is checked against. Editing it then clears the badge, and once the profile is claimed it goes back to being ordinary contact information. See "The claim is checked against the contact email".

Kept separate from `auth.users.email` deliberately: one is a login identity, the other
is where work enquiries should go, and practitioners will reasonably want them to differ.
They can drift, and that is correct rather than a bug. Contact is not attested — editing
it never touches the badge.

**Where this sits against the brief.** scope.md's marketplace boundary excludes practitioner↔visitor messaging — inboxes, threads, notifications, read state. An enquiry form that emails Bluehex is not that. It **becomes** the excluded thing the moment a practitioner reads or answers an enquiry *in the app*, and that needs scope.md's boundary moved before the work rather than after. Published links do not approach that line at all: clicking through to someone's LinkedIn is the visitor leaving, not the product growing an inbox.

**Accepted cost: Bluehex is a bottleneck on every enquiry that comes through the form**, with no automation path. For a consulting arm that is arguably a feature — you learn who is hiring first — but it is the first thing to strain if the directory succeeds.

**What changed about that cost is that it is no longer total.** When the profile published nothing, a strained relay meant nobody could be reached at all, and the only fix was work — the delivery path deferred above. With links on the profile there is a relief valve that needs no building: a practitioner who wants to be reachable without Bluehex in the way publishes a LinkedIn or a booking URL and is. The bottleneck is real, and it now throttles Bluehex's own lead flow rather than the directory's usefulness. Those are very different failure modes, and only the second one was urgent.

**~~Deferred: portfolio links.~~ Superseded 2026-08-16 — they are admitted, as `website_url` and `github_url` below.** The deferral read: *"A GitHub or personal site is arguably evidence of work rather than a contact route. Cut for now. **Gate:** practitioners asking for it — and it should then be argued as a portfolio decision, not reopened as a contact one."*

Both halves of that gate are worth answering rather than stepping over, because the second half is a condition on *how* the question could be reopened and the decision below reopens it the other way.

- **"Practitioners asking for it" — met.** Raised 2026-08-15 from the community, alongside the booking link.
- **"Argued as a portfolio decision, not a contact one" — only half-honoured, and the gate was right to ask.** The argument below is a contact argument: a route to a page against a route to a person. On the portfolio question the deferral's own reasoning still stands unchallenged — a GitHub profile *is* evidence of work — and it points somewhere this document should be explicit about: **evidence of work is not evidence the badge covers.** `verified` attests to credentials a human checked, and a repository nobody read is self-described expertise, sitting with `bio` and `focus` rather than with the credentials. Admitting these columns does not widen the badge, and the reason they are safe to admit is the same reason they are not attested.

So the gate is discharged on both counts, and the columns land. Recording it this way rather than deleting the paragraph, because the gate caught a real gap — the contact argument alone would have admitted them without anyone asking what it did to the badge.

**Decided 2026-08-16 — links may be published, personal contact details may not.** This reverses the half of the decision at the top of this section that cut `website_url` / `github_url` / `linkedin_url`, and admits the external booking link raised on 2026-08-15. The test is **a route to a page versus a route to a person**, and it is the one every future field gets held to. `docs/adr/0002-links-are-published-addresses-are-not.md` owns the argument, the rejected alternatives and the cost; read it before concluding that this and `practitioner_contacts` contradict each other.

**The links are columns on `practitioners` — the public record — and are in the `anon` select grant.** `practitioner_contacts` continues to hold `contact_email`, `contact_phone` and `contact_note`, and only those, with no `anon` grant by any route, forever. That division is the decision: the record a visitor reads carries the links, the record only Bluehex and the owner can read carries the address. A profile may now carry links alongside its prose, and nothing else changes.

**Links are not attested.** They sit outside the attested set with `focus`, `bio` and the rest — editing one never clears the badge. The badge is a statement about credentials, and a practitioner adding a LinkedIn URL has not restated anything Bluehex checked.

**Rejected: a `practitioner_links` child table** keyed by a `kind` enum, which would absorb new platforms without a migration each time. Named columns win here for a reason specific to this schema rather than a general one: **column-level grants are the security mechanism in this project.** Four columns on `practitioners` inherit its policies, its grant lists and its guard trigger; a child table needs its own of each, which is the whole of `practitioner_contacts`' cost paid again for fields that are public by design. **Gate:** the table becomes right when the set stops being enumerable — roughly the fifth platform, or the first time a practitioner wants two of the same kind.

**Unresolved, and it belongs to the UI rather than the schema:** a published URL is rendered as an `href`, so the render path needs `rel="noopener noreferrer"` and must not trust the scheme. The `https_url` domain below refuses `javascript:` at the database, which is the durable half; the render is still where it would go wrong.

## Evidence visibility is the practitioner's call

**Decided.** `evidence_public boolean not null default false`, in the practitioner's
writable column set. Private by default; a practitioner who wants the credibility can
publish the certificate link.

The tension is real in both directions. Bluehex has no reputation to lend yet, so to an
employer who has never heard of it a clickable certificate is worth more than the word
"Verified" — early on, the evidence *is* the credibility. Against that, publishing a
Skilljar page exposes the practitioner's full legal name permanently. Letting them
choose resolves it without Bluehex making a privacy call on someone else's name.

**Flipping it must not clear verification.** It changes the claim's visibility, not the
claim, so it stays out of the attested set.

## The editor: how the writable set is collected

**Decided 2026-08-15, revised 2026-08-16, built in #71.** The decisions below were settled by drawing three shapes as a prototype and are recorded here because the prototype was deleted when the editor replaced it. They are presentation with no schema consequence — but each of them exists to make a rule in this document visible, so a later change that quietly reverses one is a change to what a practitioner is told rather than to how a form looks.

**A stepped form, with the live preview alongside it throughout.** Two of the three shapes combined, because neither was right alone. The steps are for the first-timer: publishing a profile means handing credentials to a stranger to be checked, and one long form asks for all of that at once with no account of what is about to happen to it. Pacing it buys a *What happens next* step, which is the only place in the flow where `status` and `verified` can be explained at the moment they become true. The preview is what stops the pacing from hiding the whole — a wizard's usual failure is that you never see the thing you are making until you have finished making it — and the step nav is free rather than a track, so nothing traps you.

**What was given up:** the single long form was the better shape for *editing*, since coming back to fix a typo wants the field and not a journey. If that turns out to be awkward it should become a flat form reusing the same field components, with the stepped version kept for first submission. Worth deciding when there is a real profile to edit.

**The preview is the mechanism, not decoration, and this is the part to protect.** On the Contact step you type an email address and the preview does not move, which is the rule that contact details are never published, demonstrated rather than asserted. Same for an evidence link with its opt-in off, and same for `credentials_guard()`: repick a verified credential and its ✓ leaves the preview, while flipping the publish opt-in leaves it alone. Both halves of that last pair matter, because the exemption is the one a practitioner most needs to hear — "this costs you your badge" is a reason to leave the opt-in off, which is the opposite of what the opt-in is for. In #71 the guarantee is structural rather than remembered: the preview is fed by a mapping whose return type is the public `Profile` shape, which has no contact field on it to draw even by accident.

**Nothing on the form sets `verified` or `status`, and the form says so rather than omitting them.** Both render read-only. This is the only place a practitioner ever learns who decides, and a form that merely left them out would leave people assuming the fields were coming later.

**The credential picker is one `<select>` over the whole catalogue, with an `<optgroup>` per kind — not two chained selects.** A practitioner knows what they hold; they do not necessarily know which of Bluehex's buckets it files under, so asking for the source first asks a question about our data model before the one they came to answer. Two selects also re-create the pairing the catalogue exists to delete: a stale pair is representable in between, and the second control has to reset whenever the first moves. Two dozen entries across two groups is comfortably one select. Revisit when the catalogue is long enough that scrolling it is the complaint — a filter box over one list is the next step, not a second select. Two things the picker does that a text input could not, and both are constraints rather than manners: retired entries are not offered (`active`), and an entry already on the profile is disabled rather than refused after the fact (`unique (practitioner_id, catalogue_id)`).

**The published links sit on the first step and the contact details on their own, which is the model's own test drawn.** Grouping them by "ways of reaching me" would have put them together and broken the demonstration the Contact step exists for: a published link on that same panel contradicts the caption above it. Splitting them puts the distinction on screen instead — a route to a *page* is public, a route to a *person* is not — and each step says which it is holding.

**The cap is shown before it binds.** The services picker keeps a live count and disables the options that would exceed three rather than silently refusing a click. A cap a form does not show is one somebody meets as an error after they have already decided what they wanted. `practitioner_services_cap` enforces it again, per the services section: a rule enforced only in a form is not a rule.

**Progress belongs to the editor, and the label rule above applies to it.** "2 of 24" with the whole catalogue folded away beneath it — folded, because expanded, two dozen rows of mostly "not earned" is the discouraging reading the public page is being spared, delivered to the one person it is meant to encourage.

**The editor does not trip the profile-identity gate.** That gate is on "the first per-profile route", and an editor is "my profile" keyed on `auth.uid()` with no identifier in the URL. A *public* profile page would force the slug decision; the editor does not. **That page arrived in #118 and the decision was taken in #119** — there is no slug, and the identifier is the `handle` column; this paragraph is kept for why the editor was allowed to land ahead of it.

**Empty is not null, and the form is the first line rather than the only one.** `""` maps to null for every optional column and to "do not submit this row" for a credential, since `catalogue_id` and `earned_at` are `not null`. Both mappings are stated at the end of the Credentials and Contact sections above; the reason they are repeated here is that the failing version type-checks, and a form that sends `''` to an `https_url` column produces a 400 naming the domain, which is not a message anyone should read.

## The public surfaces: the roster, the profile page, and how they read

**Decided across 2026-08-15 and 2026-08-16 by drawing them, built against Postgres in #53.** The prototype at `src/app/prototype/directory/` is still on disk and still renders — it is the one place the *Not earned* control has a catalogue full enough to reveal — so what follows is the settled part rather than the whole record. What is only in `NOTES.md` is the debugging, and the debugging is not binding.

**The directory and the profile page are one surface.** They were two prototypes until the roster's call to action changed. The directory could not reach a profile while every row said *Enquire*, so the profile drawing had to invent its own list to have something to click, and that second list doubled up with the first. Pointing the real roster at `/p/<handle>` deleted the reason for the copy. One consequence binds anything built later: **the profile route has to exist before the first practitioner is published**, because `Enquire` is no longer on the row and a row whose only control 404s leaves an enquiry no path at all.

**One call to action per surface.** The directory's job is to get you to a profile; the profile's job is to get you to enquire. That is the Seek model, where nobody applies from the list, and it costs one extra click before anybody can be contacted. It is the right trade for a directory, because the profile is where the case for a person actually gets made.

**The roster is a table of rows, not a grid of cards, and it is settled.** Four columns — Practitioner, Credentials, Services, action — with headings, credentials stacked under their earned dates, and the invitation card at the foot. Five variants were drawn against it over two rounds and all five lost on sight: a page split into *Verified by Bluehex* and *Published, not yet checked* bands, a bio-led stack with no filters, and three densities of the roster itself. The job somebody does here is *comparing* practitioners, and a grid is a poor shape for that — each card is read on its own and nothing lines up between them. Reopening this needs a reason none of the five supplied.

Three findings from those rounds survive, because they are not about layout:

- **The badge rollup cannot be looked at and still be called a Certification badge.** Drawn as band headings, two of three profiles sat under *Verified by Bluehex* while nobody in the population held a Claude Certification. That is the same fact `certified` is derived from, seen rather than argued, and it is why the honest copy is *"Bluehex checked the credentials on this profile"* — which claims less than a certification badge would, and is the correct amount to claim. Narrowing the rollup to `kind = 'certification'` would deny the badge to everybody at launch and contradicts "the two kinds differ in weight, not in kind"; it is a change to this document, not a change to copy.
- **Filters that can only offer two chips are furniture.** True, and about the launch population rather than the design: the groups get better as the directory fills and look thinnest on the day they are first seen. Deleting them outright was tried and lost.
- **Putting the bio in the row reopens whether `/p/<handle>` earns its keep.** A full page adds only three fields over the row; with the bio promoted it adds two. The URL carries the argument on its own — see below — but the *page* would then need a second reason. Worth knowing before anyone adds a column.

**The filter chips are `service_catalogue`, and their order is the catalogue's.** Only services somebody actually offers get a chip, because a chip that always returns nothing is worse than no chip; but the order comes from `sort_order` rather than `sort()`, since unlike the focus areas this replaced there is a canonical order and alphabetical would lead with "Architecture and advisory" for no reason. Two consequences follow from the chips being the *table* rather than the labels on the rows: a **custom** service renders on a profile and can never become a chip, which is the mechanism behind promotion rather than a filter somebody forgot; and a **retired** entry stops being a chip while every profile still carrying it keeps rendering the label, because the label comes from the row.

**`focus` stays in the search index with no chips behind it.** Typing "RAG" should still find people, and free text that nothing filters on cannot disagree with a filter that does not exist — which was the failure that put country *names* into the index in the first place, after "Australia" matched nobody while the chip built from the same `country_code` selected them.

**`/p/<handle>` is justified by having a URL, not by depth.** A full page adds three fields over the roster row — the bio, the earned dates, and the credential sources — and on depth alone that is not worth a route, since expanding the row in place delivers all three for free. What carried it was measurement: a path is a request you can see, so you learn which profiles get looked at without writing an event that somebody has to keep writing; a URL has a **referrer**, so you can learn that an employer arrived from a candidate's job application, which is evidence the badge works in the market; and a page is **indexable**, so somebody searching for a Claude consultant in Sydney can land on one. Expand-in-place structurally cannot ever answer the sharing question, which turns its "does not have to decide" advantage into "never learns". The analytics argument needs a real **path segment** — most tools strip or lump query parameters, so `?profile=x` does not deliver it.

**The identifier is `handle`: a `not null unique` column, and `/p/<handle>` is the whole URL.** Settled in #119, superseding the scheme described below it. `id` stays the uuid foreign keys reference; `handle` is the public identifier, and conflating the two is what produced the defect that forced the decision.

**What it replaced, and why it had to go.** The identifier was `/p/mara-ellison-2f1a3c`: the trailing six characters of the row's uuid resolved and the name slug was decoration, with a canonical redirect when the slug went stale. Nothing enforced that two profiles could not share those six characters, and the resolver returned the *first* match — so a collision did not error, it served the wrong practitioner's profile, with their credentials and their badge on it. On the one product whose value is that the badge means something, that is the worst available failure: it fails open and looks fine. Six hex characters is 24 bits, which is even odds around 4,800 profiles and about 3% at a thousand — unlikely at the scale Bluehex is aiming at, not zero, and undetected when it happens. The eight rows in `supabase/seed.sql` collided 100% of the time, because their literal uuids are all prefix, and that is what surfaced it.

**Generated by the database, not by the application.** `handle` carries `default public.new_profile_handle()`, so every insert gets one whether it came from the app, a migration, `supabase/seed.sql` or a `psql` prompt — the database owns the handle exactly as it owns the uniqueness, and there is no second generator to disagree with the first. The value is **eight characters of Crockford base32, lowercase**: 40 bits from an alphabet that excludes `i`, `l`, `o` and `u`, so a handle read aloud or copied off a screen is unambiguous. Postgres `encode()` supports `base64`, `hex` and `escape` and not `base32`, so the packing of five random bytes into eight five-bit groups is written out; the implementation is in `20260822040624_profile_handle.sql` and is sampled for bias and truncation in `tests/db/profile-handles.test.ts`. `practitioners_handle_format` states the shape as a check constraint, which is what constrains a *literal* — the seed's eight, an admin's correction — rather than the generator, which cannot produce anything else.

**Not practitioner-writable, by both mechanisms.** `handle` is absent from every `insert` and `update` grant `authenticated` holds, and `practitioners_guard` pins it to `OLD` for every non-privileged caller. That is the same pairing `verified` and `status` use and for the same reason: a policy has no `OLD`, so "this row is yours to update, but this column must not change" is unsayable in row level security, and the trigger is what still holds if a later migration re-grants the column by accident. A mutable handle breaks every published link. `bluehex_admin` can correct one, which is the only write path there is.

**Practitioner-chosen handles are out of scope, deliberately.** It is the nicest UX and the GitHub-shaped answer, and it is user-controlled text on a product selling trust: `/p/anthropic-official` is a real impersonation route, and defending it means a reserved-word list somebody maintains and eventually gets wrong. Bluehex owns the namespace, the same shape as `credential_catalogue`. The format constraint is what holds it shut today; vanity handles, if ever wanted, are an admin-only capability and a later decision.

**Dropping the slug is the forward-compatible direction, which is why it was safe to take now.** The handle is the key in both schemes, so a readable prefix can be added later as pure decoration with every existing `/p/<handle>` still resolving; removing slugs later would break every published URL. What it costs, recorded so it is a decision rather than an oversight: a bare URL tells a hiring manager nothing before they click, and gives search engines no name signal. The withdrawal argument runs the other way and is worth keeping — an indexed name-slug URL keeps the name in search caches and third-party link databases after the person has left, which is the longest-lived trace a withdrawn profile leaves, and an opaque handle leaves none. The privacy opt-out this section used to recommend is therefore moot rather than dropped: everybody gets the opaque form.

**The cost of deciding rose permanently at profile number one.** The point of `/p/<handle>` is that it is a URL a practitioner pastes into a job application; change the scheme after anyone has done that and it breaks links people are relying on. The hosted project had zero practitioner rows when this landed, which is why the column could be `not null unique` in one migration with no backfill — and why that shortcut should not be read as generally available.

### How the public surfaces are rendered and cached

**Decided in #53.** Profiles are public, read-heavy and rarely edited, so both surfaces are static content assembled from Postgres rather than rendered per request. `connection()` is deliberately **not** used, even though this read matches its description exactly — an anonymous public query touching neither cookies nor headers. What that API is *for* is a component that must produce different output per request; these must not, and `await connection()` would opt the routes out of prerendering and undo the decision rather than implement it.

**The directory is one page**, prerendered at build and revalidated daily. **`/p/<handle>` is many pages, each changing rarely**, and it takes the shape that lets new ones appear without a deploy: `generateStaticParams` returns an empty array and `dynamicParams` stays at its default, so nothing is prerendered and every path is still served — a profile page is rendered on its first request and cached from then on. The fact that settles it, because it is easy to get backwards: **`generateStaticParams` is not called again during revalidation**, so enumerating handles there could never be the mechanism by which a newly approved profile appears. `dynamicParams` is. Setting `dynamicParams = false` would 404 every profile there will ever be.

**The build is allowed to need a database, and is allowed not to have one.** Both reads answer empty when Supabase is unconfigured — no environment variables at all — which is what keeps `pnpm build` green in the `Quality` check and on a clean clone with no Docker running. A **configured** deployment whose query fails still throws, and the asymmetry is the point: swallowing that error would render an empty directory indistinguishable from a true one, while failing the render fails the build and leaves the previous deployment serving.

**Two clocks, and only one of them is about freshness.** An ordinary edit — a rewritten bio, a credential added — is served by the daily clock, and seeing your own edit tomorrow is a poor experience and an acceptable one. **Revocation is not a staleness preference.** `status` leaving `approved`, and a credential's `verified` going false, are both Bluehex-owned and both revocable, and a page already generated and sitting in a cache keeps serving a withdrawn profile and keeps showing a badge that was pulled — silent, fails open, and indistinguishable from a working directory. The clock *bounds* that window at 24 hours; it does not close it, and **nothing purges these pages today**.

**The tags that will close it are named now so the tickets that need them agree on the words:** `practitioners` for the directory listing, and `practitioner:<id>` for one profile page. A status change or a `verified` change purges both — purging only the profile leaves a withdrawn person in the roster, and purging only the roster leaves their page reachable by the URL people paste into job applications. An ordinary edit purges neither. They are a contract rather than live code: attaching a tag to cached data needs either a `fetch` of ours to hang `next.tags` on — the queries go through `supabase-js`, so there is none — or `cacheTag()` inside a `use cache` function, which needs `cacheComponents`. That choice is application-wide and is #117; the writes that will call the purge are #14. When the call is written it wants `updateTag`, which expires the entry immediately, and **not** `revalidateTag(tag, "max")`, which serves the stale response one more time — for a pulled badge that is the pulled badge going out once more, which is the entire failure being closed.

### What the public surfaces still owe

- **Search and filter state has to move into the URL.** It is local React state, so going to a profile and coming back loses whatever the visitor typed and ticked. An overlay would have preserved it for free; the plain navigation that replaced the overlay does not, which is the price of cutting it. Lifting it into the URL fixes that and makes a filtered view shareable as a side effect. A directory that forgets your search every time you look at somebody is worse than one with no profile pages at all.
- **`availability` and the four published links are in the `anon` grant and are still undrawn**, except `booking_url`, which the profile page already renders. They belong on `/p/<handle>` — the only surface a visitor reads before deciding to enquire, and `availability` in particular is read exactly once, right there. #84 and #85.
- **The enquiry flow is the weakest part and is blocked on #2.** *Enquire about Mara* leaves for `/contact`, which is framed for Bluehex rather than for the practitioner, submits through a `mailto:` handoff that only completes for a visitor with a working mail client, and is three surfaces deep before anybody has said a word. Do not redesign it before #2 lands a real endpoint, or the enquiry still ends in a mail client one surface earlier.
- **`robots: noindex` is a property of the prototype and must never be inherited by the real page.** Organic search is a third of the reason the route exists.
- **What a shared profile URL does once its owner withdraws** is open and belongs to #52. A 404 is honest and looks broken to whoever was sent the link; a tombstone leaks that the person was once listed. What this surface owes that ticket is the constraint, recorded: profile URLs are indexable and meant to travel, so whatever withdrawal does has to account for links that already left the building.

## Program design

Seven tables, and the prerequisites they sit on. Those prerequisites are **repeated here
rather than referenced**, because the only other copy is in `docs/profile-lifecycle.md`,
which opens with "Do not implement from this file" and is scheduled for deletion once its
assertions land as tests. A binding spec cannot delegate its first statements to a
document that forbids implementing from it.

The decision behind this block — why a Postgres role rather than a flag or the service
role key — is `docs/adr/0001-admins-are-a-postgres-role.md`. It is unchanged; only the
DDL has moved.

**Statement order is load-bearing.** The role must exist before any `grant … to bluehex_admin` below it, and `custom_access_token_hook` must exist before `[auth.hook.custom_access_token]` is enabled anywhere — enabling the hook without the function takes down every sign-in and sign-up with `500 unexpected_failure`. The `config.toml` line and this migration are one commit.

**`practitioner_contacts` is created before `practitioners`**, because the profile holds the foreign key, and **`credential_catalogue` before `practitioner_credentials`** for the same reason. The tables are documented below in the order a reader wants them — the profile first, since it is the thing everything else hangs off — which is *not* the order the migration writes them in. Create contacts, then practitioners, then the two catalogues, then credentials, services and review notes.

**~~Both catalogues seed with their rows.~~ Amended by #89: `service_catalogue` seeds, `credential_catalogue` ships empty.** The service catalogue's rows are Bluehex's own first guess at the vocabulary, and are expected to be wrong in the ordinary way — promotion is the mechanism that corrects them, and it needs a list to start from, so they are still written in the migration and read from `services` in `src/lib/practitioners.ts` rather than retyped. The credential catalogue's contents come from Anthropic, and that is the difference: they are not Bluehex's to guess at. That list now exists — see the amendment below — but it is loaded from `supabase/seed.sql` rather than written into the migration, so the statement above still holds as written. See the amendment below rather than restoring the seed.

**Every table in this section enables row level security at its `create table`**, and the line is written there rather than beside the policies because that is where it is missed. RLS is off by default, and a table with RLS off ignores every policy defined on it — the grants alone decide, and the grants below are broad on purpose because the policies were expected to narrow them. The failure is silent in both directions: a correct policy that never executes reads exactly like a correct policy that does, and every assertion written against a table's *owner* passes whether RLS is on or off. So the assertions that catch it are the ones written from a second account, and the Testing section now names one per table.

**Every foreign key to `auth.users` names an `on delete` action**, and every one in the product schema is `set null`. `public.admins.user_id` is the exception at `cascade`, correctly — an admin list entry is *about* the account and has nothing left to say once it is gone. Everywhere else the default would apply, and the default is `NO ACTION`, which refuses the delete rather than doing anything to the child row: a single provenance reference anywhere in the schema turns "delete my account" into `23503 update or delete on table "users" violates foreign key constraint`, and the Deletion section's whole design never runs. The attribution is what is expendable here — that a profile was approved, or a credential checked, is a record worth keeping after the account that did it is gone.

**~~The catalogue ships with its rows, and that is a judgement call worth flagging.~~ Superseded by #89 for `credential_catalogue`, and the reasoning is recorded here rather than deleted so that the next reader does not "restore" the seed.** The argument below is that an empty catalogue means nobody can enter a credential at all — which is true and, when the migration landed, cost nothing: `practitioner_credentials` does not exist until #50 and the directory ships no profiles, so nobody could enter one regardless. What decides it is the asymmetry between the two failures. An empty catalogue is fixed by an `insert` whenever the real list appears, and an `insert` is this table's sanctioned correction path anyway — the paragraph below says so itself. A **wrong** label is permanent, sits in migration history, and is a wrong credential name displayed behind the Verified badge, which is the one thing this directory sells. No list of Claude credentials existed in this repository at the time — `src/app/prototype/catalogue.ts` holds 24 invented entries and its own header forbids copying them into a migration — so seeding it would have meant compiling one, which is Bluehex's and Anthropic's to state rather than an implementer's to invent. **The list has since arrived, and the amendment stands rather than being undone by it.** Bluehex compiled and confirmed the 24 real entries from <https://anthropic.skilljar.com/> and <https://www.pearsonvue.com/us/en/anthropic.html>; they live in `supabase/seed/credential-catalogue.json` as the canonical record and load locally through `supabase/seed.sql`, which runs at the end of `pnpm db:reset` and never against the hosted project. The migration still creates the table empty. That is deliberate and not a step left unfinished: where the catalogue is permanently housed — an admin surface, an API call, eventually a migration — is still open, and a migration is the one place a wrong row cannot be taken back, so the rows sit somewhere reversible until the question is answered. `tests/db/credential-catalogue-seed.test.ts` is what keeps the JSON and the loader from drifting apart. What an eventual migration inherits is the argument this paragraph records: an initial seed establishes the vocabulary once, and every change after it is an admin `UPDATE` or `active = false` rather than a second migration. The paragraph below is the original argument, retained for its reasoning rather than because it still instructs: its "Seed them in the migration" no longer holds for `credential_catalogue`, which is exactly what this amendment supersedes. What carries over to `service_catalogue` is the narrow claim in it: seeded reference data is not a throwaway row, and a correction to it afterwards is an admin `UPDATE` rather than a second migration. The rest is credential-specific — `service_catalogue` has neither `catalogue_guard` nor `correct_catalogue_entry()`, which is exactly why it is one of the four tables that take `set_updated_at` instead (see Triggers).

`AGENTS.md` forbids anything throwaway in migration history, and seeding reference data is the edge of that rule: these rows are not test fixtures, they are the closed vocabulary the model is built on, and an empty catalogue means nobody can enter a credential at all. ~~Seed them in the migration.~~ (Superseded for `credential_catalogue` by the amendment above; still true of `service_catalogue`, which seeds its six labels in `20260820201450_catalogues.sql`.) What must **not** go in migration history is any correction to them afterwards — a course Anthropic renames is an admin operation, not a second migration, or the history fills with Anthropic's release notes. On an entry nobody has claimed yet that is a plain `UPDATE`; on one with claims against it, `catalogue_guard` requires `correct_catalogue_entry()`, because at that point the same statement could also be a repoint.

### Prerequisites: the role, the admin list, and the hook

```sql
-- the role ------------------------------------------------------------------
-- PostgREST logs in as `authenticator` and switches to the role named in the
-- token's `role` claim. It can only switch to roles it is a member of.
create role bluehex_admin nologin;
grant bluehex_admin to authenticator;
grant authenticated to bluehex_admin;   -- an admin is also an ordinary user
grant usage on schema public to bluehex_admin;

-- admin identity -------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- no grants to anon/authenticated/bluehex_admin: not part of the API surface
grant select on public.admins to supabase_auth_admin;
create policy admins_read_auth_admin on public.admins
  for select to supabase_auth_admin using (true);

-- the hook -------------------------------------------------------------------
-- Runs inside GoTrue as `supabase_auth_admin` when a token is minted.
create function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.admins a
     where a.user_id = (event->>'user_id')::uuid
  ) then
    event := jsonb_set(event, '{claims,role}', '"bluehex_admin"');
  end if;
  return event;
end;
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated, bluehex_admin;
```

### `practitioners`

```sql
create type public.practitioner_status as enum
  ('pending', 'approved', 'rejected', 'withdrawn');

-- every published link is rendered as an `href` and is served to any API client
-- holding the publishable key, so the scheme is constrained here rather than
-- trusted in a render path: `javascript:` and `data:` never reach either.
-- Case-insensitive because RFC 3986 makes the scheme case-insensitive, and a
-- host with a dot in it because `https:///foo` otherwise passes. Deliberately
-- not a URL parser — it rejects the shapes that are dangerous or obviously
-- wrong and lets a human read the rest, per "check it is a URL" above
create domain public.https_url as text
  check (value ~* '^https://[^[:space:]/]+\.[^[:space:]]+$' and length(value) <= 2048);

create table public.practitioners (
  id uuid primary key default gen_random_uuid(),

  -- the public identifier, and the whole of `/p/<handle>` (#119). Separate from
  -- `id`, which stays the uuid foreign keys reference. Eight characters of
  -- Crockford base32, generated by the database so that every insert gets one
  -- whatever wrote it; `not null unique` is what makes a collision an error
  -- rather than the wrong person's profile served under somebody else's URL.
  -- Added in one migration with no backfill because the hosted project had zero
  -- rows; a populated table needs add-backfill-constrain instead. See the
  -- identifier decision above, and `new_profile_handle()` in
  -- `20260822040624_profile_handle.sql` for the bit packing.
  handle text not null unique default public.new_profile_handle()
    constraint practitioners_handle_format
    check (handle ~ '^[0123456789abcdefghjkmnpqrstvwxyz]{8}$'),

  -- nullable, and `set null` rather than `cascade`: deleting an account
  -- withdraws the profile (see Deletion), it does not destroy it
  user_id uuid unique references auth.users (id) on delete set null,

  -- the contact is written first and the profile points at it, so `not null`
  -- is the whole guarantee that an approved profile can be reached
  contact_id uuid not null unique references public.practitioner_contacts (id),

  name text not null,
  headline text,
  location text,                       -- free text; the practitioner picks granularity
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  bio text,
  focus text[] not null default '{}',

  -- `services` is NOT here: it moved to `practitioner_services` when
  -- practitioners were allowed to add their own, so that the cap could span
  -- catalogue and custom rows together. See `practitioner_services`.

  -- a sentence the practitioner asserts, never state the app maintains: that is
  -- the line scope.md's marketplace exclusion actually draws
  availability text,

  -- published links. A route to a page, not to a person — see Contact. Public,
  -- practitioner-writable, and outside the attested set: editing one never
  -- clears the badge
  website_url public.https_url,
  github_url public.https_url,
  linkedin_url public.https_url,
  booking_url public.https_url,

  status public.practitioner_status not null default 'pending',
  -- `review_note` is NOT here: it is admin feedback to one practitioner, and a
  -- column cannot be scoped to the owner. See `practitioner_review_notes`.
  approved_at timestamptz,
  -- `set null` on every provenance reference to `auth.users`: the default is
  -- `NO ACTION`, which refuses the account deletion outright rather than doing
  -- anything to this row, and would make the Deletion section's assertion fail
  -- on a table it does not discuss. The record that something was done outlives
  -- the account; who did it does not
  approved_by uuid references auth.users (id) on delete set null,
  owner_assigned_at timestamptz,
  owner_assigned_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioners enable row level security;
```

`on delete set null` on `user_id`, paired with a trigger forcing `status = 'withdrawn'`.
Superseded `on delete cascade`, which was chosen before withdrawal and erasure were
separated: deleting a *login* should not be what erases a person's record. See Deletion.

`owner_assigned_at` / `owner_assigned_by` record the claim, per scope.md: transferring a
profile that may carry the badge is a privileged act worth attributing.

`location` stays free text. An enum or a place table would force a granularity decision
onto people who can express it perfectly well themselves. `country_code` is separate
because the card wants a flag and you cannot derive one from a string reliably. **Neither
is ANZ-scoped and neither should become so** — the community's home base is Sydney and the
directory is not limited to it, so `country_code` takes any ISO 3166-1 alpha-2 value and
the check constraint deliberately does not name a list.

### `credential_catalogue`

```sql
-- every Claude credential that exists, one row each. Bluehex writes it; nobody
-- else can insert, and there is no free-text escape from it anywhere in the model
create table public.credential_catalogue (
  id uuid primary key default gen_random_uuid(),
  -- the weight axis. Lowercase because it is a closed internal category, following
  -- `status`; `platform` beside it is title case because it is a proper noun
  kind text not null
    check (kind in ('certification', 'course')),
  -- who awards it, which is a different fact from what it weighs
  platform text not null
    check (platform in ('Anthropic Academy', 'Pearson VUE')),
  label text not null,
  -- the page the entry is published on. Nullable: an entry Bluehex knows of before
  -- its page exists is still a real entry, and a placeholder URL is worse than none.
  -- `https_url` rather than `text` for the same reason as the profile links — it is
  -- granted to `anon` and rendered as an `href`
  course_url public.https_url,
  -- retiring an entry hides it from the picker without invalidating the claims of
  -- people who earned it. What a retired entry looks like on a profile is not
  -- decided — see the catalogue section
  active boolean not null default true,
  -- what the picker sorts by; the Academy track has an order and alphabetical
  -- would scramble it
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- maintained by `catalogue_guard`, not by the default: corrections to this
  -- table are admin `UPDATE`s rather than migrations, which is exactly the event
  -- this column exists to record
  updated_at timestamptz not null default now(),

  unique (kind, platform, label)
);

alter table public.credential_catalogue enable row level security;
```

`kind` and `platform` keep their check constraints here, where each is a genuine two-value
axis and stays one. The thing that outgrew a constraint was the *labels*, which is why they
became rows.

**Amended by #103: the single `source` column became `kind` and `platform`, and `course_url` was added.** `source` carried two axes at once — `check (source in ('Claude Certification', 'Anthropic Academy'))`, where the first value names a weight and the second names an awarding body. Storing a `platform` beside it would have written `Anthropic Academy` twice on twenty of the twenty-four rows, free to disagree later, which is the same two-representations-of-one-fact objection that removed `certified`. The four certifications are the proof that the two are distinct: `platform = 'Pearson VUE'` while `course_url` points at `anthropic-partners.skilljar.com`, because the exam is delivered by Pearson VUE and the page describing it lives on a partner Skilljar tenant. Landed in `20260820214711_catalogue_kind_platform_course_url.sql`, before #50 rather than after it, so that the guard and the RPC below are written against the right shape once.

**`unique (kind, platform, label)`, all three.** A true duplicate matches on every axis, so that is what the constraint names. The narrower `unique (platform, label)` was tried first and refused a pair the model is supposed to allow: a course and the exam that certifies it can legitimately share a name, and they collide the moment both sit on one platform. That they do not collide today — courses on `Anthropic Academy`, certifications on `Pearson VUE` — is a fact about the current catalogue rather than a rule, and encoding it in a constraint would re-couple the two axes this table just split apart.

**No `slug` or stable external key.** The `id` is the reference and `unique (kind, platform, label)`
is what stops the same course being added twice by two admins. A human-readable key would
be a third representation of the same fact and would go stale on a rename.

### `service_catalogue` and `practitioner_services`

```sql
-- the vocabulary the directory filters on. Bluehex writes it; it grows by
-- promoting custom services practitioners actually wrote, not by guessing
create table public.service_catalogue (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_catalogue enable row level security;

create table public.practitioner_services (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null
    references public.practitioners (id) on delete cascade,

  -- exactly one of these. A catalogue row filters; a labelled row does not
  catalogue_id uuid references public.service_catalogue (id) on delete restrict,
  label text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- the "or" is the table's whole shape, so it is a constraint rather than a
  -- convention: a row naming both would be filterable and free text at once
  constraint practitioner_services_one_kind
    check (num_nonnulls(catalogue_id, label) = 1),
  -- an empty or whitespace label is a row that renders as nothing. `[:space:]`
  -- rather than `btrim`, whose one-argument form strips spaces only and would
  -- accept a label of a single tab
  constraint practitioner_services_label_present
    check (label is null or label ~ '[^[:space:]]'),
  -- you cannot list the same catalogue service twice. Custom labels are not
  -- deduplicated: they are free text and two near-identical ones are the
  -- practitioner's problem to notice, not the schema's to refuse
  unique (practitioner_id, catalogue_id)
);
alter table public.practitioner_services enable row level security;

-- #90 ships this on `catalogue_id` instead, for the reason #50 gave one table
-- along. The unique constraint above already indexes
-- `(practitioner_id, catalogue_id)` and serves `where practitioner_id = $1` on its
-- leading column, so a second index on that column alone is write cost for no read
-- — while `catalogue_id` is scanned by the `on delete restrict` check on every
-- attempt to delete a catalogue entry, which is the sanctioned way an admin
-- discovers a service is offered
create index practitioner_services_catalogue_id_idx
  on public.practitioner_services (catalogue_id);
```

**The cap is a trigger, not a check constraint.** "At most three services per profile"
counts sibling rows, and a `check` may not run a subquery. The array column got around that
wall with an `immutable` helper, which a check constraint may call — that escape hatch does
not work twice, because counting other rows is by definition not immutable. So
`practitioner_services_cap` is a `before insert or update` trigger raising `23514`, written
out under Triggers. It is enforced there rather than left to the application for the reason
the whole section gives: a rule the form enforces is not enforced.

**`unique (practitioner_id, catalogue_id)` allows many rows with `catalogue_id` null**, so
it constrains catalogue services only — which is what is wanted. Postgres permits any number
of nulls in a unique index, the same property `practitioners.user_id` already relies on for
unclaimed profiles.

**`public.is_distinct(text[])` is gone**, and nothing calls it — the array column it was
written for no longer exists, and no other constraint used it. Since no migration has been
written yet, this is a deletion from the DDL above rather than a `drop function` in a later
one: a first migration that creates a helper and then drops it is throwaway in a history
that is permanent.

### `practitioner_credentials`

```sql
create table public.practitioner_credentials (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null
    references public.practitioners (id) on delete cascade,

  -- `restrict`, not `cascade`: a catalogue entry with claims against it must be
  -- retired via `active`, never deleted out from under somebody's profile
  catalogue_id uuid not null
    references public.credential_catalogue (id) on delete restrict,

  -- `not null`: there is no in-progress credential. Progress is derived by
  -- comparing what is held against the catalogue — see the Credentials section
  earned_at date not null,
  -- `https_url` rather than `text`: `evidence_url_public` below is granted to
  -- `anon` and rendered as an `href`, so it is a published link on the same
  -- terms as the profile's, and "check it is a URL" above is what asks for this.
  -- Still nullable: an earned credential awaiting proof is approvable and
  -- unbadgeable, which is a real state
  evidence_url public.https_url,
  evidence_public boolean not null default false,

  -- the attestation, per credential
  verified boolean not null default false,
  verified_at timestamptz,
  -- `set null`, or an admin who leaves and has their account deleted blocks
  -- that delete against every credential they ever checked
  verified_by uuid references auth.users (id) on delete set null,

  -- what `anon` may read: the URL only when the practitioner has opted in.
  -- `text`, not `https_url` — a generated column inherits the constraint's
  -- effect through `evidence_url` and does not need to re-declare it
  evidence_url_public text
    generated always as (case when evidence_public then evidence_url end) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- #50 ships this on `catalogue_id` instead. The unique constraint below already
-- indexes `(practitioner_id, catalogue_id)` and serves `where practitioner_id = $1`
-- on its leading column, so a second index on that column alone is write cost for no
-- read — while `catalogue_id` is scanned by the `on delete restrict` check and by
-- `catalogue_guard` on every update to the catalogue
create index practitioner_credentials_catalogue_id_idx
  on public.practitioner_credentials (catalogue_id);

-- you cannot claim the same credential twice. Not expressible while `label` was
-- free text, because `Prompt engineering` and `Prompt Engineering` are two strings
alter table public.practitioner_credentials
  add constraint practitioner_credentials_one_claim_each
  unique (practitioner_id, catalogue_id);

alter table public.practitioner_credentials enable row level security;
```

**The generated column is the mechanism that makes `evidence_public` enforceable.**
Column privileges are static; "readable only when another column is true" is not
sayable as a grant, and RLS filters rows rather than columns. Rather than reach for a
view — which drags in the `security_invoker` question and needs the underlying column
granted anyway — the masking is computed into a column of its own. `anon` is granted
`evidence_url_public` and never `evidence_url`, so opting out is enforced by the
privilege layer exactly like every other rule here.

`earned_at` is a `date`. A certificate is earned on a day, not at an instant, and a
timestamp would invite a timezone bug for no gain.

**Both new columns are `not null` and the form has no value for "not answered yet", which is a trap this document has hit before.** A `<select>` with nothing chosen is `""` and a date input left alone is `""`; neither is a legal `catalogue_id` or `earned_at`. The old `job_function` proposal documented the same collision and resolved it by mapping `""` to null on the way in — **that resolution is not available here**, because these columns reject null outright rather than treating it as "not saying". So the mapping is not `"" → null`, it is `"" → do not submit this row`: an incomplete credential is not a credential, and the form holds it as draft state that never reaches the database. Worth stating because the failing version type-checks — `""` is a `string`, and only Postgres refuses it.

**`on delete restrict` on `catalogue_id` is the load-bearing half of the `active` flag.**
Without it, an admin tidying the catalogue deletes a course and silently destroys every
practitioner's claim to it — including verified ones, which is the badge coming apart in a
way nothing else in this design permits. `restrict` makes that attempt fail loudly and
points at `active` instead, which is the operation that was actually meant.

### `practitioner_contacts`

```sql
create table public.practitioner_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_email text not null,
  contact_phone text,
  contact_note text,
  -- who wrote the row, so it has an owner before any profile points at it.
  -- Nullable, and `set null`: `not null` here would make the account deletion
  -- fail rather than the profile withdraw, and `set null` is not available on a
  -- `not null` column. See below for why losing it fails closed
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioner_contacts enable row level security;
```

**The contact is the parent, and the profile points at it.** `practitioners.contact_id` is `not null unique`, so a profile is structurally incapable of existing without a contact — no RPC, no deferred constraint, no application check. The `not null` is the entire enforcement.

That direction is what makes "contact first, then profile" possible, and it is the reason the order matters: whichever table holds the pointer has to be written second, because the pointer needs something to point at.

**Creating a profile is therefore two requests**, and the failure mode is deliberately the harmless one. If the second request fails, the result is a contact row nobody references — a stray email address — rather than a published profile with no way to reach the person. The profile is never in an invalid state, because the invalid state cannot be represented.

Three consequences, all accepted:

- **Orphaned contacts accumulate.** Someone fills in step one and abandons step two. They are cheap to sweep (`where not exists (select 1 from practitioners p where p.contact_id = id)`) and nothing depends on them being swept promptly. Worth doing before the table holds enough addresses to be worth stealing.
- **`created_by` exists so the row has an owner before a profile does.** Without it there is no way to express "you may read back the contact you just wrote", because the usual route — *the profile pointing at this row is yours* — has nothing to traverse yet.

  **It is nullable, and that is forced rather than chosen.** It references `auth.users`, so it has to survive an account deletion, and `on delete set null` is not available on a `not null` column — the alternatives were refusing the account deletion, which is the bug the Deletion section exists to avoid, or `on delete cascade`, which would delete a contact row out from under a profile whose `contact_id` is `not null` and be refused by *that* foreign key instead. What null means is "the account that wrote this is gone", and it fails closed: `created_by = (select auth.uid())` is null rather than true for every caller, so the first clause of `contacts_rw_own` stops matching and the row is reachable only through the profile that points at it. An orphan whose author deleted their account therefore becomes unreadable by everybody but an admin, which is the right outcome for a stray address nobody claimed — it is sweepable, not lost.
- **Erasure is two deletes, not a cascade.** `on delete cascade` used to take the contact with the profile, which mattered because it is PII. Reversed, the profile goes first and the contact is deleted after it. See Deletion.

### `practitioner_review_notes`

```sql
create table public.practitioner_review_notes (
  practitioner_id uuid primary key
    references public.practitioners (id) on delete cascade,
  note text not null,
  written_at timestamptz not null default now(),
  written_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioner_review_notes enable row level security;
```

A table rather than the `review_note` column #35 put on the profile. The reason is that the column could not be scoped to the person it is about: column privileges are per **role** and RLS is per **row**, so `grant select (review_note) … to authenticated` meant every signed-in practitioner could read Bluehex's feedback about every other one. `approve_practitioner()` clearing it on approval narrowed the window without closing it, since an admin setting `status` by `PATCH` leaves the note in place.

The same reasoning as `practitioner_contacts` and `public.admins`: the reliable protection is *not reachable*, not "we remembered not to name it in the grant list". A table has no `anon` grant by any route and an owner-only read policy, which a column cannot have.

One current note per profile rather than a history — `written_at` / `written_by` say who last wrote it. `reject_practitioner()` upserts; `approve_practitioner()` deletes the row, which is the same "approved rows carry no rejection feedback" rule #35 had, expressed as a delete rather than a null.

Nobody but `bluehex_admin` can write it. The owner reads it and cannot reply — feedback goes one way, and a practitioner responding to it is an edit to their profile, not a message.

### Grants

```sql
-- practitioners --------------------------------------------------------------
-- `handle` is readable and never writable. It is named in both `select` lists —
-- `anon` needs it or the directory cannot build a link, and the failure reads as
-- a broken policy rather than a missing grant — and is absent from `insert` and
-- `update` exactly as `verified` and `status` are. `practitioners_guard` states
-- the same rule where a grant cannot: see Triggers.
grant select (id, handle, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to anon;
grant select (id, handle, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url,
              status, created_at, updated_at)
  on public.practitioners to authenticated;
grant insert (user_id, contact_id, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to authenticated;
grant update (name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to authenticated;
-- deliberately no `delete`: leaving is `withdraw_profile()`, erasure is an admin
-- action on request. See Deletion.

grant select, delete on public.practitioners to bluehex_admin;
grant insert, update on public.practitioners to bluehex_admin;   -- incl. user_id

-- service_catalogue ----------------------------------------------------------
-- readable by everyone: it is the roster's filter vocabulary, so `anon` needs it
-- to render the chips. Admin-only writes, and that omission is the whole of
-- "a custom service never becomes a filter chip" — a practitioner who could
-- insert here would be widening the filter vocabulary directly
grant select (id, label, active, sort_order)
  on public.service_catalogue to anon, authenticated;
grant select, insert, update, delete on public.service_catalogue to bluehex_admin;

-- practitioner_services ------------------------------------------------------
-- public: both kinds render on a profile, and catalogue rows drive the roster
grant select (id, practitioner_id, catalogue_id, label)
  on public.practitioner_services to anon;
grant select (id, practitioner_id, catalogue_id, label, created_at, updated_at)
  on public.practitioner_services to authenticated;
grant insert (practitioner_id, catalogue_id, label)
  on public.practitioner_services to authenticated;
grant update (catalogue_id, label) on public.practitioner_services to authenticated;
grant delete on public.practitioner_services to authenticated;
grant select, insert, update, delete on public.practitioner_services to bluehex_admin;

-- credential_catalogue -------------------------------------------------------
-- readable by everyone: the picker needs it, and so does the progress surface,
-- which is why `anon` gets it too — a public profile renders held credentials
-- against the whole set. No insert, update or delete to anyone but an admin, and
-- that omission is the entire enforcement of "a practitioner cannot invent a
-- credential"
grant select (id, kind, platform, label, course_url, active, sort_order)
  on public.credential_catalogue to anon, authenticated;
grant select, insert, update, delete on public.credential_catalogue to bluehex_admin;

-- practitioner_credentials ---------------------------------------------------
grant select (id, practitioner_id, catalogue_id, earned_at, verified,
              evidence_url_public)
  on public.practitioner_credentials to anon;
-- #50 drops `evidence_url` and `evidence_public` from this list; see the note below
grant select (id, practitioner_id, catalogue_id, earned_at, verified, verified_at,
              evidence_url_public,
              created_at, updated_at)
  on public.practitioner_credentials to authenticated;
grant insert (practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;
grant update (catalogue_id, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;
grant delete on public.practitioner_credentials to authenticated;

grant select, insert, update, delete
  on public.practitioner_credentials to bluehex_admin;

-- practitioner_contacts ------------------------------------------------------
-- nothing to anon, ever
grant select (id, contact_email, contact_phone, contact_note, created_at, updated_at)
  on public.practitioner_contacts to authenticated;
grant insert (contact_email, contact_phone, contact_note)
  on public.practitioner_contacts to authenticated;
grant update (contact_email, contact_phone, contact_note)
  on public.practitioner_contacts to authenticated;
grant select, insert, update, delete on public.practitioner_contacts to bluehex_admin;

-- practitioner_review_notes --------------------------------------------------
-- nothing to anon, ever; the owner reads and never writes
grant select (practitioner_id, note, written_at)
  on public.practitioner_review_notes to authenticated;
grant select, insert, update, delete on public.practitioner_review_notes to bluehex_admin;
```

`created_by` is **not** in the `authenticated` insert list — it defaults to `auth.uid()` and a practitioner cannot name someone else as the author of a contact row. Nor is it readable: it is plumbing for the read policy, not information.

**The catalogue's grant list is where "a practitioner cannot invent a credential" is actually enforced.** The check constraint that used to hold the credential's name is gone and the narrowness now rests on two things: `catalogue_id` being a foreign key, and nobody but `bluehex_admin` holding `insert` on the table it points at. Both are needed — a practitioner who could insert a catalogue row would simply add "AWS Solutions Architect" and then reference it, which is the free-text hole reopened one table along. This is the same "not reachable beats not named in the grant list" reasoning as `public.admins`, and it is the line to check first if the credential model ever looks like it has stopped constraining anything.

**The three columns #103 added are named in that list, and that is the whole of the change on this side.** Reads here are column-scoped, so `kind`, `platform` and `course_url` were invisible to `anon` and `authenticated` until they appeared above — a column added by `alter table` inherits no column privilege, and a query naming one is refused `42501` before any policy is consulted. It fails closed, which is right, and it is silent, which is why the read is asserted in Testing rather than left to this line. None of the three is writable by `authenticated`: nobody but `bluehex_admin` writes this table at all.

`anon` reads the catalogue deliberately, and it is worth being explicit that this is not a leak: it is a list of courses Anthropic publishes, containing nothing about any practitioner.

**What needs it is narrower than it first looks, and the grant survives on the narrow version.** The public profile page defaults to showing held credentials only — see "Where progress may be shown" — so the whole catalogue is fetched for a control the visitor may never touch. That is still an anonymous read of a public list and the grant is right, but do not re-derive it from "the profile renders the whole catalogue", because after that decision it no longer does. If the profile page ever stops offering the *Not earned* view, this grant should be re-read rather than inherited.

Note what `anon` never gets: `user_id`, `contact_id`, `status`, any provenance column, `evidence_url`, `evidence_public`, and every column of `practitioner_contacts` and `practitioner_review_notes`. `verified_by` is admin-only on credentials too — who performed a check is not public.

`kind` and `label` are no longer on `practitioner_credentials` at all, so they are absent from these lists rather than withheld. A reader diffing against the previous version should confirm that: a column that quietly reappeared on the credential row would be free text back in the model.

**`user_id` and `contact_id` are not readable by `authenticated` either**, which closes the gap review found on this grant. Column privileges are per *role* and RLS is per *row*, so a column readable "by the owner" is really readable by every signed-in caller on every row they can see — and both of these are handles to somebody else's account or PII. Nothing needs them: a practitioner knows their own `auth.uid()` without reading it back, `practitioners_read_own` filters on `user_id` without granting it, and the contact row is reached through its own table rather than through the pointer.

**Corrected by #14: the withholding stands, but that last justification does not, and the profile editor is what it broke.** "`practitioners_read_own` filters on `user_id` without granting it" is true wherever the owner policy is the *only* policy `authenticated` holds — `practitioner_contacts` and `practitioner_review_notes`, where a bare unfiltered select returns exactly the caller's own rows because RLS has already narrowed it to them. It is false on `practitioners`, because `practitioners_read_own` sits in a disjunction with `practitioners_read_approved` and permissive policies OR: a bare select returns every approved profile *plus* mine. Narrowing that from the client means filtering on `user_id`, and Postgres checks column privileges on columns named in `WHERE` as well as in the select list, so the filter is refused with `42501` before a policy is consulted. No granted column separates the two sets — once the profile is approved it is indistinguishable from every other approved row — and the near-miss that looks like a fix, `status <> 'approved'`, returns exactly your own row right up until Bluehex approves you, which is the case the editor most needs to get right.

The fix is not a grant. `public.my_profile()` is a `security definer` read returning the caller's own row and nothing else, alongside `public.my_credentials()` for the `evidence_url` case immediately below — both in `20260822050002_profile_own_reads.sql`, both proved in `tests/db/profile-own-reads.test.ts` from a second signed-in account as well as from the owner. Restoring the column grant instead would be the trade the paragraph above refuses, on a column that is a handle to somebody's account.

**Corrected by #50: `evidence_url` and `evidence_public` are not readable by `authenticated` either.** The list above granted both, which reads as "the owner can see their own" and is not what a column grant says — it is the paragraph immediately above, applied to a third column and reached the wrong way. `credentials_read_public` shows every signed-in caller every credential on every approved profile, so the raw column beside the masked one made `evidence_url_public` decorative: an account created a minute ago could read, and filter on, every practitioner's private certificate link. That link is the full legal name the opt-in exists to let them withhold, so the leak was of exactly the thing "Evidence visibility is the practitioner's call" decides in the practitioner's favour. Proved against the local stack with a signed-in non-owner, and `tests/db/credentials.test.ts` asserts the refusal for a practitioner as well as for `anon`.

What it costs, unpaid for now: the owner cannot read their own `evidence_url` back to populate an edit form. A column grant cannot say "the owner only" and a generated column cannot mask on `auth.uid()`, so the route is a per-row one — a `security definer` read over the caller's own credentials, joining `owns_profile()` and `profile_is_approved()` — and it belongs with the editor that needs it, in #14. **Landed there** as `public.my_credentials()` in `20260822050002_profile_own_reads.sql`: it returns the raw `evidence_url` for the caller's own credentials only, joined on `practitioners.user_id`, and discloses nothing to anybody else. Do not restore the grant to unblock the form; that is the same trade this paragraph refuses.

`status` stays, and is safe for a reason worth stating rather than assuming: another practitioner's row is only ever visible to you when it is `approved`, so `status` on a row that is not yours always reads the same value. It discloses nothing that visibility itself did not.

### Policies

`practitioners` keeps five of #35's six policies — `practitioners_read_approved`,
`practitioners_read_own`, `practitioners_admin_all`, `practitioners_insert_own` and
`practitioners_update_own`, all unchanged. **`practitioners_delete_own` is dropped**,
along with the `delete` grant to `authenticated`: it was the mechanism behind #35's
"self-removal is a `delete` on your own row", which this document supersedes with
`withdraw_profile()` and admin-performed erasure. Leaving it in would give a practitioner
two exits with very different consequences — the reversible one behind an RPC, the
irreversible one behind a plain HTTP verb — and no signposting between them.

`grant delete on public.practitioner_credentials to authenticated` **stays**, and the
asymmetry is deliberate: removing a credential you entered by mistake is ordinary
editing of your own claim, not erasure of a record Bluehex has attested to. The
`credentials_guard` clearing rule already covers the case where it is used to launder a
verified row — deleting and re-adding gets you an unverified credential, which is the
same outcome as editing one.

The two new tables follow the parent:

```sql
-- credentials: visible when the parent profile is, writable when the parent is yours
create policy credentials_read_public on public.practitioner_credentials
  for select to anon, authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.status = 'approved'));

create policy credentials_rw_own on public.practitioner_credentials
  for all to authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.practitioners p
                       where p.id = practitioner_id and p.user_id = (select auth.uid())));

create policy credentials_admin_all on public.practitioner_credentials
  for all to bluehex_admin using (true) with check (true);
```

The catalogue is the one table in the design whose rows are public reference data rather than anybody's record, so its policies are correspondingly dull — and it is the table on which forgetting `enable row level security` would cost nothing, which is why the line lives at every `create table` above rather than being written where it happens to matter:

```sql
create policy catalogue_read_all on public.credential_catalogue
  for select to anon, authenticated using (true);

create policy catalogue_admin_all on public.credential_catalogue
  for all to bluehex_admin using (true) with check (true);
```

**Retired entries are readable rather than filtered here.** `active` is not in the `using`
clause, because a profile holding a retired credential still has to render its label —
hiding the row would make an earned credential display as nothing at all. `active` filters
the *picker*, which is a query, not a policy.

`service_catalogue` takes the identical pair for the identical reasons, and
`practitioner_services` follows its parent profile exactly as credentials do:

```sql
create policy service_catalogue_read_all on public.service_catalogue
  for select to anon, authenticated using (true);

create policy service_catalogue_admin_all on public.service_catalogue
  for all to bluehex_admin using (true) with check (true);

create policy services_read_public on public.practitioner_services
  for select to anon, authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.status = 'approved'));

create policy services_rw_own on public.practitioner_services
  for all to authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.practitioners p
                       where p.id = practitioner_id and p.user_id = (select auth.uid())));

create policy services_admin_all on public.practitioner_services
  for all to bluehex_admin using (true) with check (true);
```

**Nothing here needs a guard trigger, which is the one way `practitioner_services` is
simpler than every other child table.** It carries no attested column — no `verified`, no
provenance, nothing Bluehex asserts — so there is no `OLD` to pin and no badge to clear. A
practitioner rewriting what they offer is ordinary editing, exactly like `bio`. The two
triggers it does carry are `practitioner_services_cap`, which enforces a count rather than
an authority, and `set_updated_at` — neither pins a column against its old value, which is
what a guard is for.

Two things this leans on, both established in #35: a policy expression is **not** subject to the caller's column privileges, so `p.status` and `p.user_id` are readable here even though `anon` cannot select them; and `auth.uid() = user_id` is null rather than true for an unclaimed profile, so unclaimed credentials are unreachable by every practitioner without an extra clause. `practitioners` has no policy referencing credentials, so there is no recursion.

**Corrected by #49, and it is the first of those two that is wrong.** A policy escapes the caller's column privileges only for columns of **its own table** — the row is already in hand, so nothing is read. A subquery against *another* table is an ordinary query and is privilege-checked like any other, so every `exists (select 1 from public.practitioners p where …)` written above fails with `42501 permission denied for table practitioners` the moment it names `p.user_id` or `p.contact_id`, both of which are deliberately withheld from `authenticated`. It fails for the owner, reading their own row, which is the worst way for it to fail. Proved against the local stack while building the first migration: `set role authenticated; select 1 from public.practitioners p where p.user_id is null;` is refused, and the same expression inside `contacts_rw_own` refused the owner their own contact details.

So the traversal is asked through a `security definer` function instead — `public.owns_profile(profile_id uuid)` and `public.owns_profile_for_contact(contact uuid)`, both returning a boolean about the caller and able to disclose nothing else. They live in `20260819194255_profile_core.sql` and every policy above that traverses the profile should be read as calling one of them: `credentials_rw_own`, `services_rw_own` and `review_notes_read_own` take `owns_profile(practitioner_id)`, and the contact policies take `owns_profile_for_contact(id)`. Two more join them for the contact table specifically — `public.owns_contact(contact uuid)` and `public.contact_is_unattached(contact uuid)` — for the reasons in the next section. `credentials_read_public` and `services_read_public` need `p.status`, which **is** granted to `authenticated` but not to `anon`, so they need the same treatment or a third helper — settle that in #50 rather than inheriting the inline form.

**Settled by #50, as a third helper: `public.profile_is_approved(profile_id uuid)`.** Reusing an ownership helper was never available — these two policies ask whether the profile is *published*, which is a different question and one `anon` has to be able to ask. It takes `execute` for `anon` as well as `authenticated`, unlike the ownership three, because `anon` is the caller it exists for: the public directory reading a profile's credentials is the busiest path in the design, and inline it is refused `42501 permission denied for table practitioners` on every anonymous request. Proved against the local stack the same way #49's was, and `tests/db/credentials.test.ts` fails on two assertions if the inline form is restored.

That makes six `security definer` functions in the design rather than the two the Triggers section counts. The count was a property of the mechanism being wrong, not a budget — and #50 found the same thing one layer further along, in the trigger functions themselves; see Triggers.

**`practitioner_contacts` cannot follow that pattern**, because it is now the parent rather than the child. At insert time no profile points at the row, so "the profile that references me is yours" has nothing to traverse. It needs two routes in, and both are load-bearing:

```sql
-- no anon policy at all: there is no anon grant to go with one.
-- no delete policy and no delete grant either: a contact row outlives the profile
-- that pointed at it, and sweeping it up is #52
create policy contacts_insert_own on public.practitioner_contacts
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy contacts_read_own on public.practitioner_contacts
  for select to authenticated
  using (
    public.owns_profile_for_contact(id)
    or (created_by = (select auth.uid()) and public.contact_is_unattached(id))
  );

create policy contacts_update_own on public.practitioner_contacts
  for update to authenticated
  using (
    public.owns_profile_for_contact(id)
    or (created_by = (select auth.uid()) and public.contact_is_unattached(id))
  )
  with check (
    public.owns_profile_for_contact(id)
    or (created_by = (select auth.uid()) and public.contact_is_unattached(id))
  );

create policy contacts_admin_all on public.practitioner_contacts
  for all to bluehex_admin using (true) with check (true);
```

The authorship clause covers the row you just wrote, including an orphan whose profile was never created. The profile clause covers the row **Bluehex** wrote during curated intake, which a practitioner inherits the moment they claim the profile — `created_by` is the admin there, so without it a claimed practitioner could not read their own contact details.

**Authorship expires, and this is the correction #49 made.** Written as `created_by = auth.uid()` alone it is a grant nothing ever takes away, and a profile can change hands: unassign it, assign it to somebody else — the supported repair for a mis-assignment, so this is reachable rather than theoretical — and the row goes on holding the new owner's email and phone while the original author still matches. Proved against the local stack: the author kept both `select` and `update` on a row that was no longer theirs by any reading, which inverts the rule below, since the stranger who typed it could write while the person the details are about could not. `contact_is_unattached` ends it. Authorship carries the row only while no profile points at it; from then on the profile is what says whose it is.

**Three policies rather than one `for all`**, because the clause has to differ by verb. On `insert` the row is not in the table yet, so a helper that reads it back returns false and would refuse every contact row ever written; on `select` and `update` the row is in hand and the whole question can be asked.

**A contact row is writable by whoever the profile above it belongs to now**, which is the second correction #49 made and the one that had stood longest. `with check` on update named `created_by` alone from the #35 spike onwards, justified as *you may not reassign an existing row to yourself* — and that is not a thing a policy defends here. `created_by` is absent from the `authenticated` update grant, so reassignment is refused a layer lower, by the privilege check, which is what the test asserting `42501` on that write has always been proving. Once insert became a policy of its own, the clause had exactly one remaining effect: it stopped the claimer of a curated profile from correcting the address their own profile was about to publish. Both the policy and the Testing bullet that contradicted it were wrong; the bullet was right about the behaviour anyone would expect.

Insert still names authorship, because there is nothing else it could name — no profile points at the row yet. You may not write a contact row into existence with somebody else's `created_by`.

**`created_by` is nullable**, because it references `auth.users` and has to survive an account deletion — see the table. Both clauses stay correct: a null `created_by` makes the comparison null rather than true, so it fails closed, and the profile clause is unaffected because it never mentions the column.

```sql
-- review notes: the owner reads, only Bluehex writes
create policy review_notes_read_own on public.practitioner_review_notes
  for select to authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.user_id = (select auth.uid())));

create policy review_notes_admin_all on public.practitioner_review_notes
  for all to bluehex_admin using (true) with check (true);
```

`for select` and nothing else for `authenticated` — there is no insert, update or delete grant on this table for anyone but `bluehex_admin`, so the feedback cannot be edited by its subject. That is the point of moving it off the profile row.

### Triggers

Three guards, one clearing rule shared by three triggers, one timestamp bump shared by four tables, and one cap. `clear_profile_verification()` is the only privileged function among them; `withdraw_profile()` under Deletion is the other `security definer` in the design, which makes two overall.

**Corrected by #50: the two trigger functions that call `clear_profile_verification()` are `security definer` as well.** A trigger function runs as the caller unless it says otherwise, so the count above cannot hold: the practitioner renaming their own profile would be calling a function every API role has just been revoked `execute` on, and would be refused `42501` on an ordinary profile edit. `contacts_email_change_clears_credentials()` has a second reason — its body reads `practitioners.contact_id` and `practitioners.user_id`, both deliberately withheld from `authenticated`, so even the lookup is refused. It is the same trap #49 found in the policies, one layer along: a privileged function is only reachable from a privileged caller. Both stay narrow the way `clear_profile_verification()` does, taking nothing from the caller and reaching nothing but a flag going false, and `tests/db/credentials.test.ts` fails on four assertions if either loses the marker.

Written out rather than described, because the three mistakes these are here to prevent are all invisible in prose: a `before insert or update` trigger that reads `OLD`, an `update of` clause read as though it fired on change, and an ownership rule read as a permission when it is a state machine.

1. **`practitioners_guard`** — `before update`. Pins `status`, the provenance columns, `user_id` and `handle` to their old values for non-admin callers, and bumps `updated_at`. Its allow-list must include `supabase_auth_admin`, or the `set null` from an account deletion is pinned back and leaves a dangling reference — see Deletion.

   `handle` joined the list in #119, and the reason is the same one that put `status` on it: the column is absent from the `authenticated` grants, and the trigger is what still states the rule the day a migration re-grants it by accident. Note what neither mechanism covers — **there is no `before insert` guard on this table**, so on the way *in* the grant list is the only thing withholding `handle`, exactly as it is the only thing withholding `status`. That is a property of the design rather than an oversight in it, and it is stated here so a future insert guard is a decision rather than a discovery.

   **It also enforces the ownership state machine**, which is the part that is not a permission question. `user_id` has three legal transitions and one illegal one, and the illegal one is the only place in this design that raises rather than pinning silently:

   ```sql
   -- ownership, for every caller including admins
   if new.user_id is distinct from old.user_id then
     if old.user_id is not null and new.user_id is not null then
       raise exception 'a profile cannot change owners'
         using errcode = '23514',
               hint = 'unassign the profile first, then claim it';
     end if;

     new.owner_assigned_at := now();
     new.owner_assigned_by := (select auth.uid());

     if new.user_id is null then
       new.status := 'withdrawn';
     end if;
   end if;
   ```

   | transition | meaning | verdict |
   | --- | --- | --- |
   | `null → A` | claiming an unclaimed profile | legal; stamps provenance and clears the badge |
   | `A → null` | the account was deleted, or an admin unassigns | legal; forces `withdrawn` |
   | `A → B` | nothing | **refused** |

   `A → B` is not a privilege to withhold, it is a state that should not exist: a profile is a record *about a person*, and there is no story where the record about one person legitimately becomes another person's. Refusing it here rather than in a grant means it holds for admins too, and a mis-assignment is still recoverable — unassign (`A → null`, which withdraws the profile while its ownership is in question), then claim it correctly.

   **Provenance is stamped by the trigger rather than by an RPC**, which is why `assign_profile_owner()` no longer exists. An RPC can be bypassed by an admin with an `update` grant; a trigger cannot. Claiming is now an ordinary `PATCH` setting `user_id`, and `owner_assigned_at/by` are written whether the caller remembered to or not.

   It raises here, against the silent-pinning convention #35 set, because the convention's justification does not apply: pinning is right when the column grant has already rejected the honest attempt with a clear `403`, and there is no grant that can express "this transition, not that one". Silently pinning `A → B` would tell the admin their write succeeded when it did nothing.

2. **`credentials_guard`** — `before insert or update`. **The two operations do different
   things and the trigger has to branch**: `OLD` is not assigned during a `before insert`,
   so the pin-to-`OLD` shape that `practitioners_guard` uses would raise
   `55000 record "old" is not assigned yet` on every credential a practitioner ever adds.
   On insert it forces the attestation columns to their unattested values; on update it
   pins them to `OLD` and applies the clearing rule.

   ```sql
   create function public.credentials_guard()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   declare privileged boolean;
   begin
     new.updated_at := now();

     -- `service_role` is not on this list as shipped, matching `practitioners_guard`:
     -- it holds no write privilege on the table, so naming it pre-authorizes a
     -- bypass rather than permitting one. Nor is `supabase_auth_admin`, and #50
     -- probed the premise that would have argued for it — a referential action runs
     -- as the owner of the table it modifies, so `verified_by`'s `on delete set null`
     -- reaches this trigger as `postgres` rather than as GoTrue's role. The same is
     -- true of `practitioners_guard`, which names it anyway
     --
     -- #50 corrected the shape as well: this gates the pin and nothing else. An early
     -- `return new` skipped the clearing rule and the stamp too, and `bluehex_admin`
     -- holds unrestricted `update` here, so a plain `PATCH` published a badge with no
     -- provenance and repointed a verified credential with the attestation standing
     privileged := current_user in ('bluehex_admin', 'postgres', 'supabase_admin');

     if tg_op = 'INSERT' then
       -- no OLD to pin to: a credential is born unverified
       if not privileged then
         new.verified    := false;
         new.verified_at := null;
         new.verified_by := null;
       end if;

       if new.verified then
         new.verified_at := coalesce(new.verified_at, now());
         new.verified_by := coalesce(new.verified_by, (select auth.uid()));
       else
         new.verified_at := null;
         new.verified_by := null;
       end if;

       return new;
     end if;

     if not privileged then
       new.verified    := old.verified;
       new.verified_at := old.verified_at;
       new.verified_by := old.verified_by;
     end if;

     -- an edit to the claim invalidates the check of it, whoever is editing;
     -- `evidence_public` is deliberately absent — it changes the claim's visibility,
     -- not the claim. `catalogue_id` replaces the old `kind` and `label` pair:
     -- changing which credential you claim is the largest edit there is, and it is
     -- now one column
     if new.catalogue_id is distinct from old.catalogue_id
        or new.earned_at  is distinct from old.earned_at
        or new.evidence_url is distinct from old.evidence_url then
       new.verified    := false;
       new.verified_at := null;
       new.verified_by := null;
     end if;

     -- provenance follows the flag down every path rather than only through
     -- `set_credential_verified()` — the same rule `practitioners_guard` states for
     -- `approved_at` and `approved_by`, and for the same reason: the RPC cannot be the
     -- only door while `bluehex_admin` holds `update`. The `coalesce` leaves the RPC's
     -- own values alone, and a non-privileged caller reaches neither branch
     if new.verified and not old.verified then
       new.verified_at := coalesce(new.verified_at, now());
       new.verified_by := coalesce(new.verified_by, (select auth.uid()));
     elsif not new.verified and old.verified then
       new.verified_at := null;
       new.verified_by := null;
     end if;

     return new;
   end;
   $$;

   create trigger credentials_guard
     before insert or update on public.practitioner_credentials
     for each row execute function public.credentials_guard();
   ```

   **There is deliberately no trigger clearing verification when a *catalogue* row is
   edited**, and the omission is worth stating because the analogy with
   `practitioners_rename_clears_credentials` makes one look missing. Renaming a profile
   clears every badge on it because `name` is attested and the practitioner writes it —
   the person the credentials belong to may have changed. A catalogue label is Bluehex's
   own text, editable only by Bluehex, and correcting a typo in "Prompt engineering" does
   not make anybody's certificate less checked. Clearing on it would let an admin
   tidying the catalogue silently drop every badge in the directory.

   The case that *would* justify one — repointing an entry at a different credential entirely, so everyone's claim now says something they did not claim — is not an edit anybody should make, and **saying so is not enough**. `active` and `on delete restrict` both act on *deletion*: `restrict` refuses `delete from credential_catalogue` while claims exist, and `active` offers retirement instead. Neither touches `update`, and `bluehex_admin` holds unrestricted `update` on the table — so the equally destructive repoint would be one statement, refused by a paragraph. That is the pattern `AGENTS.md` names on `verified`. It is `catalogue_guard` that refuses it.

3. **`catalogue_guard`** — `before update` on `credential_catalogue`. Bumps `updated_at`, which is otherwise never written after insert on a table whose stated correction path is an admin `UPDATE`. And it refuses a change to `kind`, `platform` or `label` on an entry that has claims against it, unless the caller has declared the change a correction:

   ```sql
   create function public.catalogue_guard()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   begin
     new.updated_at := now();

     if (new.kind is distinct from old.kind
         or new.platform is distinct from old.platform
         or new.label is distinct from old.label)
        and current_setting('bluehex.catalogue_correction', true) is distinct from 'on'
        and exists (select 1 from public.practitioner_credentials c
                     where c.catalogue_id = old.id)
     then
       raise exception 'a claimed catalogue entry cannot be repointed'
         using errcode = '23514',
               hint = 'add a new entry and retire this one with active = false, '
                      'or call correct_catalogue_entry() if the wording is wrong';
     end if;

     return new;
   end;
   $$;

   create trigger catalogue_guard
     before update on public.credential_catalogue
     for each row execute function public.catalogue_guard();
   ```

   **The three watched columns are the ones that say which credential the entry *is*, and `course_url` is deliberately not among them.** `kind`, `platform` and `label` are what a claim renders and what the badge therefore asserts, so changing any of them on a claimed entry makes somebody's claim say something they did not claim. A page moving is a link correction: the credential is the same credential, nobody's claim changes meaning, and requiring the escape hatch for it would train admins to reach for the escape hatch.

   **The rename path this appears to block is the reason the escape hatch exists.** The seeding rule above says a course Anthropic renames is an admin `UPDATE` rather than a second migration, and that is still true — but Postgres cannot tell a wording fix from a repoint, because the two are the same statement and differ only in intent. So intent is declared: `correct_catalogue_entry()` sets a transaction-local setting the trigger reads, and is the only sanctioned way to change either column on a claimed entry. Everything else raises.

   The trigger is the enforcement and the RPC is only the signal, which is why this does not repeat the mistake `assign_profile_owner()` was deleted for — an RPC that *is* the enforcement can be bypassed by anyone holding the `update` grant, and this one cannot be, because bypassing it means arriving at the trigger without the setting.

   Deliberately **not** the other available fix — clearing verification on the dependent rows. It would drop every badge in the directory the first time an admin corrects a typo, which is the outcome the paragraph above rules out, and it would treat the repoint as something to compensate for rather than something to refuse.

4. **`clear_profile_verification()`** — one `security definer` function, called by **three** triggers. Each fires when something about *who this profile is* has changed, and none of them is a change to a credential:

   ```sql
   create function public.clear_profile_verification(profile_id uuid)
   returns void language plpgsql security definer
   set search_path = ''
   as $$
   begin
     update public.practitioner_credentials
        set verified = false, verified_at = null, verified_by = null
      where practitioner_id = profile_id
        and verified;
   end;
   $$;
   revoke execute on function public.clear_profile_verification(uuid)
     from public, anon, authenticated, bluehex_admin;
   ```

   It is privileged because a practitioner has no grant on `verified`, and the clear has to reach from the parent down to rows they cannot write. Narrow in the only way that matters: it sets the flag false and can do nothing else. Nobody may call it directly — it exists for the triggers.

   | trigger | fires on | why it is attested |
   | --- | --- | --- |
   | `practitioners_rename_clears_credentials` | `after update of name` on `practitioners`, `when (old.name is distinct from new.name)` | the badge asserts *this person* holds these |
   | `practitioners_claim_clears_credentials` | `after update of user_id` on `practitioners`, `when (old.user_id is null and new.user_id is not null)` | the claim changes which account the person is, which is a larger change than a rename |
   | `contacts_email_change_clears_credentials` | `after update of contact_email` on `practitioner_contacts`, when the referencing profile is still unclaimed | while unclaimed, that address is the credential a claim is checked against |

   **The `when` clause on the first is load-bearing, not decoration.** `update of name` fires when `name` appears in the statement's `SET` list, *whether or not the value changed* — and `supabase.from('practitioners').update(form)` round-trips the whole form object, so without the guard every bio edit would clear every badge on the profile. That is the failure this document's own incentive argument exists to avoid, arriving through the back door.

   **The third is the one that is easy to miss.** An unclaimed profile is claimed by matching the claimer's verified account email against `practitioner_contacts.contact_email` — so while `user_id is null`, that address is not a contact detail, it is the lock. Anyone who can change it can redirect the claim. Making the change clear the badge means a redirected claim inherits an unverified profile, and it costs the legitimate case one re-check on a profile nobody owns yet.

   Once the profile *is* claimed the rule stops applying, because the claim has already happened and the address is back to being ordinary contact information the owner edits freely:

   ```sql
   create function public.contacts_email_change_clears_credentials()
   returns trigger language plpgsql security definer
   set search_path = ''
   as $$
   declare unclaimed_profile uuid;
   begin
     select p.id into unclaimed_profile
       from public.practitioners p
      where p.contact_id = new.id
        and p.user_id is null;

     if found then
       perform public.clear_profile_verification(unclaimed_profile);
     end if;
     return null;
   end;
   $$;

   create trigger contacts_email_change_clears_credentials
     after update of contact_email on public.practitioner_contacts
     for each row when (old.contact_email is distinct from new.contact_email)
     execute function public.contacts_email_change_clears_credentials();
   ```

5. **`set_updated_at()`** — the four tables with no guard of their own. `updated_at` is maintained by trigger everywhere it works: `practitioners_guard`, `credentials_guard` and `catalogue_guard` each bump their own. That leaves `practitioner_contacts`, `practitioner_review_notes`, `service_catalogue` and `practitioner_services` with a column that takes its default at insert and is never written again — and `practitioner_contacts.updated_at` and `practitioner_services.updated_at` are both in the `authenticated` select grant, so they are columns the API serves and that would be wrong. `practitioner_services_cap` does not count as a guard here: it enforces a count and returns `new` untouched. `contacts_email_change_clears_credentials` cannot do the job either: it is an `after` trigger returning null, so it has no `NEW` to assign to.

   ```sql
   create function public.set_updated_at()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   begin
     new.updated_at := now();
     return new;
   end;
   $$;

   create trigger contacts_set_updated_at
     before update on public.practitioner_contacts
     for each row execute function public.set_updated_at();

   create trigger review_notes_set_updated_at
     before update on public.practitioner_review_notes
     for each row execute function public.set_updated_at();

   create trigger service_catalogue_set_updated_at
     before update on public.service_catalogue
     for each row execute function public.set_updated_at();

   create trigger practitioner_services_set_updated_at
     before update on public.practitioner_services
     for each row execute function public.set_updated_at();
   ```

   A timestamp that silently lies is worse than an absent one, which is the alternative this rejects: dropping the column from the tables that will not maintain it. It is kept because all four are edited after creation — a practitioner changes their contact details or rewrites what they offer, an admin rewrites a rejection note or promotes a custom service — and "when was this last touched" is the first question asked of any of them. `service_catalogue` is the one where getting this wrong would repeat a fixed bug rather than introduce a new one: its correction path is an admin `UPDATE`, exactly like `credential_catalogue`, whose frozen `updated_at` is called out in Testing as the case where a stale timestamp misleads most.

6. **`practitioner_services_cap`** — `before insert or update` on `practitioner_services`. The cap of three is what argued for a child table over two array columns, so it is the one mechanism in this section that cannot be left to the form. A `check` cannot express it: counting sibling rows needs a subquery, and the `immutable` helper that would have rescued it is not available either, because counting other rows is by definition not immutable.

   ```sql
   create function public.practitioner_services_cap()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   declare
     held integer;
   begin
     -- serialise writes for this profile. Without it two concurrent inserts
     -- each count two siblings and both commit a third. An advisory lock
     -- rather than `select … for update` on the parent, which would need an
     -- `update` privilege on `practitioners` this caller does not have and
     -- would additionally have to pass that table's own policies
     perform pg_catalog.pg_advisory_xact_lock(
       pg_catalog.hashtextextended(new.practitioner_id::text, 0));

     select count(*) into held
       from public.practitioner_services
      where practitioner_id = new.practitioner_id
        and id is distinct from new.id;

     if held >= 3 then
       raise exception 'a practitioner may list at most three services'
         using errcode = '23514';
     end if;

     return new;
   end;
   $$;

   create trigger practitioner_services_cap
     before insert or update on public.practitioner_services
     for each row execute function public.practitioner_services_cap();
   ```

   **`id is distinct from new.id` is what makes it correct on `update`.** Without it an in-place edit of a legal third row counts that row itself and raises, so a profile that has always been within the cap becomes uneditable the moment it reaches three. It costs nothing on `insert`, where the default has already filled `new.id` and no stored row matches it.

   **It counts rows, not kinds**, which is the whole reason it is one trigger rather than two. Three catalogue rows plus one custom row is four services, and a cap enforced per kind is precisely the half-enforcement that ruled out two array columns.

**Every function here pins `search_path`**, and the `security definer` one qualifies every name inside it. A `security definer` function runs as its owner — `postgres`, since migrations run as `postgres` — and resolves unqualified names through whatever `search_path` is live at call time. PostgREST does not let a client set it per request, so this is hardening rather than a live hole, but Supabase's linter raises it as `function_search_path_mutable` and it costs one line.

**What the schema cannot reach.** None of this constrains a malicious *admin*, who can edit the contact email, claim the profile and re-verify it in three steps. Postgres has no answer to that and neither does any amount of policy. What the design buys is that each of those steps is attributed and the badge visibly drops in between, so the sequence leaves a trail rather than happening silently — proportionate when the admins are Bluehex itself and there are very few. It also bounds the damage from every *non*-admin path: the worst outcome of a claim that should not have happened is an **unverified** profile carrying somebody's name, which is vandalism an admin can undo, not a stolen credential.

### RPCs

`bluehex_admin` only, `security invoker`, no authorization logic inside — Postgres refuses the call to anyone else.

- `approve_practitioner(profile_id)` / `reject_practitioner(profile_id, note)` — as #35, except that both now touch `practitioner_review_notes` rather than a column: `reject` upserts the note, `approve` deletes it.
- `set_credential_verified(credential_id, value)` — replaces `set_practitioner_verified`. Verification is per credential now. It returns the credential, as the two above return the profile, and it stamps `verified_at` and `verified_by` from `auth.uid()` rather than taking them — with both cleared when `value` is false, because a credential that is not verified was not verified by anybody, at no time.
- `correct_catalogue_entry(entry_id, new_kind, new_platform, new_label)` — the sanctioned way to fix the wording of a catalogue entry that already has claims against it. It declares intent and nothing else:

  ```sql
  create function public.correct_catalogue_entry(
    entry_id uuid, new_kind text, new_platform text, new_label text)
  returns void language plpgsql
  set search_path = ''
  as $$
  begin
    perform set_config('bluehex.catalogue_correction', 'on', true);
    update public.credential_catalogue
       set kind = new_kind, platform = new_platform, label = new_label
     where id = entry_id;
    -- #50 turns it back off: transaction-local is not statement-local, and left on the
    -- declaration disarms the guard for everything that follows in the same transaction.
    -- After any `found` check, never before one — `perform` assigns `FOUND` itself
    perform set_config('bluehex.catalogue_correction', 'off', true);
  end;
  $$;
  ```

  It takes all three watched columns rather than only the one being corrected, and every caller passes the current value for the two it is not changing. The alternative — nullable parameters meaning "leave this alone" — makes an omitted argument and an intended `null` the same call, on the columns where getting it wrong rewrites what somebody's badge asserts. `course_url` is absent for the reason the guard does not watch it: a link correction is a plain `UPDATE` and needs no declared intent.

  `security invoker`, like the rest — an admin already holds `update` on the table, so this borrows no privilege and adds no reach. `set_config(..., true)` is transaction-local, so the setting does not survive into another caller's session — and #50 turns it back off before returning, because transaction-local is not statement-local and a declaration left standing disarms the guard for every statement after it in the same transaction. What it buys is that the destructive version of the same statement now requires a different call, which is the whole of `catalogue_guard`'s value: `active` and `on delete restrict` already make the destructive *delete* the harder path, and this makes the destructive *update* match.

**`assign_profile_owner()` is gone.** Claiming is a plain `PATCH` setting `user_id`, and `practitioners_guard` stamps `owner_assigned_at/by` on the way through — which is strictly better than the RPC was, because an RPC can be bypassed by anyone holding the `update` grant and a trigger cannot. The ones that remain earn their place: two write across tables atomically, three write provenance from `auth.uid()` rather than from whatever the caller passes, and the fourth carries an intent no `PATCH` can express.

### The rollup, in the client

The badge is derived where it is rendered:

```
badge = credentials.length > 0                      // at least one credential
     && credentials.every(c => c.verified)          // and every one is verified
```

It lost its `earned_at` filters when in-progress rows were removed — every row is earned
now, so there is no subset to take. The progress figure beside it is the other half of the
same derivation, and it needs the catalogue rather than the profile:

```
progress = { held: credentials.length, total: catalogue.filter(e => e.active).length }
```

The directory is a client component that fetches every profile and filters in the
browser, so this costs nothing today. Materialise it into a column when that stops being
true.

## Testing decisions

The #35 proof is 46 assertions against the local stack through PostgREST. It becomes a
committed test alongside the first migration rather than a shell script. What changes:

**Moves to the credentials table** — every assertion about writing `verified`. A
practitioner `PATCH`ing `{"verified": true}` on their own credential must be refused, and
must still be refused after the column grant is restored by hand. That backstop test is
the most valuable one in the suite and it transfers directly.

**New, and each one guards a rule that would fail silently:**

- Adding a credential to a verified profile leaves the existing credentials verified and
  the new one unverified — the incentive property the whole design turns on.
- Editing a credential's `catalogue_id`, `earned_at` or `evidence_url` clears *that*
  credential's verification. Editing `evidence_public` does **not**.
- Renaming a profile clears verification on **every** credential. And the negative case,
  which is the one that actually bites: saving a profile whose `name` is **unchanged** —
  the whole form object round-tripped, `name` included — leaves every credential verified.
  `update of name` fires on targeting rather than on change, so this asserts the trigger's
  `when (old.name is distinct from new.name)` clause is present.
- Editing `bio`, `headline`, `focus`, `availability`, `location` or any of the four
  published link columns clears nothing, and leaves `status` untouched. Adding, editing or
  removing a `practitioner_services` row of either kind clears nothing either — it is a
  child table now, so this is an assertion about a different table rather than a column.
- **`https_url` refuses what it is there to refuse.** `javascript:alert(1)`, `data:…`,
  `http://example.com` and `https:///foo` are all rejected on `practitioners.website_url`,
  on `practitioner_credentials.evidence_url` *and* on `credential_catalogue.course_url`; `HTTPS://Example.com` is accepted, so
  the check is case-insensitive as intended. This is the backstop for the only mechanism
  standing between a practitioner-written string and an `href` on a public page.
- `anon` can read `website_url`, `github_url`, `linkedin_url` and `booking_url`, and a
  practitioner can write all four on their own profile — the grant lists are maintained by
  hand, so a column added later is unreadable and unwritable until it is named.
- `anon` selecting `evidence_url` is refused; selecting `evidence_url_public` returns
  null while `evidence_public` is false and the URL once it is true.
- `anon` has no access to `practitioner_contacts` by any route, including a filter.
- A practitioner cannot insert a credential against a profile that is not theirs, and
  cannot see credentials of an unclaimed profile.

**Row level security, which every assertion above is blind to.** These are written from a *second* signed-in account rather than from the row's owner, and that is the whole point: an owner-access assertion passes identically whether RLS is on or off, so a suite made entirely of them proves nothing about whether the policies ever execute. One per table, and each fails loudly if the `enable row level security` line is dropped from a later migration:

- **A second practitioner cannot read another's `practitioner_contacts` row** — not by id, not by filter, not by selecting the whole table. Without RLS the `authenticated` select grant hands every contact email and phone number in the database to any signed-in account, which is the entire content of the table whose reason for existing is that it cannot be leaked.
- **A second practitioner cannot update another's contact row.** With RLS off this is the sharpest path in the schema: repoint an unclaimed profile's `contact_email` at your own address and then claim it. `contacts_email_change_clears_credentials` means the profile arrives unverified, so the badge holds — but the profile is taken.
- **A second practitioner cannot read another's `practitioner_review_notes` row.** This is the assertion that moving `review_note` off the profile was supposed to buy, and it is bought by the policy rather than by the table, so it has to be tested against the policy.
- **A second practitioner cannot update or delete another's `practitioner_credentials` row**, and `anon` cannot see credentials belonging to a `pending`, `rejected` or `withdrawn` profile. The grants to `authenticated` are table-wide on purpose; only `credentials_rw_own` narrows them.
- **A second practitioner cannot update or delete another's `practitioner_services` row**, and `anon` cannot see the services of a `pending`, `rejected` or `withdrawn` profile. Same shape as credentials and for the same reason — `delete` cannot be column-scoped at all, so `services_rw_own` is the only thing between any signed-in account and every practitioner's services. With RLS off, what a person in the directory says they sell is editable by anybody with an account. `service_catalogue` needs no assertion of its own here: the write it must refuse is refused by an absent grant rather than by a policy, and the catalogue test below already covers it from that side.

**The catalogue, where the whole point is what a practitioner cannot do:**

- **A practitioner cannot insert, update or delete a `credential_catalogue` row.** This is
  the assertion that the credential model still constrains anything: the free-text hole did
  not close by removing `label`, it closed by making the only source of labels admin-owned.
  Assert it directly rather than inferring it from the absent grant, because a later
  migration re-granting the table would leave every other test in the suite passing.
- **A credential cannot reference a catalogue row that does not exist**, refused by the
  foreign key rather than by a trigger.
- **The same catalogue entry cannot be claimed twice by one practitioner**, refused by
  `unique (practitioner_id, catalogue_id)` — and *can* be claimed by two different
  practitioners, which is the normal case and would be broken by a unique constraint
  written one column short.
- **A credential cannot be inserted with `earned_at` null.** In-progress rows are gone and
  `not null` is the whole enforcement; a test asserting it stops the concept returning as
  data after the prose that removed it has been forgotten.
- **Deleting a catalogue entry that has claims against it is refused** (`on delete
  restrict`), and setting `active = false` on the same row succeeds and leaves every claim
  verified. This is the pair that stops a tidy-up from silently dropping badges across the
  directory.
- A retired (`active = false`) entry is still readable by `anon`, so a profile holding it
  still renders. The picker's filtering of `active` is a query concern and is not asserted
  here.
- **`anon` and `authenticated` can read `kind`, `platform` and `course_url`**, and neither
  can write any of them. This is the assertion that catches a forgotten `grant select (…)`
  after a column is added: reads here are column-scoped, a new column inherits no privilege,
  and the refusal is `42501` before any policy runs — so it fails closed and silently, and
  every other test in this file goes on passing while the picker cannot see the column.
- **`kind` and `platform` each refuse a third value**, `23514` from their own check
  constraints. Two genuine two-value axes, asserted separately: one list widened by accident
  would otherwise be invisible.
- **Repointing a claimed entry is refused with an exception**, and the same statement through `correct_catalogue_entry()` succeeds and leaves every claim verified. Assert on the error rather than on the row being unchanged, as with `A → B` below. The pair with the `on delete restrict` assertion above is the point: the destructive `update` and the destructive `delete` are now equally hard, where before only one of them was.
- **An unclaimed entry is renamable by a plain `UPDATE`**, which is the case the guard must not catch — it fires on claims, not on the columns.
- **`updated_at` moves when a catalogue row is corrected.** Trivial to assert and easy to ship broken, because a column with a default reads plausibly forever — and this is the table whose corrections are `UPDATE`s by design, so it is the one where a frozen timestamp misleads most.

**`services`, where the schema is doing work a form cannot:**

- **A fourth service is refused**, and the assertion has to be written across *both* kinds —
  three catalogue rows plus one custom row is four services and must fail. A cap tested only
  against catalogue rows passes while the profile shows four, which is precisely the
  half-enforcement that killed the two-array-column shape.
- **A row naming both a `catalogue_id` and a `label` is refused**, and so is a row naming
  neither, by `num_nonnulls(...) = 1`. These are the two states the "or" exists to exclude,
  and neither is reachable through the form, which is why the constraint rather than the
  form has to say so.
- **A whitespace-only label is refused**, and the assertion has to use a tab or a newline
  rather than spaces. `btrim` with one argument strips spaces only, so a constraint written
  that way passes a spaces-only test and accepts `E'\t'` in production — a test that proves
  the wrong thing. The constraint is `label ~ '[^[:space:]]'` for exactly this reason.
- **`updated_at` moves when a service row or a catalogue row is edited**, maintained by
  `set_updated_at` on both tables since neither has a guard of its own. `practitioner_services.updated_at`
  is in the `authenticated` select grant, so it is a column the API serves.
- **Editing a service row in place does not trip the cap.** A profile holding three
  services can still change one of them: the cap excludes the row being updated from its own
  count, and a trigger written without that exclusion refuses every edit at exactly three —
  a bug that is invisible until somebody reaches the limit.
- **The same catalogue service cannot be listed twice** by one practitioner, and **can** be
  listed by two different practitioners — the second half being the normal case, and the one
  a unique constraint written a column short would break.
- **Two custom labels that differ only in case or spacing are both allowed.** This is
  deliberate rather than an omission: they are free text, they do not filter, and refusing
  them would mean adjudicating string similarity in a constraint. It renders as a duplicate
  on one profile and promotion fixes it permanently.
- **A practitioner cannot insert into `service_catalogue`**, which is the assertion that the
  filter vocabulary is still closed. Assert it directly rather than inferring it from the
  absent grant — a later migration re-granting the table would leave every other assertion
  here passing.
- **A profile with no services at all is legal and publicly readable.** A practitioner who
  has not said what they sell is not a broken profile.

**`practitioner_contacts`:**

- **A profile cannot be inserted without a `contact_id`.** The insert is refused by `not null` on the column, not by a trigger or a check — so this asserts the foreign key points the way the design needs it to. Two profiles cannot share a contact row either, which is the `unique`.
- A practitioner can read back a contact row they wrote before any profile pointed at it, and cannot read one written by somebody else.
- After claiming a curated profile, the new owner can **read and edit** the contact row **Bluehex** wrote — the profile clause of `contacts_read_own` and `contacts_update_own`, easy to omit and failing as "my own details are invisible to me". **This bullet and the policy disagreed for two revisions, and #49 settled it the bullet's way**: the `with check` naming `created_by` alone was defending against a reassignment the column grant already refuses, and its only live effect was locking the claimer out. A separate assertion covers reassignment, where it belongs — at the privilege layer.
- **A profile insert cannot point at a contact row somebody else wrote.** `contact_id` is in the `authenticated` insert grant, so without `owns_contact` in `practitioners_insert_own` a profile insert is a read grant on any unused contact row — the profile clause of `contacts_read_own` then answers true for the caller. `unique (contact_id)` is not that assertion: it covers the row that is already taken, not the one going spare. The clause reads `contact_id is null or owns_contact(contact_id)` because row level security is checked *before* column constraints on insert — without the first half the policy answers `42501` for a row whose real problem is a missing `contact_id`, and the bullet above it stops testing what it says it tests.
- **The author of a contact row loses it when the profile above it changes hands**, in both directions — no read and no write. The reassignment is two legal steps, so this is a state the admin flow reaches on purpose.
- **`approved_at` and `approved_by` are written when an admin PATCHes `status` rather than calling the RPC, and cleared when the profile stops being approved.** The trigger is the only thing that holds down both paths, and the assertion has to be written from the PATCH to prove it.
- **A note edited outside `reject_practitioner()` restamps `written_at` and `written_by`.** An admin holds `update` on the table, so the RPC is not the only way the text changes, and `written_at` is served to the practitioner the note is about.
- A practitioner cannot write a contact row with somebody else's `created_by`, and cannot reassign an existing one to themselves. `with check` names only the first clause of that policy for this reason.
- **`updated_at` moves when a contact row or a review note is edited.** It is in the `authenticated` select grant on contacts, so it is a column the API serves; neither table has a guard trigger of its own, and `set_updated_at` is the only thing writing it.

**Ownership, where the rule is a state machine rather than a permission:**

- `null → A` claims the profile, stamps `owner_assigned_at/by` from `auth.uid()` **without the caller setting them**, and clears verification on every credential.
- `A → B` is **refused with an exception**, for `bluehex_admin` as much as anyone. This is the one place the design raises rather than pinning silently, so assert on the error rather than on the row being unchanged — a test that only checks the value would pass against a silent pin, which is the wrong behaviour.
- `A → null` is allowed and forces `withdrawn`.
- Unassign-then-reclaim gets a mis-assigned profile to the right account in two legal steps, with the badge cleared at the end of it.

**The claim credential:**

- Changing `contact_email` while the referencing profile is unclaimed clears verification on every credential of that profile.
- Changing it **after** the profile is claimed clears nothing — the address is ordinary contact information once ownership is settled, and a test that misses this direction would make every verified practitioner lose their badge for updating their own email.

**Review notes:**

- The owner reads their own note; another signed-in practitioner reading it is refused, including by filter. This is the assertion that would have caught `review_note` being a column.
- No practitioner can write, edit or delete a note on any profile, their own included.
- `approve_practitioner()` removes the note; `reject_practitioner()` writes one with `written_by` set from `auth.uid()`.

**Deletion, which has the subtlest failure mode in the design:**

- Deleting an `auth.users` row leaves the profile present, unowned and `withdrawn` —
  rather than erroring on a dangling reference, which is what happens if the guard
  trigger pins `user_id` back.
- **The account being deleted must have *done* things, or the assertion above passes on a fixture that never exercises the failure.** The one that bites is a self-service practitioner who wrote their own contact row: `created_by` defaults to `auth.uid()`, so a `NO ACTION` foreign key there refuses the delete outright with `23503` on `practitioner_contacts_created_by_fkey`, and the profile never gets as far as being withdrawn. So the fixture is a practitioner who wrote their own contact row, whose profile is approved and whose credential is verified, and the assertion is that the delete succeeds, the profile is present, unowned and withdrawn, and the contact row survives with `created_by` null.
- **Deleting an admin's `auth.users` row succeeds** with `approved_by`, `owner_assigned_by`, `verified_by` and `written_by` all nulled, rather than being blocked by every profile they ever approved and every credential they ever checked. Attribution is the thing this design trades away at account deletion, and the test is what says so out loud.
- A withdrawn profile is invisible to `anon` and to other practitioners, and still
  visible and editable to its owner.
- `withdraw_profile()` affects only the caller's own row, and a practitioner cannot use
  it to withdraw somebody else.
- Erasing a profile removes its credentials, its review note and its contact row. **The contact is a second statement, not a cascade** — the profile holds the foreign key now, so deleting the profile leaves the contact behind. A test that only asserts the profile is gone will pass while the PII stays.
- Orphaned contact rows — written, never referenced — are readable by the practitioner who wrote them and by nobody else, and the sweep removes only rows no profile points at.
- **A practitioner cannot erase their own profile.** `DELETE /practitioners?id=eq.<own>`
  is refused at the privilege layer — there is no `delete` grant to `authenticated` and no
  `practitioners_delete_own` policy. Leaving is `withdraw_profile()`; erasure is an admin
  action. This is the assertion that would have caught the grant being inherited from #35
  after the premise for it was removed.

**Reading the results.** PostgREST answers `401` for `anon` and `403` for a signed-in
caller on the same `permission denied`. The status code reports who asked, not what was
decided — asserting on it as though it were the authorization outcome will write a test
that passes for the wrong reason.

**Not tested, deliberately:** the rollup rule and the progress figure. Both are client-side derivation over data the tests already cover, and a test of either would assert an expression against itself.

## Deletion: withdrawal, erasure, and the seam for downstream records

Three different things were being conflated under "delete", and separating them makes
each one easy.

### Withdrawal is a status

**Decided.** `withdrawn` joins the status enum. The profile stops being public
immediately, keeps its credentials and its verification history, and the practitioner can
come back without re-entering anything.

**No policy changes are needed to add it.** The public read policy is
`using (status = 'approved')` — an allow-list, so a new state is invisible the moment it
exists. The owner policy shows your own row in any state, so a withdrawn practitioner can
still see and edit their profile. Fail-closed, for free.

A practitioner cannot write `status`, by design, so withdrawal is `withdraw_profile()` —
a narrow `security definer` RPC granted to `authenticated` that affects only the caller's
own row. That is the second privileged function in the design, and like the first it only
ever reduces what is visible.

Coming back goes to `pending`, not straight to `approved`: content may have been edited
while withdrawn, so nothing returns to public view without a current admin decision.
Remembering the prior status to restore it is machinery that buys one admin click.

### Deleting an account withdraws the profile; it does not orphan it

**Decided.** `user_id` is `on delete set null`, with a trigger forcing
`status = 'withdrawn'` when it transitions to null. `on delete cascade` was the earlier
call and `set null` was rejected for leaving a published profile about someone who had
just withdrawn — that objection only held while status was untouched.

**A trap to prove rather than assume.** The FK's `set null` fires as an `update` on
`practitioners`, so the guard trigger sees it — and the guard pins `user_id` to its old
value for non-admin callers, which would undo the FK action and leave a dangling
reference. `supabase_auth_admin` must be in the guard's allow-list alongside
`bluehex_admin`, `service_role` and `postgres`. The assertion is: deleting an
`auth.users` row leaves the profile present, unowned and withdrawn, rather than erroring.

**A second trap, and it fires earlier than the first.** `user_id` is not the only reference to `auth.users`: `approved_by`, `owner_assigned_by`, `verified_by`, `written_by` and `practitioner_contacts.created_by` all point at the same table, and a foreign key with no `on delete` action is `NO ACTION`, which *refuses* the delete rather than doing anything to the child row. So one row anywhere in that set and the delete raises `23503` before `practitioners` is reached at all — the `set null` above and the `supabase_auth_admin` entry in the allow-list are both correct and both unreachable. Every one of them is `on delete set null`; `created_by` gave up its `not null` to be able to say it. The failing case is not exotic: a practitioner who wrote their own contact row and later deletes their account is the ordinary self-service path, and it is the fixture the test has to use.

### Erasure is hard, and it is an admin action

**Decided.** A practitioner asking to be erased gets erased: profile, credentials, review note and contact row all deleted. It is a deliberate act on request rather than something that also fires when someone deletes a login they no longer use.

**Two statements, not one cascade.** Credentials and the review note are children of the profile and go with it; the contact row is its *parent* and does not. So erasure reads:

```sql
delete from public.practitioners where id = $1;      -- cascades credentials + note
delete from public.practitioner_contacts where id = $2;
```

That ordering is forced — the contact cannot go first while a profile still references it. It is the one place the flipped foreign key costs something rather than saving something, and the cost is a second statement in an admin-only path. Worth stating plainly because the failure is silent: erase a profile, forget the second delete, and the person's email address stays in the database after you have told them it is gone.

Hard delete is safe today because nothing downstream exists to break — see the seam
below, which is what keeps it safe later.

**Rejected: `deleted_at` soft delete.** It adds a fourth visibility axis on top of
`status`, `verified` and ownership, so every policy, grant and query must filter
`deleted_at is null` forever and missing one serves a deleted profile. It also retains
the personal data, so it costs a permanent tax and buys nothing on privacy. Worse, it
cannot satisfy both retention and erasure at once: it keeps a person's data alive to
serve records that should never have depended on it, leaving you unable to honour an
erasure request without breaking your own business records.

### The seam: downstream records own their own copy

**Not built. This is a boundary, recorded so the future work slots into it.**

Engagements, invoices, hire requests and anything else recording that a practitioner *did
something* are outside scope.md's marketplace boundary and are not being built. When they
are, the rule is:

> A downstream record **duplicates the identity it needs at the time of the event**, and
> holds an **optional** reference to the profile — `on delete set null`. It never depends
> on the profile row to render itself.

An invoice does not re-render the customer's current address; it captured it when it was
issued. The same applies here, and it is what lets erasure and retention coexist: the
person can be deleted, and the transaction record still stands on its own with whatever
legal retention it carries.

**Nothing is needed now to keep this option open.** The profile already has a stable UUID
that is never reused, which is the only thing a downstream record requires.

### Retention: two clocks, not one

**Personal data** on a withdrawn profile — kept until the practitioner asks for erasure,
stated in the privacy policy. A fixed retention window with automatic erasure is more
defensible and needs a scheduled job; not worth it at this volume, and revisit if the
directory grows.

**Transaction records**, when they exist, run on whatever the legal obligation is. Once
identity is captured at the time of the event they are not personal data in the same
sense, which is the entire point of the seam.
