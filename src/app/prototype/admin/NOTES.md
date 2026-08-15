# Review queue — the decision

**Decided 2026-08-15: one queue, profile-centric.** A list of everything needing attention, and a detail panel where you do all of it for one person — approve or reject, tick each credential, leave a note.

`pnpm dev`, then <http://localhost:3000/prototype/admin>. Actions work and change the state; nothing persists.

**This is a drawing, not an implementation.** No auth, no database, no write path. A real admin surface is gated on `bluehex_admin`, a Postgres role stamped onto the access token per ADR-0001, and needs #49/#50 plus application auth first. It is kept so #14 has something to build from, and should be deleted as it is replaced.

## Why it won

It matches how the work is actually thought about — "review Priya" — and it is the only one of the three shapes where you see the whole person before deciding anything. That matters specifically for admission control: "is this a real person" is a judgement about a profile as a whole rather than about any one field, and it is the judgement the other two shapes make hardest.

It also absorbs the third queue for free. `updated_at > verified_at` means "edited since we checked it", which is a re-check queue over every verified profile that has since changed — no column, no flag, no cron job. In a profile-centric list that is simply another reason to be in the list, shown as a marker, rather than a lane of its own.

## What it beat, and what was given up

**Separate lanes per task** took the independence of the two axes most literally — approvals, credential checks and re-checks as three queues, each offering only its own actions. It made the drift queue explicit and it made it impossible to conflate approving with verifying. The cost was that "everything about Priya" stopped existing: a profile with one earned credential appears in two lanes at once, and admission control loses the context it most needs.

**One credential at a time** optimised for the task there will be most of, and was the only shape where verifying a *profile* was structurally inexpressible rather than merely absent. That is a real property and worth remembering. It was given up because it has no context at all — you cannot see that this is the third certificate from someone whose bio reads like a language model wrote it, and noticing that pattern is exactly what a human check is for.

## What the built version has to be held to

**1. Approving must not read as an unfinished job.** A profile can be approved and unverified — published but not vouched for — and the spec calls that the normal case. This is the specific risk of putting both axes on one screen. If the layout ever makes an approved-but-unbadged profile feel half-done, admins will start withholding approval until they can verify, which turns two independent axes back into one pipeline and empties the directory. The two panels are separate and separately captioned for this reason; keep them that way.

**2. There is no verify-a-profile action, and the UI must never grow one.** The only verb in the model is checking one credential. This is the invariant the product rests on and the one `AGENTS.md` warns fails open rather than loudly.

**3. Bluehex gets no Withdraw button.** Three of the four statuses are Bluehex's call; `withdrawn` is the practitioner's own lever — how someone leaves without being erased, keeping their credentials and verification history for when they come back. Taking a profile down as an admin is `pending` or `rejected`.

**4. Owner assignment is one-way.** `null → A` claims an unclaimed profile; `A → B` raises `23514`, admins included. So there is no reassign control — only "assign owner" on a profile that has none. Handing over a profile that may already carry the badge is privileged, which is why it is attributed.

**5. `verified_by` and `verified_at` are the substance, not bookkeeping.** The badge means a named human looked on a given day.

**6. ~~A profile with only in-progress credentials has nothing to verify, ever.~~ Superseded 2026-08-16 — there are no in-progress credentials.** It read: *"It needs approving and then it waits. A queue that counted it as pending verification would show a permanent unclearable item — belonging to precisely the group the directory exists to include."*

The premise went, so the rule has nothing left to warn about: every credential row is earned and therefore checkable. This is the deletion the round-two recommendation below predicted, arriving by a better route than the one it proposed.

**One permanently-open item survives and it is a different thing.** An earned credential with no `evidence_url` — Hae-Won Park — is approvable, never badgeable, and not a rejection, so the queue must still distinguish "the badge is waiting on this" from "a human can move this forward". `unchecked()` and `checkable()` in `queue-data.ts` are that distinction and both stay. What changed is who can close it: nobody could ever act on an in-progress row, and she can, by pasting a link. That is why the state was kept when the other was cut.

