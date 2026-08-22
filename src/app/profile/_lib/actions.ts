"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/session";
import type { ProfileWrite } from "@/lib/profile-draft";
import type { SaveResult } from "@/lib/profile-save";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProfileRow } from "./profile-mapping";
import {
  planCredentials,
  planServices,
  type SavedCredential,
  type SavedService,
} from "./profile-plan";

/**
 * Saving a profile. **The other half of the seam #71 left**, and the
 * practitioner half of #14 — the admin half is `../../admin/_lib/actions`.
 *
 * ## Postgres decides, and this file cannot widen that
 *
 * `requireAccount` is presentation: it exists so a session that expired between
 * the render and the click meets the sign-in form rather than a refusal nobody
 * can read. What actually stops a practitioner writing `verified` or `status`
 * is the column grants and the two guard triggers, checked by Postgres on every
 * statement — see `AGENTS.md` under Database, and
 * `docs/adr/0001-admins-are-a-postgres-role.md`.
 *
 * **Every column is named on the way in, and the two that identify the writer
 * are read from the session rather than from the payload.** A Server Action's
 * argument arrives from a browser and is untrusted: `user_id` is `viewer.id`
 * and `contact_id` is the row this request just wrote, so neither can be
 * supplied. Spreading `payload.profile` into an insert would work today —
 * `practitioners_insert_own` and the grant list refuse anything extra — but it
 * would fail with `42501` rather than being impossible, and the difference
 * matters on the one table whose integrity is the product.
 *
 * There is no service role key anywhere in this path, and adding one would be a
 * decision rather than a step.
 *
 * ## Creating a profile is two requests, and the order is forced
 *
 * `practitioners.contact_id` is `not null unique`, so the contact row is
 * written first — "the enquiry button goes somewhere" is an invariant held by
 * the direction of a foreign key rather than by anything here. The failure mode
 * is deliberately the harmless one: if the second request fails, what is left
 * behind is a contact row nobody references rather than a published profile
 * nobody can reach. The spec accepts that and calls for an occasional sweep;
 * this action does not try to be clever about it, because the alternatives —
 * a transaction it cannot open over PostgREST, or a delete of the row it just
 * wrote on an error path that may itself have failed — are both worse than a
 * stray address.
 *
 * ## Failures come back as values
 *
 * Every path returns a `SaveResult` rather than throwing. A thrown error out of
 * a Server Action is replaced with a generic message in a production build, and
 * the specific one is what a practitioner needs: a `23505` on a credential they
 * entered twice and a `23514` from the services cap are both things they can
 * act on, and "something went wrong" is not.
 */

/* The practitioner-writable set on `practitioners`, exactly as the grant lists
   it. `user_id` and `contact_id` are in the insert grant and absent from the
   update one — a profile cannot change hands and cannot be repointed at another
   contact row — so they are added by `create` alone and never by `save`. */
function profileColumns(payload: ProfileWrite) {
  return {
    name: payload.profile.name,
    headline: payload.profile.headline,
    location: payload.profile.location,
    country_code: payload.profile.country_code,
    bio: payload.profile.bio,
    focus: payload.profile.focus,
    availability: payload.profile.availability,
    website_url: payload.profile.website_url,
    github_url: payload.profile.github_url,
    linkedin_url: payload.profile.linkedin_url,
    booking_url: payload.profile.booking_url,
  };
}

function contactColumns(payload: ProfileWrite) {
  return {
    contact_email: payload.contact.contact_email,
    contact_phone: payload.contact.contact_phone,
    contact_note: payload.contact.contact_note,
  };
}

/** A refusal and never a success, so a caller composing a message onto one does
    not have to narrow the union first. */
type Refusal = Extract<SaveResult, { ok: false }>;

/**
 * What went wrong, in the words Postgres used, with the repair the schema put
 * in the hint.
 *
 * `practitioner_services_cap` raises with the count in the message and
 * `credentials_guard` says nothing a practitioner has to act on, so this is
 * mostly a passthrough — but a constraint name on its own ("23505:
 * practitioner_credentials_practitioner_id_catalogue_id_key") is not a
 * sentence, so the two that are reachable through this form are translated.
 */
function refusal(error: { code?: string; message: string; hint?: string | null }): Refusal {
  if (error.code === "23505") {
    return {
      ok: false,
      message:
        "One credential is listed twice. Each Claude credential goes on your profile once — " +
        "remove the duplicate and save again. Nothing was changed.",
    };
  }

  return {
    ok: false,
    message: error.hint ? `${error.message} — ${error.hint}` : error.message,
  };
}

/**
 * Purge what a save changed.
 *
 * `/profile` always, so the editor re-reads the rows Postgres now holds rather
 * than the ones this render started with. The public pages only when the
 * profile is approved: a pending profile is on no public page, so revalidating
 * `/` would evict the whole directory on every save by every practitioner
 * waiting in the queue.
 *
 * The same daily-clock caveat as the admin actions applies — `revalidatePath`
 * is the minimal thing that works today, and the tag-based contract
 * `src/app/page.tsx` names is #117.
 */
function purge(profile: { handle: string; status: ProfileRow["status"] }) {
  revalidatePath("/profile");

  if (profile.status === "approved") {
    revalidatePath("/");
    revalidatePath(`/p/${profile.handle}`);
  }
}

