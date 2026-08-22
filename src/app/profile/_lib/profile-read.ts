import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  blankProfile,
  toOwnProfile,
  type ContactRow,
  type CredentialRow,
  type OwnProfile,
  type ProfileRow,
  type ServiceRow,
} from "./profile-mapping";

/**
 * The practitioner's own profile, for the editor to render.
 *
 * The per-request client from `@/lib/supabase/server`, carrying this
 * practitioner's session — never `@/lib/supabase/anon`, which is cached for the
 * life of the process and must never hold one. Server-only by construction:
 * the client reaches for `next/headers`, so an import from a client component
 * fails the build rather than shipping somebody's contact details to a browser.
 *
 * ## Two of these are RPCs, and that is not a stylistic choice
 *
 * `my_profile()` and `my_credentials()` are the `security definer` reads
 * `20260822050002_profile_own_reads.sql` added, and the migration explains at
 * length why a plain select cannot do either job. In short:
 *
 *   - **`practitioners`** — `practitioners_read_own` sits in a disjunction with
 *     `practitioners_read_approved`, so an unfiltered select returns every
 *     approved profile *plus* mine, and narrowing it means filtering on
 *     `user_id`, which `authenticated` may not read. Postgres checks column
 *     privileges on a `WHERE` too, so that is `42501` before a policy runs.
 *   - **`practitioner_credentials`** — the owner needs the raw `evidence_url`
 *     to populate the form, and `authenticated` holds no grant on it, because a
 *     grant is per role across every row the role can see and would hand every
 *     signed-in account every practitioner's private certificate link.
 *
 * The other three reads are ordinary selects, because on those tables the
 * owner's policy is the only one `authenticated` holds and RLS has already
 * narrowed the answer to the caller's own rows.
 *
 * ## Nothing here filters on ownership, and nothing here should
 *
 * Every row this returns is a row Postgres decided the caller may have. The
 * predicate inside both functions is `practitioners.user_id = auth.uid()`, and
 * the three selects are narrowed by their policies. A `where` clause added here
 * would read like the control and be a duplicate of one, which is worse than
 * either — it would be the version somebody maintains instead of the policy.
 */

/* `handle` is read although the editor does not draw it: the write path needs
   it to purge `/p/<handle>` after a save, and reading it here keeps the pages a
   save revalidates named by the row Postgres holds rather than by anything the
   browser sent. */
const CONTACT_COLUMNS = "contact_email,contact_phone,contact_note" as const;
const SERVICE_COLUMNS = "id,catalogue_id,label,service_catalogue(label)" as const;

export async function readOwnProfile(accountEmail: string | null): Promise<OwnProfile> {
  const supabase = await createServerSupabaseClient();

  const { data: profiles, error } = await supabase.rpc("my_profile");
  if (error) throw new Error(`Reading your profile failed: ${error.message}`);

  /* Zero rows for somebody who has never submitted, and at most one ever:
     `practitioners.user_id` is `unique`, so the function cannot return two. */
  const profile = (profiles as unknown as ProfileRow[])[0];
  if (!profile) return blankProfile(accountEmail);

  /* Four reads that do not depend on each other, so they go together. The
     profile above is the one they all key on, which is why it is not among
     them. */
  const [contact, credentials, services, note] = await Promise.all([
    supabase
      .from("practitioner_contacts")
      .select(CONTACT_COLUMNS)
      .eq("id", profile.contact_id)
      .maybeSingle(),
    supabase.rpc("my_credentials"),
    supabase
      .from("practitioner_services")
      .select(SERVICE_COLUMNS)
      .eq("practitioner_id", profile.id),
    supabase
      .from("practitioner_review_notes")
      .select("note")
      .eq("practitioner_id", profile.id)
      .maybeSingle(),
  ]);

  /* A failure of any of the four is an error rather than an empty form. The
     alternative renders a profile with no credentials on it, which somebody
     would then press Save on — and a save writes what the form holds, so a
     read that failed quietly would delete the rows it failed to read. */
  const failure = contact.error ?? credentials.error ?? services.error ?? note.error;
  if (failure) throw new Error(`Reading your profile failed: ${failure.message}`);

  /* An absent contact row is the same failure as a failed read and is treated
     the same way, which is the point: `contact_id` is `not null` and
     `contacts_read_own` follows the pointer, so this is unreachable — but the
     type admits it, and the branch that quietly rendered `contactEmail: ""`
     instead would have had the next save write that blank over the real
     address. A read that half-worked is the one input a whole-record save
     cannot be given. */
  if (!contact.data) {
    throw new Error("Reading your profile failed: it has no contact row.");
  }

  return toOwnProfile({
    profile,
    contact: contact.data as ContactRow,
    credentials: credentials.data as unknown as CredentialRow[],
    services: (services.data ?? []) as ServiceRow[],
    reviewNote: note.data?.note ?? null,
  });
}
