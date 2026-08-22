# Bluehex — domain language

The words this project uses, and what each one means. Glossary only: no schema, no
policies, no implementation. Decisions live in `docs/spec/` and `docs/adr/` —
`docs/spec/profile-and-credentials.md` for the profile and credential model,
`docs/adr/0001-admins-are-a-postgres-role.md` for how admin authority works, and
`docs/adr/0002-links-are-published-addresses-are-not.md` for what a profile may publish.
`docs/profile-lifecycle.md` is the superseded spike report, kept for its proof
transcript; do not implement from it.

## People and records

**Practitioner** — a person in the Code.Sydney community who works with Claude and
wants to be findable. The human, not the record.

**Profile** — the published record *about* a practitioner. One practitioner has at
most one profile. `src/lib/practitioners.ts` named its type `Practitioner` and so
conflated the two; #53 renamed it `Profile`, which is what it always described.

**Owner** — the account a profile belongs to. A profile with an owner can be edited
by that person and by nobody else except Bluehex.

**Unclaimed profile** — a profile with no owner. Only Bluehex can create one, and it
exists for one reason: curated intake, where Bluehex writes up a practitioner who has
agreed to be listed but has not signed up. A practitioner can never create an
unclaimed profile, and cannot see or edit one.

**Claim** — the act of an unclaimed profile gaining an owner. Reserved for this
meaning only. It transfers control of a profile that may already carry the Verified
badge, so it is a privileged action.

Do **not** use "claim" for a practitioner asserting something about themselves — say
**self-asserted**. `certified` is self-asserted; it is not a claim.

## The three axes

Independent, not a sequence. Each has a different author.

**Certified** — self-asserted. The practitioner says they hold a Claude
Certification. Governs nothing; it is a statement.

**Status** — admission control: is this a real person, is the profile not spam. Governs
whether anyone else can see the profile. `pending`, `approved`, `rejected`, `withdrawn`.

Three of the four are Bluehex's call. `withdrawn` is the practitioner's — it is how
someone leaves without being erased, keeping their credentials and their verification
history for when they come back. Coming back goes to `pending`, not straight back to
`approved`.

**Verified** — asserted by Bluehex. Credential attestation: a human at Bluehex read
the evidence. Governs whether the badge shows, and nothing else.

A profile can be approved and unverified — published but not vouched for — and that
is the normal case, not an edge case. Anyone in the community may publish; Bluehex
alone marks Verified.

## Credentials

**Catalogue entry** — one credential that *exists in the world*, listed by Bluehex: a named Anthropic Academy course or a named Claude Certification. The catalogue is the closed set of things a practitioner may claim, and only Bluehex writes it. It carries the `kind` — `course` or `certification` — so weight is a property of the credential rather than of anyone's claim to it. Alongside it the entry carries the `platform` that awards it (`Anthropic Academy` or `Pearson VUE`) and the `course_url` its page is published at. Those are three facts about the credential, not one: a certification is awarded by Pearson VUE and described on a partner Skilljar tenant, and #103 split them apart because a single `source` column held the weight and the awarding body in the same string, free to disagree the moment either moved.

**Credential** — a practitioner's claim to hold a catalogue entry, evidenced and checked. It names an entry rather than describing one: there is no free text, so the word cannot be widened by anybody but Bluehex. A university degree or a non-Anthropic certification is **not** a credential here and cannot be entered as one; it belongs to a sister concept if it is ever wanted.

Do **not** say "credential" for a catalogue entry nobody holds. That is an entry, and the distinction is the whole reason progress can be shown without anyone claiming anything.

**Progress** — how much of the catalogue a practitioner holds, as a fact derived by comparing the two. Not stored, not claimed, and not a credential in any state: an entry a practitioner has not earned is simply an entry they have not earned. There is no "working towards" record, deliberately — see the spec, which removed it.

**Evidence** — what a practitioner supplies so a human at Bluehex can check a
credential. In practice a Skilljar certificate or share URL. Checking is manual and
deliberately stays manual: automating it would remove the step the badge attests to.

## What a practitioner offers

**Services** — what a visitor can *buy*: one-to-one tutoring, code review, an implementation engagement. The axis the directory filters on, because a visitor arrives shopping rather than surveying.

Two kinds, and the difference is what they can do rather than what they mean:

**Catalogue service** — an entry in `service_catalogue`, written by Bluehex. These are the roster's filter chips.

**Custom service** — one a practitioner wrote themselves because the catalogue was missing it. It renders on their profile and **never becomes a filter chip**: a vocabulary anyone can extend stops being navigable, which is exactly why [[focus]] is not the filter axis.

**Promotion** — Bluehex moving a recurring custom service into the catalogue, at which point it starts filtering. This is how the vocabulary learns what the market sells rather than what Bluehex guessed. Do not call a custom service a "proposal" — nobody is asking permission, and treating it as a request implies a queue that does not exist.

**Focus** — what a practitioner *knows*: Agents, MCP, RAG. Free text, secondary, and shown on the profile rather than driving the roster.

The two are not interchangeable and neither absorbs the other. "Knows RAG" does not say whether you can hire them for an afternoon, and "does tutoring" does not say what about. Both are self-asserted and neither is attested — the badge never covers either.
