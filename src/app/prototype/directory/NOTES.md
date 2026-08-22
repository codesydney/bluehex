# The directory and the profile

> **The settled findings in this file were migrated into `docs/spec/profile-and-credentials.md` by #53**, under *The public surfaces: the roster, the profile page, and how they read*. That section is the binding one. This file is kept — the surface still renders and is still the only place the *Not earned* control has a catalogue full enough to reveal — and what is only here is the working record: the variants that lost, the overlay that was built and cut, and the debugging behind it. Where the two disagree, the spec wins.

One surface, because they stopped being separable. `pnpm dev`, then <http://localhost:3000/prototype/directory>. Three profiles, the population it launches with; click **View profile** on any row.

**The click-through is dead here, on purpose.** Each row's *View profile* is `profilePath(person)`, so it goes to `/p/<handle>` — the real product URL, not a prototype copy of one. That route resolves against Postgres since #53, and the three people below are invented and are not in it, so every row on this page still 404s when clicked. (Before #53 it 404'd because the real list was an empty array; the reason changed and the behaviour did not.) The alternative was a prototype-only detail route, and it was rejected: it would stand a second resolver beside the real one and let the two disagree, which is the exact failure recorded under *The identifier* below — a prototype handle scheme that disagreed with production, deleted rather than reconciled. The drawing owns the roster; the page behind the link is production's to fill.

They were two prototypes until the production CTA changed. The directory could not reach a profile while the roster's only control was *Enquire*, so the profile prototype drew its own list to have something to click — and that second list doubled up with this one. Pointing the real roster at `/p/<handle>` removed the reason for the copy.

## Part one — the directory

A switcher between 0, 3 and 12 profiles lived here and was cut. The numbers were an unexplained guess at signup rate, and flipping between them never answered anything looking at three did not — the design either holds up nearly empty or it does not, and three is the case that decides it.

This renders the **real** `PractitionerDirectory` rather than a copy, so it answers whether the shipped design survives being nearly empty. The hero is deliberately not reproduced — it does not change with the population, and a second copy would only drift.

The population is realistic in the one way that matters: **nobody has finished a Claude Certification.** Every credential here is an Anthropic Academy certificate, and one of the three people holds nothing at all.

**The mechanism changed on 2026-08-16 and the finding did not.** It used to be carried by in-progress rows — each Claude Certification present with `earnedAt: null`, so the population said "started, not finished" out loud. Those rows are gone from the model: `earned_at` is `not null`, and a credential you have not earned is simply one you do not hold. The same fact is now stated by absence.

That is a weaker signal on screen and a truer one in the model, and the trade is worth naming rather than glossing. What the fixture can no longer show is *which* Certification anybody is working towards — nothing in the directory says that, because nothing could ever check it. What it shows instead is Devon Achebe: no credentials, no badge, and a bio in his own words saying he is working through the Academy track. He is the case the directory exists to include and the one a credential-shaped model most easily excludes, and the roster has to look right with him in it.

## The roster's third column is Services now

`focus` drove the filters and the third column; `services` does both. The change is one column heading, one filter group and the chips in the row — the table shape settled in `6f689d2` is untouched, and deliberately so.

The filter chips are built from services somebody actually offers rather than from the whole closed set, which keeps the "a chip that returns nothing" failure out. But the *order* comes from the closed set rather than `sort()`: unlike the focus areas this replaced, there is a canonical order, and alphabetical would lead with "Architecture and advisory" for no reason.

`focus` stays in the search index with no chips behind it. Typing "RAG" should still find people, and free text nothing filters on cannot disagree with a filter that does not exist — which was the failure that put country *names* in the index in the first place.

**What is in the model and not yet on any surface:** `availability` and the four published links render nowhere except the editor's preview. They are not on `/p/<handle>`, which is where they belong — it is the only surface a visitor reads before deciding to enquire, and `availability` in particular is read exactly once, right there. The links have been unrendered since the columns landed in #73. Drawing them is a design decision rather than a mechanical follow-on, which is why this records the gap instead of guessing at it.

## The profile page shows the catalogue; the roster never does

**Decided 2026-08-16.** `/p/<handle>` opens on the credentials somebody holds and carries a control revealing the rest of the catalogue — **Earned** (default) / **Not earned** / **All**. The roster has no equivalent and should not grow one: it is a dense comparison surface, and a progress figure beside a name is a score nobody asked to be ranked by.