**7. The drift marker has false positives.** An admin edit bumps `updated_at` too. Per the spec, at this volume that is cheaper than a column to suppress them.

## Known gap

The list is unsorted and unfiltered. Fine at five profiles, not at two hundred — the built version needs at least "oldest first" and a way to see only one kind of work. Deliberately not designed here, because the right answer depends on volume nobody has yet.

---

# Round two — decision support

**Closed 2026-08-15. The design above won and is unchanged.** Everything drawn against it has been deleted; what the round produced is written down here and in the fixtures.

## The charge, and why it did not stick

The complaint was that the settled design shows the data and gives you buttons. Both judgements arrive as things to press: approving is a button, and checking a credential is a button beside a link that opens another tab. Nothing on screen helps you *decide* either one — and that matters more for the check than the status, because a check that feels like a tick is how the badge quietly comes loose from the reading it is supposed to attest to.

Three alternatives were drawn. **None of them beat it**, and the reasons differ enough to be worth keeping apart.

**A — Type what you see.** Verifying asked you to type the name you read off the certificate, stored on the credential. It began as "evidence side by side", with the certificate rendered next to the profile, and lost that half immediately — see below. What was left was one text input, and one input was not enough to justify the shape.

**B — Findings first.** The queue became a ranked list of things worth looking at, with a fast lane for profiles nothing fired on. **Cut on implementation cost before it was judged**, and the cost argument was the right one. It was the only variant needing anything new from the database: an account-age column the spec does not have, a cross-profile query, an externally maintained list of disposable email domains, and thresholds tuned against a volume nobody has. Its value also scales with volume, and there is no volume — the directory ships empty and launches at three, while the risk it carries lands on day one. A fast lane teaches an admin that an unflagged profile is a cleared one, and Aroha Ngata is unflagged and needs a person.

**C — The dossier.** One column, read top to bottom, provenance on every field: "Melbourne, entered at signup, never edited" against "Melbourne, changed four days after we checked". Drift moved from a marker on a row to the field that actually moved. Openly the slowest, and it did not buy enough to pay for that.

## What actually survives

**The adversarial population, and it is the round's main output.** The fixtures were five benign people — every certificate matching, nobody trying anything — which made the surface impossible to judge. There are now nine, four of them awkward on purpose, and two of those are awkward while being entirely innocent:

| | What it is | What it tests |
| --- | --- | --- |
| Marcus Bell | Spam | Signals that mean nothing alone and something together: file-share evidence, throwaway address, generated copy, every credential earned the same day. |
| Tomas Novak | Someone else's certificate | The URL is byte-identical to one on Priya's profile. Catchable **only by looking across profiles**, which this design does not do. |
| Aroha Ngata | Entirely legitimate | The certificate carries her legal name, the profile the name she goes by. Trips any careless name check. |
| Hae-Won Park | Uncheckable, innocent | Earned credential, no evidence URL. Approvable, never badgeable, not a rejection. |

**A design that makes Aroha look like Marcus is wrong**, and that is the most useful thing this population can tell you. Keep them.

**All four survive the catalogue, and one of them got sharper.** Nothing about these cases depended on free-text labels — three of them are about the URL and one is about a name on a certificate, and the catalogue touches neither. Marcus now maxes out `services` at three while carrying five focus areas, which is the cap doing its job on the profile most willing to claim everything.

**Devon Achebe was reworked, because the case he tested no longer exists.** He was an in-progress-only profile: one credential nobody could ever check, in the queue forever. He now has no credentials and a bio saying what he is working through, which is what the model offers in place of the row. He is still distinct from Ines Delacroix, and the difference is worth keeping: Ines is unclaimed, curated by Bluehex, asserting nothing; Devon is a self-service profile whose *prose* claims progress nobody can verify. **If a design tempts an admin to treat "working through the Academy track" as something to check, the confusion in-progress rows caused has moved into the bio rather than been removed** — which is the one thing worth watching for in whatever gets built.