export async function saveProfileAction(payload: ProfileWrite): Promise<SaveResult> {
  const viewer = await requireAccount("/profile");
  const supabase = await createServerSupabaseClient();

  const { data: profiles, error: read } = await supabase.rpc("my_profile");
  if (read) return refusal(read);

  const existing = (profiles as unknown as ProfileRow[])[0] ?? null;

  /* One `id` and `handle` from here on, whichever branch produced them. The
     handle is Postgres's — `new_profile_handle()` generates it as a column
     default — so a create has to read it back rather than guess it. */
  let profile: { id: string; handle: string; status: ProfileRow["status"] };

  if (!existing) {
    const { data: contact, error: contactError } = await supabase
      .from("practitioner_contacts")
      .insert(contactColumns(payload))
      .select("id")
      .single();
    if (contactError) return refusal(contactError);

    const { data: created, error: profileError } = await supabase
      .from("practitioners")
      .insert({ ...profileColumns(payload), user_id: viewer.id, contact_id: contact.id })
      .select("id,handle,status")
      .single();

    /* The orphaned contact row this leaves is the accepted cost above, and the
       message says the retry is safe rather than leaving somebody to wonder
       whether pressing Save again doubles something. It does write a second
       contact row; that is the harmless direction, and the sweep is #52. */
    if (profileError) {
      const refused = refusal(profileError);
      return {
        ok: false,
        message: `${refused.message} Nothing was published, and it is safe to try again.`,
      };
    }

    profile = created;
  } else {
    const { error: contactError } = await supabase
      .from("practitioner_contacts")
      .update(contactColumns(payload))
      .eq("id", existing.contact_id);
    if (contactError) return refusal(contactError);

    const { data: updated, error: profileError } = await supabase
      .from("practitioners")
      .update(profileColumns(payload))
      .eq("id", existing.id)
      .select("id,handle,status")
      .single();
    if (profileError) return refusal(profileError);

    profile = updated;
  }

  const children = await saveChildren(supabase, profile.id, payload);
  if (!children.ok) {
    /* The profile itself is saved by here, so this is not a failed save and
       must not be reported as one — that would send somebody back to press a
       button over a change Postgres has already committed. It is also not a
       success: the credentials are what the badge attests to, and a profile
       that quietly kept last week's list is the one lie this form cannot
       afford. So it says which half landed. */
    purge(profile);
    return {
      ok: false,
      message: `Your details were saved. Your credentials and services were not: ${children.message}`,
    };
  }

  purge(profile);
  return { ok: true };
}

/**
 * The two child tables, reconciled to what the form submitted.
 *
 * Split out because it is the same work on both branches above: a create has no
 * saved rows and an edit has some, and `./profile-plan` produces the same three
 * piles either way.
 *
 * **Deletes go first.** Both tables have a reason: `practitioner_services_cap`
 * counts rows and refuses the fourth, so swapping one service for another
 * inserts into a full table unless the removal has already happened, and
 * `unique (practitioner_id, catalogue_id)` does the same to a credential moved
 * from one row to another. Ordering the piles is cheaper than teaching either
 * constraint about intent.
 */
async function saveChildren(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  practitionerId: string,
  payload: ProfileWrite,
): Promise<SaveResult> {
  const [saved, savedServices, catalogue] = await Promise.all([
    supabase.rpc("my_credentials"),
    supabase.from("practitioner_services").select("id,catalogue_id,label").eq("practitioner_id", practitionerId),
    supabase.from("service_catalogue").select("id,label"),
  ]);

  const lookupFailure = saved.error ?? savedServices.error ?? catalogue.error;
  if (lookupFailure) return refusal(lookupFailure);

  /* `my_credentials()` returns every credential the caller owns, which for one
     account is one profile's worth — `practitioners.user_id` is unique. Filtered
     anyway, because that is a fact about another table and this function should
     not depend on it. */
  const savedCredentials = (saved.data as unknown as (SavedCredential & { practitioner_id: string })[])
    .filter((row) => row.practitioner_id === practitionerId);

  const credentials = planCredentials(savedCredentials, payload.credentials);
  const services = planServices(
    (savedServices.data ?? []) as SavedService[],
    payload.services,
    new Map((catalogue.data ?? []).map((entry) => [entry.label, entry.id])),
  );

  if (credentials.remove.length > 0) {
    const { error } = await supabase
      .from("practitioner_credentials")
      .delete()
      .in("id", credentials.remove);
    if (error) return refusal(error);
  }

  if (services.remove.length > 0) {
    const { error } = await supabase
      .from("practitioner_services")
      .delete()
      .in("id", services.remove);
    if (error) return refusal(error);
  }

  for (const { id, row } of credentials.update) {
    const { error } = await supabase.from("practitioner_credentials").update(row).eq("id", id);
    if (error) return refusal(error);
  }

  if (credentials.insert.length > 0) {
    const { error } = await supabase
      .from("practitioner_credentials")
      .insert(credentials.insert.map((row) => ({ ...row, practitioner_id: practitionerId })));
    if (error) return refusal(error);
  }

  if (services.insert.length > 0) {
    const { error } = await supabase
      .from("practitioner_services")
      .insert(services.insert.map((id) => ({ practitioner_id: practitionerId, catalogue_id: id })));
    if (error) return refusal(error);
  }

  return { ok: true };
}