**The labels are load-bearing and the trap is worth naming, because the natural word is the wrong one.** Unearned entries are *Not earned*, never *In progress*. In-progress credential rows were deleted because "working towards" is an unfalsifiable claim; a heading saying *In progress* over the unearned half of the catalogue makes that claim automatically, for every credential the person has not taken, without them asserting anything. That is worse than the rows, which were opt-in. `profile/NOTES.md` has the full version; it is repeated here because this file is the one somebody redesigning the roster reads.

**It is drawn on this page rather than at its own URL.** `/p/<handle>` resolves against Postgres and the people below are invented, so every row here 404s by design and the page behind the link cannot be looked at from here. The prototype renders the **real** `ProfileDetail` with a fixture person and the prototype catalogue — the same principle as rendering the real directory rather than a copy, and it adds no second resolver: there is no lookup, just a component with props. Production's own route now passes `credential_catalogue` read from the database; on a stack with nothing seeded that list is empty, the control has nothing to reveal, and it does not render at all — which is the case it was written to survive.

## The finding: `scope.md`'s closing question has a false premise

`scope.md` poses it as a fork:

> If it means "holds a Claude Certification," the directory is empty at launch. If it means "vetted community member, Claude-capable," that is a coherent product but a different one from the original brief.

**The first branch is not reachable without changing the schema, and the mechanism already picked the second.** The rollup is "at least one credential, and every one of them verified" — it lost its earned-only filter when in-progress rows were removed, because every row is earned now — and an Anthropic Academy certificate *is* a credential. The spec is explicit that the two sources "differ in weight, not in kind", and the catalogue makes that structural: `source` is a property of the entry rather than of anybody's claim to it. So badges appear from week one, earned entirely on Academy certificates.

Counted against the launch population: **3 profiles shown, 2 carrying the badge, 0 holding an earned Claude Certification.**

Two consequences:

- **The question is no longer "will anyone have a badge".** It is whether Bluehex is willing to say the badge means what it already does — that a human checked the credentials on this profile, whatever they are.
- **Making it Certification-only is a schema change, not a copy change.** It would need the rollup narrowed to entries whose catalogue row carries `source = 'Claude Certification'`, which contradicts a settled spec and would deny the badge to everybody at launch. If that is genuinely wanted, it has to be argued as a change to the model rather than fixed in the lede.

The honest copy for what exists is *"Bluehex checked the credentials on this profile."* It claims less than a certification badge would, which is the correct amount to claim.

A panel on the surface used to lay this out as two options side by side. It was cut: the finding is an argument rather than something to look at, it is settled, and it reads better here than it did on screen.

## The second question, which is yours to judge

Does the roster read as a directory or as a mistake at three rows? That is a look-at-it question rather than one this file can settle, and three rows is now all the surface shows — the design either survives being nearly empty or it does not, and that is the case which decides it.

Worth watching for: the column headings over three rows, whether the filter groups look bare when the underlying data only yields two or three chips, and whether the invitation reads as a row of the table rather than an invitation.

## Answered: the shipped roster wins, twice

Five variants were drawn against it over two rounds and **the shipped design took it every time, both times on sight.** The variants are deleted; this is what they bought.

**Round one varied the page, and was the wrong question.** One drawing split the roster into *Verified by Bluehex* and *Published, not yet checked* bands, making the badge the page's spine rather than a filter chip. Another dropped the table entirely for bio-led entries with one search box and no filter chips at all. Both were rejected immediately. The mistake was mine to record: the table shape was settled in `6f689d2`, and what this file left open was whether it reads as a directory *at three rows* — density, not paradigm.

**Round two varied the density**, holding everything above the table identical so only the roster changed: a compact row with no column headings, credentials on one line without their dates, focus as text; and a row with an *In their words* column carrying a two-line clamp of the bio. Same verdict.

So the answer to the section above — does the roster read as a directory or as a mistake at three rows — is **it reads as a directory**, and it is now settled by comparison rather than by nobody having drawn the alternative. Four columns, headings included, credentials stacked with their earned dates, the invitation card at the foot. Reopening it needs a reason none of the five supplied.

Three findings survive the cut, because they are not about layout:

