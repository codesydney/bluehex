# Profile editor — the decision

**Decided 2026-08-15: the stepped form, with the live preview alongside it throughout.** Two of the three shapes drawn, combined. Neither was right on its own and each fixes the other's main weakness.

`pnpm dev`, then <http://localhost:3000/prototype/profile>.

**This is a drawing, not an implementation.** No validation, no persistence, no auth. Kept so #14 has something to build from, and so curated intake has a concrete field list to collect against; delete it as it is replaced.

## Why this combination

**The steps are for the first-timer.** Publishing a profile means handing credentials to a stranger to be checked, and one long form asks for all of that at once with no account of what is about to happen to it. Pacing it buys the *What happens next* step, which is the only place in the flow where the two axes can be explained at the moment they become true.

**The preview stops the pacing from hiding the whole.** A wizard's usual failure is that you never see the thing you are making until you have finished making it. Here it is on screen from the first keystroke, and the step nav is free rather than a track, so nothing traps you.

**And the preview does something no wording can.** On the Contact step you type an email address and the preview does not move — which is the rule that contact details are never published, demonstrated instead of asserted. Same for an evidence link with its opt-in switched off. In the other shapes that guarantee was a sentence under a field.

## What was given up

**The single long form** was the best shape for *editing* — coming back to fix a typo wants the field, not a journey. This is a real loss and the likely follow-up: if editing an existing profile turns out to be awkward in steps, it should become a flat form reusing the same field components, with the stepped version kept for first submission only. Worth deciding when there is a real profile to edit rather than now.

## What the built version has to be held to

**1. This form is the curated-intake checklist.** That is why it was drawn before #14. `scope.md` requires phase one to collect the full phase-two field set, because going back to twenty-five people for a field nobody asked for is a fortnight of chasing humans and spends goodwill with exactly the people the directory wants. The writable set, read off the grants:

- **Profile** — `name`, `headline`, `location`, `country_code`, `bio`, `focus`, `services`, `availability`, `website_url`, `github_url`, `linkedin_url`, `booking_url`
- **Contact** — `contact_email` (required), `contact_phone`, `contact_note`
- **Per credential** — `catalogue_id`, `earned_at`, `evidence_url`, `evidence_public`

The credential list shrank by two and they did not move, they left: `source` and `label` are properties of the catalogue entry now, so there is nothing about them for intake to collect. What intake collects instead is which entry, which is a choice from a list rather than a field to fill in — and that is a cheaper question to ask twenty-five people than the two it replaced.

**2. The evidence opt-in is collected with the URL, not after it.** `evidence_public` defaults false and is a genuine privacy trade — a Skilljar page carries the holder's full legal name permanently, against an employer who has never heard of Bluehex finding a clickable certificate worth more than the word "Verified". Asking later means asking twice, and the second ask is the one that does not get answered.

**3. ~~"Still working towards this" stays an explicit control.~~ Superseded 2026-08-16 — in-progress credentials are gone from the model.** It read: *"It is how `earned_at` becomes null, and an in-progress credential is a real row rather than a missing one — it is how somebody appears in the directory before they have finished anything. A form that only accepted completed credentials would silently exclude the group the directory exists to include."*

The worry was right and the mechanism was wrong. `earned_at` is `not null` now, so the control has no state left to produce — but nothing about inclusion has been given up, because the exclusion it feared never came from the form. Somebody with nothing earned still has a profile, a headline, focus areas and services, and is still in the directory; what they no longer have is a row asserting a course they have not finished, which nobody could ever check and which rendered wearing the same shape as one a human had read.

**What replaced it is on the same step**: the Credentials step shows how much of the catalogue you hold and, folded away, the whole track with your holdings marked against it. That is strictly more than the control was offering — it shows every course rather than only the ones somebody remembered to type in — and it asks nothing of the practitioner, because the catalogue is Bluehex's own list. The form now only accepts completed credentials, and the group the old wording worried about is served by the surface beside them rather than by a row.

**4. Nothing on this form sets `verified` or `status`, and the form says so.** Both are shown read-only. This is the only place a practitioner ever learns who decides, and a form that merely *omitted* them would leave people assuming the fields were coming later.

