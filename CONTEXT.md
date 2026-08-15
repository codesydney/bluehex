# Bluehex — domain language

The words this project uses, and what each one means. Glossary only: no schema, no
policies, no implementation. Decisions live in `docs/spec/` and `docs/adr/` —
`docs/spec/profile-and-credentials.md` for the profile and credential model,
`docs/adr/0001-admins-are-a-postgres-role.md` for how admin authority works.
`docs/profile-lifecycle.md` is the superseded spike report, kept for its proof
transcript; do not implement from it.

## People and records

**Practitioner** — a person in the Code.Sydney community who works with Claude and
wants to be findable. The human, not the record.

**Profile** — the published record *about* a practitioner. One practitioner has at
most one profile. `src/lib/practitioners.ts` names its type `Practitioner`, which
conflates the two; the record is a Profile.

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

**Credential** — a **Claude** qualification a practitioner holds or is working
towards, issued by Anthropic. Claude Certifications and Anthropic Academy
certificates are both credentials, distinguished by a `source`; they differ in weight,
not in kind. The word is deliberately narrow: a university degree or a non-Anthropic
certification is **not** a credential here, and belongs to a sister concept if it is
ever wanted. Widening this term silently widens what the Verified badge asserts.

**Evidence** — what a practitioner supplies so a human at Bluehex can check a
credential. In practice a Skilljar certificate or share URL. Checking is manual and
deliberately stays manual: automating it would remove the step the badge attests to.
