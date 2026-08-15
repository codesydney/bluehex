# Links are published, addresses are not

A profile may publish `website_url`, `github_url`, `linkedin_url` and `booking_url`. They are columns on `practitioners` — the public record a visitor reads — and are granted to `anon` with the rest of it. A profile may never publish an email address or a phone number: those stay in `practitioner_contacts`, which holds them and nothing else, and which has no `anon` grant by any route.

**The test is a route to a page versus a route to a person**, and it is the test every future field gets held to. A URL points at something the practitioner already publishes to the world, controls, and can take down — harvesting a LinkedIn URL off a profile gains a scraper nothing that searching LinkedIn would not. An address or a phone number reaches the person, was not otherwise public, and cannot be withdrawn once collected; a phone number in particular follows someone for years.

**This is recorded because the result reads as a contradiction and is not.** `practitioner_contacts` is a separate table specifically so that a future `grant select on practitioners to anon` cannot leak it, and `docs/spec/profile-and-credentials.md` requires a test proving `anon` cannot reach it by any route including a filter. Next to a profile that publishes four URLs, that looks like protection nobody is serious about, and the two available conclusions — the table is over-built, or the links are a mistake — are both wrong. Neither the table's protections nor the published links should be weakened by someone reasoning from the other.

**What this decision does not do is put Bluehex between a visitor and a practitioner.** The enquiry form mails Bluehex, and that is unchanged. But it is now a choice about what has been built rather than a property of the design: a visitor who wants to go direct clicks the practitioner's LinkedIn. Bluehex declines to *publish personal contact details*; it does not decline to let people talk, and it could not enforce that if it wanted to.

## Considered options

**Publish nothing at all, links included** — the position this reverses, and the one that held while contact details were the only route to a practitioner. Rejected because the protection is notional and the cost is not: it withholds information the practitioner has already published elsewhere, and the result is a directory entry less useful than searching for the same person's name. What made it defensible before was that it was load-bearing — with nothing published, the enquiry form was the only way through. It was doing real work; it just stopped being worth what it cost.

**Publish contact details on the profile alongside the links.** Rejected, and this is the line that stays drawn. It deletes the reason `practitioner_contacts` exists, it hands every address in the directory to the first scraper, and it is the one choice here the practitioner cannot walk back — changing a phone number is not a profile edit.

**Deliver the enquiry to the practitioner rather than to Bluehex.** Specified, then cut. It would have addressed the mail to `contact_email` with the visitor in `Reply-To`, and it costs a server-side send, a mail provider credential — the project's **first secret** — and abuse handling that protects everyone in the directory rather than one inbox. Against that it buys little a published LinkedIn does not already buy. Deferred rather than rejected: the spec carries the gate.

The mechanism question — four named columns against a `practitioner_links` child table — is a schema choice rather than a decision about the product, and is argued in the spec.

## Consequences

**The relay stops being load-bearing without anyone building anything.** Bluehex remains a bottleneck on every enquiry that comes through the form, which was already the accepted cost and still is. What changes is the failure mode when it strains. Previously a slow relay meant nobody in the directory could be reached; now it means Bluehex's own lead flow suffers while practitioners with a published link stay reachable. Only the first of those was urgent, and it is the one that has gone.

**Bluehex loses sight of the enquiries it never sees.** Anyone who clicks through to LinkedIn is invisible, and there is no way to measure how many do. Enquiries through the form are still fully visible — the who-is-hiring signal is narrowed, not lost, and the part that is gone was never capturable.

**Reversible in the code, not in the world.** Undoing this is four columns out of a grant list — cheap, and cheaper than most decisions worth an ADR. What does not come back is the links already published and scraped, or the expectation set with practitioners that they may list them.

**Published URLs are rendered as `href`s.** The scheme is constrained at the database by the `https_url` domain, so `javascript:` and `data:` never reach a page even if a render path is careless, and the same domain now covers `evidence_url`, which had the same exposure and no constraint. The render still needs `rel="noopener noreferrer"`.

**The badge is untouched.** Links sit outside the attested set, so editing one never clears verification. This is worth stating rather than assuming, because a GitHub profile *looks* like evidence of work — and evidence of work is not evidence Bluehex checked. A repository nobody read belongs with `bio` and `focus`, not with the credentials.