**5. `bio`, `focus`, `services`, `availability` and the four links are outside what the badge attests to.** It covers evidence-backed claims and the name attached to them, never self-described expertise. This is said under the services picker as well as the focus one now, and the services wording is the one to keep: `services` reads more like a commitment than `focus` did, and a visitor who filtered by "code review" and landed on a badged profile is one step from reading the badge as Bluehex endorsing the service. The links carry their own version of it, because a repository looks like evidence of work and is not evidence *Bluehex checked*.

**6. Editing a credential's claim clears its check, and the preview shows it rather than saying it.** `credentials_guard()` clears `verified` on a change to `catalogue_id`, `earned_at` or `evidence_url` — and deliberately not on `evidence_public`, which changes the claim's visibility rather than the claim. It was four columns; `catalogue_id` absorbed the `source`/`label` pair, so "which credential you claim" is one reference rather than two free-text fields. The editor mocks the trigger in `profile-editor.tsx` so the ✓ leaves the preview as you repick a verified credential, and stays put when you flip the publish opt-in. Both halves matter: the exemption is the one a practitioner most needs to hear, because "this costs you your badge" is a reason to leave the opt-in off, which is the opposite of point 2.

**7. Creating a profile is two requests, and the UI cannot pretend otherwise.** The contact row is written first and `practitioners.contact_id` is `not null`, so an abandoned submission leaves an orphaned contact row rather than a published profile nobody can reach. That is the harmless direction, but it is not atomic.

## ~~Open, and blocking #49~~ Closed 2026-08-16 — `job_function` is dropped

It read: *"**`job_function` is proposed here and is not in the spec.** The case is the `country_code` case: `headline` is prose and `focus` is technology, so neither answers "show me the designers" — only a closed set filters. Single-select rather than an array, because `focus` is already the plural axis and a multi-select lets everyone tick everything, which is how a filter stops narrowing anything. Nullable, and no "Other", since that reliably becomes the largest bucket and means nothing. If it stays, it needs adding to the spec's DDL, the practitioner-writable grant lists and the directory's filters before #49 lands."*

**It did not stay, and it lost to something rather than being talked out of.** `services` — a closed, multi-select set of what a visitor can *buy* — took the filter axis, and `job_function` was proposed to solve exactly the problem `services` solves better. The half of the argument above that was right is the half that survives: `headline` is prose and `focus` is technology, so neither filters, and a closed set beside them was genuinely missing. What it got wrong was which closed set. "Engineering" describes what a practitioner *is*, which a visitor can neither buy nor usefully narrow by, since almost everyone here would tick it.

Keeping both was the option nobody wanted: two closed vocabularies on one screen with no answer to which a visitor should use.

**Two things from that paragraph carried over and one is now moot.** The multi-select worry carried: `services` genuinely is plural, so it reopens exactly the "everyone ticks everything" failure single-select avoided, and the answer is the cap of three — enforced by a `cardinality` check rather than by the form, because a form-only rule is not a rule. The no-"Other" reasoning carried unchanged. The `''`-versus-`null` trap is moot, because `services` is an array with an empty default and there is no unset option to give a value to.

---

# Round two — the catalogue, services, and the fields #73 left out

**2026-08-16.** The spec settled four things and the editor was drawn against them: credentials reference a Bluehex-owned catalogue, in-progress rows are gone, `services` replaces `job_function` as the directory's axis, and `availability` is a sentence. The four published link columns landed in #73 with no fields on this form; they are here now.

## The credential picker is one select, not two

**Decided: one `<select>` over the whole catalogue, with an `<optgroup>` per source.** The alternative was source first, then credential, and it loses on three counts.

A practitioner knows what they hold; they do not necessarily know which of Bluehex's two buckets it files under. Asking for the source first asks a question about our data model before the one they came to answer.

It also re-creates the pairing the catalogue exists to delete. Two selects means a stale pair is representable in between — source changed, credential not yet — and the second control has to reset itself whenever the first moves, which is a state bug for no gain. One select cannot be in a state that disagrees with itself.