**The known gap moved.** Tomas Novak is the concrete cost of a profile-centric queue: nothing in it can see the same certificate on two profiles, so the theft that most directly attacks the badge is the one thing the shape structurally cannot catch. That is now a known hole rather than an unexamined assumption. A cross-profile duplicate check was offered as a carry-over and declined; it belongs in whatever gets built, not in a drawing.

**The catalogue does not close that gap, and it is worth saying so because it looks like it might.** `unique (practitioner_id, catalogue_id)` stops one person claiming the same credential twice; two people claiming the same entry is the normal case, which is exactly what makes Tomas's row legal. He and Priya hold the *same* catalogue row now rather than two identical strings, which makes the duplication marginally more legible to a query somebody might one day write — and not at all more visible on this screen.

## Nothing renders a certificate, and nothing should

The first draft of the variants drew the certificate inline beside the profile. **Cut, and it should stay cut** — the reasoning survives all three variants and binds anything built later.

It could not have worked. A Skilljar certificate page belongs to a third party and is entitled to refuse framing; a file-share link renders a viewer rather than a document. The inline version only worked because a lookup table invented what was at the other end, which is drawing a capability Bluehex does not have.

It is also the wrong thing to hand an admin. `evidence_url` is submitted by an untrusted practitioner, and the admin reading it is the one principal who can set `verified`:

- **Framed** — the page can navigate the top frame away, or draw a Bluehex sign-in prompt inside the frame and phish the session that grants the badge.
- **Fetched server-side** to proxy or screenshot it — SSRF, against a host running Supabase on `localhost:54321` and cloud metadata on `169.254.169.254`.
- **Any remote subresource, even an `<img>`** — leaks the admin's address and the timing of the review back to the person being reviewed.
- **A PDF rendered inline** — parses attacker-controlled binary in the browser holding admin rights.

So: a link, `rel="noopener noreferrer"`, and nothing embedded. The settled design already had this right.

**The URL itself is shown as text, and that is the opposite decision rather than a softening of it.** Every objection above is to Bluehex *fetching* or *rendering* what is at the other end; text is neither — it embeds nothing, frames nothing and issues no request. It is also most of what the admin is actually judging. `Open certificate` as the only thing on screen renders a Skilljar certificate page and a file on somebody's Drive identically, which costs Marcus Bell one of his four stacked signals, and it hides the slug that is the sole reason Tomas Novak is catchable by a human who reviewed Priya last week. Withholding the URL from the one screen where the judgement is made was never part of the argument for not rendering certificates.

## In progress cannot be verified, and that is an argument about the model

> **Resolved 2026-08-16, and by a better mechanism than this section proposed.** The spec removed in-progress credentials — `earned_at` is `not null` — so everything below about an unfalsifiable claim wearing a checked claim's shape is now a description of what the model refuses to represent. Kept because the argument is what produced the change, and because the *way* it was resolved is the part worth learning from.
>
> **The recommendation was "in progress belongs in the bio, not the credential table". What landed was the bio *and* a catalogue.** The recommendation only deleted; on its own it would have taken the motivating surface with the unverifiable claim, and the director's objection to that was correct — a practitioner working through the Academy track wants to see the whole track and their place in it, and that is a reason to come back rather than decoration.
>
> The catalogue satisfies that while still deleting the row, which is why it is a resolution rather than a trade. Every credential that exists is already a row Bluehex wrote, so showing somebody the ones they do not hold requires no assertion *from* them: the surface renders the catalogue and marks what is held, and "2 of 23" is derived by comparing two sets. You cannot claim to be working on something because there is nothing to write. The visibility is strictly better than the rows gave — it shows the whole track rather than only the parts somebody remembered to type in — and the unfalsifiable claim is gone.
>
> This is the shape to reach for next time the answer looks like "delete the feature that is being abused": ask what it was buying, and whether something Bluehex already owns can buy it instead.
>
> What remains true and unchanged below: there is no mechanism to verify enrolment and there never will be one, so nothing about this reopens if somebody asks for in-progress rows again. The answer is the catalogue, not a screenshot.