- **The badge rollup is impossible to look at and still call it a Certification badge.** Drawn as band headings, two of the three profiles sat under *Verified by Bluehex* while nobody in the population holds a Claude Certification. That is the finding two sections up, seen rather than argued — and it is the argument for the honest copy, *"Bluehex checked the credentials on this profile."* The bands are gone; that is not.
- **Filters that can only offer two chips are furniture.** Deleting the filter groups outright went too far and lost. The observation stands, and it is about the launch population rather than about the design: the groups get better as the directory fills, and they look thinnest on exactly the day they are first seen.
- **Putting the bio in the row reopens whether `/p/<handle>` earns its keep.** A full page already adds only three fields over the row; with the bio promoted it adds two. The URL still carries the analytics and search argument on its own, which is what the profile decision rested on — but the *page* would have needed a second reason, and that is worth knowing before anyone adds a column to the roster later.

**One thing no variant was allowed to change:** the badge sits with the credentials and never beside the name. It attests to evidence a human read, and beside the name it reads as a whole-profile endorsement Bluehex has no method for. That is a spec rule, not a layout preference.

## Not decided here

Whether the hero copy changes at launch. "We only do Claude." is a claim about Bluehex rather than about the directory's contents, so it survives an empty directory — but it sits directly above one, and that pairing is only visible on the real page.

## Part two — the profile

**Decided 2026-08-15: yes, a page, at its own URL, reached by an ordinary navigation.** Clicking *View profile* on a row goes to `/p/<handle>`. Nothing overlays, nothing is intercepted.

**This is a drawing, not an implementation.** No database, no auth, no real profiles — the fixture is the invented launch population. Kept so the real `/p/` route has something to build from; delete it as it is replaced.

## What decided it, and it was not the design

The question this prototype existed to answer was whether a page should exist at all, because a full page adds only **three fields** over the roster row — the bio, the earned dates, and the credential sources. On depth alone it is not worth a route, and "expand the row in place" delivers all three for free.

**The argument that carried it was analytics, not depth.** A `/p/:id` route means a request you can see. Three things follow, and only the first is replaceable by an event on an expanding row:

1. **Which profiles get looked at** — measurable either way, but path analytics is free and default where a custom `profile_expanded` event is code somebody has to write and keep writing. Instrumentation that must be remembered rots.
2. **Referrer data, which only exists if there is a URL.** With expand-in-place there is no inbound link, so you can never learn that an employer arrived from a candidate's job application. That signal is evidence the badge works in the market, which is the whole value proposition.
3. **Indexability.** Someone searching for a Claude consultant in Sydney can land on a profile. An expanded row cannot be found that way.

This also dissolves the question this file previously said to settle first — *is the sharing use real?* You no longer have to guess: a route lets you **measure** whether practitioners link to it. Expand-in-place structurally cannot ever answer that, which turns its "does not have to decide" advantage into "never learns".

**Consequence for the build:** the analytics argument needs a real **path segment**. Most tools strip or lump query params, so `?profile=x` does not deliver it.

## The Seek-style overlay was built, did not work, and was cut

Two shapes were tried before the plain navigation, and both are worth recording so nobody spends the afternoon again.

**A permanent split view — list left, detail pane right — was rejected on design.** The narrow card list it needs is rent, not design: it exists only because a persistent pane takes two thirds of the width. The shipped roster is a four-column table — Practitioner, Credentials, Focus, action — and it does not fit beside a pane, so adopting it would mean redrawing the directory settled in `6f689d2`.

**A drawer over the table was then built with parallel and intercepting routes, and abandoned.** The intent was Seek's: one URL, rendering as an overlay when clicked from the directory and as a full page when arrived at cold. The mechanism is real and documented in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md`. It did not work here, and the debugging is the useful part:

1. **The row's CTA was a plain `<a>`.** Interception applies to **soft** navigation only, so an anchor silently disables it and full-page-loads every profile. This is now a `Link`, and there is a comment on it saying why — the symptom looks exactly like a misconfigured interceptor.
2. **`(...)` did not intercept.** The slot first lived inside the prototype segment and reached up to `/p/` with the from-the-root matcher. Moving it to a root-level `@modal/(.)p/[handle]`, which is the pattern Next's own example uses, was the right shape.
3. **The RSC request for `/p/<handle>` still 404'd**, and a failed RSC fetch makes the router fall back to a hard navigation — which is what put "you are on the page" on screen every time. Adding the required `app/default.tsx` for the implicit `children` slot did not clear it; the request then began answering 307 to itself with an empty `_rsc` query, which is where it was left.

