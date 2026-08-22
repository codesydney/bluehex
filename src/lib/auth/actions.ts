"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Sign out, then go home.
 *
 * A Server Action rather than a route handler, so the form works with
 * JavaScript disabled and Next gives it a 303 rather than a 307 — a 307 on a
 * `POST` preserves the method and would re-post the form at the destination.
 *
 * The default scope is `global`: every session this person holds is revoked, not
 * only the one in this browser. That is the stronger reading of "sign me out",
 * and it is the same lever `docs/adr/0001-admins-are-a-postgres-role.md` names
 * for cutting off an admin immediately — removing a row from `admins` only takes
 * effect on the next token refresh, but revoking the sessions is instant.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  redirect("/");
}
