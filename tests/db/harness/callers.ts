/**
 * The four callers every assertion in this suite is written from.
 *
 * A caller is an identity plus a PostgREST client that arrives as it: `anon`, a
 * signed-in practitioner, a second signed-in practitioner, and an admin. The
 * second practitioner is not padding — an assertion written from the owner of a
 * row passes identically whether row level security is on or off, so the only
 * tests that prove a policy ever executes are the ones written from somebody
 * else's account.
 *
 * **Sign-ups are rate limited**: `sign_in_sign_ups = 30` per five minutes per IP
 * in `supabase/config.toml`, and an admin costs two of them (a sign-up, then a
 * sign-in to mint a token the hook has stamped). Create fixtures once in a
 * `beforeAll` and share them across a file's tests rather than per test.
 *
 * That advice is per file, and the budget is per IP — so it does not clear the
 * ceiling it looks like it clears. A file building the full set costs four calls,
 * so around seven such files exhaust a five-minute window in two runs, and the
 * second run of an iterate-on-a-failing-test loop is where somebody meets it. It
 * arrives as a `beforeAll` failing on what reads like an auth error, in a file
 * that passed a minute earlier, with its tests reported skipped rather than
 * failed. The fix when it starts to bite is one line: raise `sign_in_sign_ups` in
 * `supabase/config.toml`. That file configures the local stack and nothing else —
 * nothing in this repository pushes it to the hosted project, where the limits are
 * the dashboard's — so the usual objection to loosening a rate limit does not
 * apply. Prefer it to a `globalSetup` sharing callers across files: that would cap
 * the cost too, but it trades the rate limit for cross-file coupling, which is the
 * thing `fileParallelism: false` and per-file cleanup currently buy.
 */

import {
  createClient,
  isAuthRetryableFetchError,
  type AuthError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { Database } from "@/lib/database.types";

import { apiUrl, publishableKey, sql, stackUnreachable } from "./stack";

/** The claims a test may reasonably read off an access token. */
export type TokenClaims = {
  /** The user id. `auth.uid()` resolves to this in every policy. */
  readonly sub: string;
  /**
   * The Postgres role PostgREST switches to. `authenticated` for a practitioner,
   * `bluehex_admin` for an admin — rewritten by `custom_access_token_hook`, which
   * is the entire mechanism admin authority rests on. See
   * `docs/adr/0001-admins-are-a-postgres-role.md`.
   */
  readonly role: string;
};

export type Caller = {
  /** Names the fixture in assertion failures. */
  readonly label: string;
  /** Null for `anon`. */
  readonly userId: string | null;
  /**
   * The claims off this caller's token, and null for `anon` — which is also how
   * `expectPermissionDenied` tells 401 from 403, so this is the field the helper's
   * correctness rests on. It is deliberately the *token's* claims rather than a
   * separate flag saying whether there is one: two fields can disagree, and a
   * caller whose flag contradicts the token it carries would make the helper
   * assert the wrong status and pass. See `./result.ts`.
   */
  readonly claims: TokenClaims | null;
  /** A PostgREST client that arrives as this caller and no other. */
  readonly client: SupabaseClient<Database>;
};

/** Long enough for `minimum_password_length = 6`, and constant on purpose. */
const password = "harness-password";

function clientFor(accessToken?: string): SupabaseClient<Database> {
  return createClient<Database>(apiUrl, publishableKey, {
    /* No session state anywhere. Each caller is pinned to one token by the header
       below, so a client that could refresh or persist a session would be a client
       whose identity can change underneath an assertion. */
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

function decodeClaims(accessToken: string): TokenClaims {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("access token is not a JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
}

/**
 * The unauthenticated caller: the publishable key and nothing else, which is what
 * a visitor's browser sends. Not cached — a client is cheap and sharing one
 * between files would be a way for one file's state to reach another.
 */
export function anonCaller(): Caller {
  return {
    label: "anon",
    userId: null,
    claims: null,
    client: clientFor(),
  };
}

/**
 * Turns an auth failure into the right complaint.
 *
 * A retryable fetch error is a transport failure — GoTrue did not answer — which
 * for a contributor is almost always a stack that is not running. This is the
 * seam a run reaches *first*, before anything touches Postgres, so without this
 * the `pnpm db:start` message would exist in `stack.ts` and never be the one
 * anybody sees. Everything else is a real rejection and keeps its own message.
 */
function authFailure(what: string, error: AuthError): Error {
  return isAuthRetryableFetchError(error)
    ? stackUnreachable("Supabase Auth", apiUrl, error)
    : new Error(`${what}: ${error.message}`, { cause: error });
}

/** User ids this run created, so the setup file can take them out again. */
const created = new Set<string>();

async function signUp(
  label: string,
): Promise<{ userId: string; email: string; accessToken: string }> {
  /* A fresh address per caller. Two practitioners have to be two people, and
     reusing an address across files would make one file's cleanup delete
     another's fixture. */
  const email = `harness-${randomUUID()}@bluehex.test`;

  const { data, error } = await clientFor().auth.signUp({ email, password });
  if (error) throw authFailure(`could not sign ${label} up`, error);

  const session = data.session;
  if (!session) {
    throw new Error(
      `signing ${label} up returned no session. That means email confirmation is on; ` +
        "`enable_confirmations` under [auth.email] in supabase/config.toml is false " +
        "for the local stack precisely so these tests do not need a mailbox.",
    );
  }

  created.add(session.user.id);
  return { userId: session.user.id, email, accessToken: session.access_token };
}

/**
 * A signed-in practitioner: an ordinary account, `authenticated`, owning nothing
 * until a test gives it something. Call it twice for the second practitioner.
 */
export async function practitionerCaller(label = "practitioner"): Promise<Caller> {
  const { userId, accessToken } = await signUp(label);
  return {
    label,
    userId,
    claims: decodeClaims(accessToken),
    client: clientFor(accessToken),
  };
}

/**
 * An admin: a signed-in account listed in `public.admins`, holding the
 * `bluehex_admin` role.
 *
 * Three steps, and the order is the whole thing. The row goes in through SQL
 * because `public.admins` has no grant to any API role — there is no HTTP request
 * that can create an admin, which is the point of the table. Then it signs in
 * *again*: `custom_access_token_hook` runs when a token is minted, so the token
 * sign-up handed back was stamped before the row existed. Skipping the second
 * sign-in yields an account that is an admin in the database and an ordinary
 * practitioner over the API, which is the same lag that makes revoking an admin
 * take effect on their next refresh rather than immediately.
 */
export async function adminCaller(label = "admin"): Promise<Caller> {
  const { userId, email } = await signUp(label);

  await sql("insert into public.admins (user_id) values ($1)", [userId]);

  const { data, error } = await clientFor().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw authFailure(`could not sign ${label} back in`, error);

  const session = data.session;
  if (!session) throw new Error(`signing ${label} back in returned no session`);

  return {
    label,
    userId,
    claims: decodeClaims(session.access_token),
    client: clientFor(session.access_token),
  };
}

/**
 * Deletes every account this file created. Called from the setup file, so no test
 * has to remember; `on delete cascade` from `public.admins` takes the admin list
 * with it.
 */
export async function deleteCreatedUsers(): Promise<void> {
  if (created.size === 0) return;
  await sql("delete from auth.users where id = any($1::uuid[])", [[...created]]);
  created.clear();
}