Asked directly: is there a way to verify an in-progress credential, given you could claim to be working on everything?

**No, and there is no mechanism to invent.** Skilljar issues a certificate on completion; there is no public proof of enrolment, and progress data sits behind an API tenant-scoped to Anthropic. A screenshot of a course dashboard is a picture of evidence — the Marcus Bell problem — and attests to nothing.

So an in-progress credential is a free, unfalsifiable claim rendering in the credentials list wearing the same row shape as one a human checked. It costs nothing to add, nothing contradicts it, and it never resolves: an entry made in 2026 still reads "working towards" in 2028.

**The question that matters is what it was buying.** The stated premise is inclusion — people working towards a certification belong in this directory. But the rollup already delivers that: somebody with Academy certificates and a Certification in progress gets the badge from the Academy ones, and somebody with nothing earned is still listed with a profile, a headline and focus areas. In-progress rows are not doing the inclusion work; they are a separate unverifiable claim riding along on it.

**Recommendation: in progress belongs in the bio, not the credential table.** "Working through the Academy track on weekends" is already sayable, already free text, already correctly framed as the practitioner's own words — Devon's fixture says exactly that in his bio today. Promoting it to a structured row with a `source` enum gives an unverifiable claim the same schema shape as a verified one, and that shape is the confusion.

**It also dissolves machinery rather than adding it.** Point 6 above — "a profile with only in-progress credentials has nothing to verify, ever" — exists to stop the queue showing a permanently unclearable item. Devon is that profile: one credential reading "Not checkable until earned", no action, forever. Remove the premise and he is simply a profile to approve or not, and point 6 has nothing left to warn about. That is the `AGENTS.md` rule about revisiting a requirement when its premise goes, running in the direction that deletes code.

**This is a spec decision, not a prototype tweak.** It changes `docs/spec/profile-and-credentials.md` and what `earnedAt: null` means or whether it exists, and no schema lands before the model it encodes is settled. Recorded; not acted on. *(It was acted on, in the spec first and then here — see the note at the top of this section. The sequence is the point: the prototype recorded the argument and did not change the model to suit itself.)*

## Still open

**Undoing a check is drawn as an absence, and it is probably an event.** `Undo check` nulls `verified`, `verifiedBy` and `verifiedAt`, which erases the fact that a named human ever looked and records nothing about who reversed it or why. Point 5 above says those two fields are the substance of the attestation; withdrawing one is a second attestation by a second named human, not the deletion of the first. Drawing it as `Undo` is what would teach the built version to model it that way. Not acted on here, because the fix is a column — a revocation row, or `unverified_by`/`unverified_at` — and no schema lands before the model it encodes is settled. It belongs in `docs/spec/profile-and-credentials.md` alongside the in-progress question above — which has since been answered there, while this one has not, so it is now the only spec question this file is still holding.

The related bug **is** fixed: `lastVerifiedAt` no longer moves backwards when the newest check is undone. A `max()` over live credential rows is not monotonic, and since drift decides queue membership rather than merely marking a row, a stamp that slides down manufactures a queue item on a profile nobody edited.

**It is ugly, and that was not the question this round asked.** The shape is right and the look is not — density, spacing, the weight of the two panels. That was offered as a separate direction at the start of the round and set aside in favour of decision support. It is still there, and it is now the obvious next thing.

**Volume.** Sorting, filtering and keyboard throughput are still undesigned. Nine profiles is a population for judging care, not throughput. The known gap above stands.