And the cardinality does not need it. Two dozen entries across two groups is comfortably one select, and `<optgroup>` shows the weight distinction without making it a separate decision. Revisit when the catalogue is long enough that scrolling it is the complaint — a filter box over one list is the next step, not a second select.

Two things the picker does that a text input could not, and both are constraints from the schema rather than manners: retired entries are not offered (`active` filters the picker, while a profile holding one still renders), and an entry already on the profile is disabled rather than refused after the fact (`unique (practitioner_id, catalogue_id)`).

## Progress: the figure is the editor's, the catalogue is on the profile behind a control

**Decided, and corrected once mid-implementation.** Three surfaces, three answers:

- **The roster** shows held credentials and nothing else. No catalogue, no figure, no counts. It is dense and stays dense.
- **The profile page** opens on what somebody holds, with a control revealing the rest — **Earned** (default) / **Not earned** / **All**.
- **The editor** shows "2 of 23" and, folded away, the whole track with holdings marked. This is where the motivating framing belongs, because the reader is the practitioner looking at their own record.

The first draft of this put the whole catalogue on the profile page inline, and that was wrong on space before it was wrong on anything else: two dozen rows push the two or three credentials that are the point of the page below the fold, so the visitor reads what somebody has not done first. Default to held, and let the rest be asked for.

**The number stays in the editor and does not follow the control onto the page.** The same figure reads two ways and the reader decides which: to its owner it is a track with a next step on it, and to an employer it is nine percent. So the profile's buttons carry no counts — opening the list is the visitor's choice, and being handed the ratio unasked is not the same thing.

In the editor the track is collapsed rather than laid out, which is the one thing drawing it settled. Expanded, twenty-three rows of mostly "not yet" is the discouraging reading the public page is being spared, delivered to the one person it is meant to encourage. Folded, the number is the message and the list is there for anybody who wants it.

## "In progress" is the word to avoid, and it is the natural one

**This is the most important line in this file for whoever draws this surface next.** The unearned entries on the profile page are labelled **Not earned**, never *In progress*, and the label is not a matter of taste.

The whole argument for deleting in-progress credential rows was that "working towards" is an unfalsifiable claim nobody can check. A heading saying *In progress* over the unearned half of the catalogue makes exactly that claim **automatically, on the practitioner's behalf, for every credential they have not taken** — that Mara Ellison is working through twenty-two courses she has never opened. That is strictly worse than the rows that were removed, because those were at least opt-in and this would be a default.

It is the same reasoning that removed the rows, arriving one layer up in the UI, which is why it is easy to miss: the model is clean and the mistake is made in a heading. The list carries a sentence saying what it is and is not, for the same reason.

**Anything implying intent, effort or enrolment is out.** "Not earned", "Remaining" and "Rest of the catalogue" are all fine. "In progress", "Working towards", "Studying" and "Up next" are not, however naturally they come.

## The links are on the first step, not with the contact details

**Decided, and it is the model's own test drawn.** `website_url`, `github_url`, `linkedin_url` and `booking_url` sit under *Where to find you* on the You step; `contact_email` and the rest stay on Contact.

Grouping them by "ways of reaching me" would have put them together and broken the demonstration the Contact step exists for — you type an address and the preview does not move. A published link on that same panel contradicts the caption above it. Splitting them puts the distinction on screen instead: a route to a *page* is public, a route to a *person* is not, and each step says which it is holding.

## The cap is shown before it binds

`services` is capped at three. The picker keeps a live count, and options that would exceed the cap go disabled rather than silently refusing a click. A cap a form does not show is one somebody meets as an error after they have already decided what they wanted — and the disabled state says "unpick one" without anybody having to write it, though it is written anyway.

The database enforces it again with a `cardinality` check. That is not belt and braces: a rule enforced only in a form is not a rule, and this one is the difference between a filter that narrows the roster and one that matches everybody.

## Settled while drawing this

The editor does **not** trip the spec's profile-identity gate. That gate is on "the first per-profile route", and an editor is "my profile" keyed on `auth.uid()` with no identifier in the URL. A *public* profile page would force the slug decision; nothing here does.
