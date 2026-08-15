# Links are published, addresses are not, and Bluehex is not in the enquiry path

A profile may publish `website_url`, `github_url`, `linkedin_url` and `booking_url`. They are columns on `practitioners` — the public record a visitor reads — and are granted to `anon` with the rest of it. A profile may never publish an email address or a phone number: those stay in `practitioner_contacts`, which holds them and nothing else, and which has no `anon` grant by any route. An enquiry made through the app is delivered to the practitioner at `contact_email`, with the visitor's address in `Reply-To`, and the exchange leaves the product at the first reply. Bluehex declines to publish personal identifiers; it does not decline to let people talk.

**The test is a route to a page versus a route to a person**, and it is the test every future field gets held to. A URL points at something the practitioner already publishes to the world, controls, and can take down — harvesting a LinkedIn URL off a profile gains a scraper nothing that searching LinkedIn would not. An address or a phone number reaches the person, was not otherwise public, and cannot be withdrawn once collected; a phone number in particular follows someone for years.

**This is recorded because the result reads as a contradiction and is not.** `practitioner_contacts` is a separate table specifically so that a future `grant select on practitioners to anon` cannot leak it, and `docs/spec/profile-and-credentials.md` requires a test proving `anon` cannot reach it by any route including a filter. Next to a profile that publishes four URLs, that looks like protection nobody is serious about, and the two available conclusions — the table is over-built, or the links are a mistake — are both wrong. Neither the table's protections nor the published links should be weakened by someone reasoning from the other.

## Considered options

**Bluehex stays in the enquiry path**, receiving every enquiry and forwarding it on. This was the decision until 2026-08-16 and it was correct while contact details were the only route to a practitioner: a directory that publishes nothing and relays everything has one obvious relay. Two things removed it. The premise was withdrawn by the people who set it — direct dealing is acceptable, and what Bluehex objects to is publishing the address, not the conversation. And publishing links makes the relay leaky by design: a visitor who can see a booking URL is not going to use a form. It carried a real cost, named in the spec at the time: Bluehex is a bottleneck on every enquiry, permanently, with no automation path. It also carried a real benefit, and that benefit is what this decision spends — see Consequences.

**Publish nothing at all, links included** — the maximal privacy position, and the one the superseded decision implied. Rejected because it protects information the practitioner has already published elsewhere, at the cost of making a directory entry less useful than a search for the same person's name. The protection is notional and the cost is not.

**Publish contact details on the profile alongside the links.** Rejected, and this is the line that stays drawn. It deletes the reason `practitioner_contacts` exists, it hands every address in the directory to the first scraper, and it is the one choice here that the practitioner cannot walk back — changing a phone number is not a profile edit.

The mechanism question — four named columns against a `practitioner_links` child table — is a schema choice rather than a decision about the product, and is argued where it belongs, in `docs/spec/profile-and-credentials.md`.

## Consequences

**Bluehex no longer sees who is hiring.** The superseded shape made every enquiry visible, which for a consulting arm is lead flow rather than a curiosity. That is what this decision spends, and it is deliberate. Recovering it by blind-copying Bluehex on every enquiry puts Bluehex back in the path it was removed from; that is open, not decided.

**Reversible in the code, not in the world.** Undoing this is a changed `To:` line and four columns out of a grant list — genuinely cheap, and cheaper than most decisions worth an ADR. What does not come back is the introductions already made: reversing captures new enquiries only, while relationships already formed off-platform stay there. The same asymmetry applies to the links, which are scraped and archived the moment they are published, and to the promise made to practitioners that they may list them.

**The `mailto:` stopgap cannot carry this**, which is the immediate cost. A `mailto:` puts the recipient into the visitor's mail client, which is publishing the address. So #2 needs a server-side send that reads `contact_email` and never returns it to a browser, and that introduces **the first secret** into the project — a mail provider credential, plus privileged read access to a table `anon` cannot see. `next build` must keep working without it.

**Spam reaches practitioners rather than Bluehex.** A public form that mails community members raises the abuse handling in #2 from protecting one inbox to protecting everyone in the directory. Turnstile or equivalent stops being optional.

**Deliverability becomes Bluehex's problem.** Mail sent from Bluehex's domain carrying a visitor's `Reply-To` needs SPF and DKIM configured, or enquiries land in spam folders and nobody involved finds out.

**Published URLs are rendered as `href`s.** The scheme is refused at the database by the `https_url` domain, so `javascript:` never reaches a page even if a render path is careless; the render still needs `rel="noopener noreferrer"`.

**The badge is untouched.** Links sit outside the attested set, so editing one never clears verification. The badge is a statement about credentials, and a practitioner adding a LinkedIn URL has not restated anything Bluehex checked.