Discount one thing that looked like a fifth symptom and was not: a hard load appears to contain `role="dialog"` markup, which reads as the drawer rendering when it should not. That is the site header's mobile menu, which is always in the DOM and hidden. Grep for the drawer's own markers, not for `aria-modal`.

Verified with Playwright driving a real click rather than by reading the route manifest, which in dev compiles lazily and so proves nothing either way: `soft navigation: false`, and a `404` on `/p/<handle>?_rsc=…` in the network log. **Cut rather than chased.** The overlay is a nicety; the URL is the requirement, and an ordinary navigation delivers the URL. Revisit only with a reproduction against a bare Next app, not inside this one.

**What was given up:** search and filter state. An overlay would have preserved it for free. A navigation loses it, which makes lifting search and filters into the URL more valuable than it already was — see below.

## The identifier

> **Superseded by #119.** The scheme below shipped and was replaced: `handle` is now a `not null unique` column generated by Postgres, the URL is `/p/<handle>` with no slug, and there is no canonical redirect because there is only one path per profile. The reason it went is in the section itself — "nothing yet guarantees those six characters are unique" turned out to be the whole problem, because the resolver returned the *first* match and a collision therefore served the wrong practitioner's profile with their badge on it. The settled decision is in `docs/spec/profile-and-credentials.md`; what follows is the record of how the question was reasoned about the first time, which is still worth reading for what it ruled out.

`/p/mara-ellison-2f1a3c`, and **the lookup resolves on the trailing short id and ignores the slug entirely**. Verified on the running prototype: the full handle, the bare short id, and a stale slug from before a rename all return 200 and land on the same profile; an unknown id 404s. A real build serves a canonical redirect when the slug does not match — the mismatch is detected and displayed here rather than redirected, because the redirect is a route concern and this is a drawing.

Rejected: the bare name slug, which breaks on every rename and collides on duplicate names — the spec already rules out the display name as an identifier. And the bare uuid, which is correct and permanent and which nobody puts on a CV.

**The short id must come from the row's uuid, not from hashing the name.** Hashing the name would move the id whenever the name changed, which is the exact failure the scheme exists to prevent. There was briefly a second scheme in the prototype that did hash the name, and it disagreed with production the moment both existed — the directory linked one way and the page resolved the other. Deleted rather than reconciled: `profilePath` in `@/lib/practitioners` is the only generator, and the prototype holds only the lookup.

## Does a name in the URL make people scrapable?

> **Answered by #119, though not on these grounds.** There is no name in the URL any more: the slug went with the scheme above, so the opaque form is what everybody gets and the opt-out this section recommends is moot rather than rejected. The withdrawal argument below survives the change and comes out ahead — an opaque handle leaves nothing in a search cache after somebody has left.

Asked, and worth recording because the intuition is reasonable and the answer is no — but it uncovered a real choice underneath.

**A name slug adds no exposure a scraper does not already have.** The name is rendered on a public page that is linked from a public directory and indexed on purpose. Anything that can read the URL can read the page, where the name sits in an `<h1>` along with the headline, location, bio and credentials. Obscure URLs only protect content that is linked from nowhere, and this is linked from the directory. What actually governs exposure is whether the page is public, whether it is indexable, and rate limiting — not the shape of the string.

**Where it does matter is withdrawal, not scraping.** An indexed name-slug URL keeps the person's name in search caches and third-party link databases after they have left. That is the longest-lived trace a withdrawn profile leaves, and it belongs to #52.

**And the design already makes it a free choice.** Because the lookup ignores the slug, `/p/2f1a3c` and `/p/mara-ellison-2f1a3c` are the same page with no extra machinery — a flag would only decide which one gets linked to. Nothing implements it: `profilePath(person)` in `@/lib/practitioners` takes one argument and always emits the name slug, so choosing the opaque form means giving the generator a second argument, not flipping one it already has.

**Open: what the default is, and who owns the flag.** The model has this shape already in `evidence_public` — a privacy trade the practitioner makes for themselves rather than one the schema makes for them — and the same reasoning applies here. Recommended: default to the name slug, since the link is worth less without it and publishing a profile is already a decision to be found, with an opt-out for anyone who wants the opaque URL. If it becomes a stored preference it needs a column and a place on the editor.

## What the built version has to be held to

