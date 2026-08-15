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

- **Profile** — `name`, `headline`, `location`, `country_code`, `bio`, `focus`
- **Contact** — `contact_email` (required), `contact_phone`, `contact_note`
- **Per credential** — `source`, `label`, `earned_at`, `evidence_url`, `evidence_public`

**2. The evidence opt-in is collected with the URL, not after it.** `evidence_public` defaults false and is a genuine privacy trade — a Skilljar page carries the holder's full legal name permanently, against an employer who has never heard of Bluehex finding a clickable certificate worth more than the word "Verified". Asking later means asking twice, and the second ask is the one that does not get answered.

**3. "Still working towards this" stays an explicit control.** It is how `earned_at` becomes null, and an in-progress credential is a real row rather than a missing one — it is how somebody appears in the directory before they have finished anything. A form that only accepted completed credentials would silently exclude the group the directory exists to include.

**4. Nothing on this form sets `verified` or `status`, and the form says so.** Both are shown read-only. This is the only place a practitioner ever learns who decides, and a form that merely *omitted* them would leave people assuming the fields were coming later.

**5. `bio` and `focus` are outside what the badge attests to.** It covers evidence-backed claims and the name attached to them, never self-described expertise — and `focus` is what drives the directory's filters. Said under the focus picker; keep it said.

**6. Creating a profile is two requests, and the UI cannot pretend otherwise.** The contact row is written first and `practitioners.contact_id` is `not null`, so an abandoned submission leaves an orphaned contact row rather than a published profile nobody can reach. That is the harmless direction, but it is not atomic.

## Open, and blocking #49

**`job_function` is proposed here and is not in the spec.** The case is the `country_code` case: `headline` is prose and `focus` is technology, so neither answers "show me the designers" — only a closed set filters. Single-select rather than an array, because `focus` is already the plural axis and a multi-select lets everyone tick everything, which is how a filter stops narrowing anything. Nullable, and no "Other", since that reliably becomes the largest bucket and means nothing.

**If it stays, it needs adding to the spec's DDL, the practitioner-writable grant lists and the directory's filters before #49 lands.** No schema lands before the model it encodes is settled, so nothing about it touches the production types yet.

## Settled while drawing this

The editor does **not** trip the spec's profile-identity gate. That gate is on "the first per-profile route", and an editor is "my profile" keyed on `auth.uid()` with no identifier in the URL. A *public* profile page would force the slug decision; nothing here does.
