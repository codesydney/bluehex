# Admins are a Postgres role, stamped onto the token by an access token hook

Bluehex alone marks a profile **Verified**, and that badge is the product — so the
privileges that set it must be held by Bluehex and by nobody else. PostgREST connects
every signed-in user as the same `authenticated` role, so anything granted there is
granted to every practitioner. We therefore create a Postgres role, `bluehex_admin`,
grant it to `authenticator`, and use a Supabase custom access token hook to rewrite the
`role` claim to `bluehex_admin` for users listed in `public.admins`. The attestation
grants — the write privileges on the badge, and the read privileges on who checked what —
go to that role alone.

Verified against the local stack: Supabase permits the hook to overwrite `role`, GoTrue
mints the token, PostgREST switches to it, and `sub` and `aud` survive untouched so
`auth.uid()` still resolves to the person.

Checked on the hosted project on 2026-08-15: the access token hook is available on our
plan and offers the Postgres-function type, so no Edge Function is needed and there is
nothing left to re-check before deploying this.

## Considered options

**A runtime check inside `security definer` functions** — an `is_admin()` helper reading
an `admins` table, called from the policies and from three privileged RPCs. This works,
and was built and proved first. It was rejected on privilege rather than correctness:
`execute` on the admin functions has to be granted to `authenticated`, so every signed-in
practitioner can call `approve_practitioner()` and be turned away by a check inside the
function rather than by Postgres. Broad grants filtered at runtime, with privileged
functions doing the filtering. It remains the fallback if the hook is ever unavailable,
and its one real advantage is immediate revocation.

**The service role key, with the check in a server action** — rejected. It does not
remove the `admins` table, it only moves the check out of Postgres into application code,
which is the second authorization model that choosing RLS over an ORM exists to avoid. A
missing guard on one path is then a total bypass. On least privilege it does not even
win: it swaps a broad grant of a precise capability (three named actions) for a narrow
grant of an unbounded one (a credential that can do anything to any table). It would also
put an RLS-bypassing secret into every preview deployment.

## Consequences

**Authority lags revocation by the life of an access token.** Removing a row from
`admins` does not touch tokens already issued; it takes effect on the next refresh, an
hour by default. If an admin ever has to be cut off immediately, the lever is invalidating
their sessions, not editing the table.

**The hook is configuration that must match in two places** — `config.toml` for local and
the Auth Hooks setting on the hosted project — and it fails loudly rather than quietly:
**enabling the hook without its function present takes down every sign-in and sign-up**
with `500 unexpected_failure`. So the `config.toml` change and the migration that creates
`custom_access_token_hook` must land in the same commit, and the hosted setting is enabled
with that migration's deploy, never before it.

**Sign-up is unaffected.** Practitioners register normally and get `authenticated`.
`bluehex_admin` is granted `authenticated`, so an admin is one tier above a practitioner
rather than a parallel identity, and keeps their own profile.

**A policy's helper function must be executable by the calling role.** Not an issue in
this design, which has no such helper — but it is what broke the rejected option, with an
error naming neither the table nor the policy, and it is worth knowing before reaching
for one.