**1. The roster change is small, and it should stay small.** One edit to `practitioner-directory.tsx`: the row's button changes from **Enquire** to **View profile** and points at `profilePath(person)`. If adopting this starts changing the table's columns or layout, the cheapness that made this shape win has been spent anyway.

**The CTA swap is a decision, not a rename.** One call to action per surface: the directory's job is to get you to a profile, the profile's job is to get you to enquire — which is the Seek model, where you do not apply from the list. `ProfileDetail` already ends in *Enquire about {first name}*, so the enquiry path moves rather than disappears, at the cost of one extra click before anyone can be contacted. That is the right trade for a directory, because the profile is where the case for the person actually gets made.

**It has landed.** `practitioner-directory.tsx` renders *View profile*, and `profilePath` lives in `practitioners.ts` beside the type it describes. It is a `Link` rather than an `<a>` — kept that way because client navigation is simply better here, and there is a comment on it recording that an anchor was what silently defeated the overlay attempt.

**This leaves a deliberate dangling link, and it is the thing to watch.** `/p/` does not exist. Nothing breaks today because the directory ships empty, so no row and therefore no link renders at all — but **the profile route has to land before the first practitioner is added**, or the only control on a row 404s and enquiries have no path whatsoever, since `Enquire` is no longer on the row. `/contact?about=` stays wired for the profile page to use; it simply has no inbound link until then.

**2. Search and filter state has to move into the URL, and this is now the biggest gap.** *(Carried into the spec's "What the public surfaces still owe".)* It is local React state in the shipped component, so going to a profile and coming back loses whatever the visitor had typed and ticked. An overlay would have preserved it for free; a plain navigation does not, which is the price of cutting the overlay. Lifting search and filters into the URL fixes it and makes a filtered view shareable as a side effect. **This belongs with adopting the page**, because a directory that forgets your search every time you look at somebody is worse than one with no profile pages at all.

**3. The page is indexable; the prototype is not.** `robots: noindex` here is a property of the prototype. Organic search is a third of the reason the route exists, so the real page must not inherit it.

**4. `site.ts` has no canonical origin, and the share URL needs one.** ~~Hardcoded to `bluehex.au` in `profile-detail.tsx` for now.~~ **Done** — `site.origin` exists and `profile-detail.tsx` reads it.

**5. Nothing here renders a field outside the `anon` grant list.** The detail shows name, headline, location, bio, focus and credentials, all of them granted. A profile page is the most tempting place to reach for `status` or `user_id`; it must not. `focus` is now the page's alone rather than shared with the roster, and `services`, `availability` and the four links are granted and still undrawn — see above.

## The enquiry flow is the weakest part, and it is blocked on #2

Clicking *Enquire about Mara* leaves for `/contact`, and that reads as janky for three separate reasons worth keeping apart:

1. **The destination is framed for Bluehex, not for the practitioner.** `/contact` leads with "Let's talk about your project!" and a booking link for a consulting enquiry. Arriving from a profile, the person you actually wanted is reduced to a one-line banner on somebody else's page.
2. **Submitting is a `mailto:` handoff.** `contact-form.tsx` builds a subject and body and sets `window.location.href`, so the enquiry only completes if the visitor has a working mail client — webmail users with no OS default get nothing. Already tracked as **#2**, which the file's own header points at.
3. **It is three surfaces deep.** Directory, then profile, then a contact page, before the visitor has said a word.

**The drawer makes the fix natural, which is a point in the design's favour.** The profile is already on screen with its context; an enquiry form belongs *in* it rather than a route away. No navigation, no new route, no `?about=` round trip.

**Do not build that yet.** It needs somewhere for a message to land, which is #2. Redesigning the flow before the submit path exists just moves the seam — the enquiry would still end in a mail client, one surface earlier. Sequence: #2 lands a real endpoint, then the enquiry form moves into the profile.

## Still open, and now unavoidable

**What a shared profile URL does once its owner withdraws.** This did not exist while profiles rendered inline, and choosing a page creates it — a 404 is honest and looks broken to whoever was sent the link, a tombstone leaks that the person was once listed. The whole premise of the page is that these links travel, so more of them are in somebody's CV when the owner leaves.

Deliberately **not** designed now. The leaving prototype was cut on the reasoning that withdrawal gets built when somebody asks to withdraw, and this question rides with it on #52 rather than being answered speculatively here. What this surface owes #52 is the constraint, recorded: profile URLs are indexable and meant to travel, so whatever withdrawal does has to account for links that already left the building.

