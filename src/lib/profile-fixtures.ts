import type { CatalogueEntry, CredentialKind } from "@/lib/practitioners";
import type { BluehexControlled, ProfileDraft } from "@/lib/profile-draft";
import seeded from "../../supabase/seed/credential-catalogue.json";

/**
 * The persistence seam. Everything the editor reads that a query will read
 * instead, in one file, so that #14 has one place to replace.
 *
 * **Nothing here writes and nothing here is saved.** #71 builds the editor
 * against fixtures and local state deliberately: the two-request creation
 * problem, the RLS policies and the Server Action that carries them are #14's,
 * and building half of that here would mean building it twice. The editor says
 * so on screen rather than leaving somebody to discover it by pressing Submit.
 *
 * What replaces each of these:
 *
 *   `credentialCatalogue()`  → select id, kind, platform, label, active, sort_order
 *                              from credential_catalogue
 *   `exampleDraft()`         → the practitioner's own row, keyed on auth.uid()
 *   `exampleControlled()`    → status, per-credential verified, review note
 */

/**
 * The catalogue, read from the record `supabase/seed.sql` loads.
 *
 * It reads `supabase/seed/credential-catalogue.json` rather than restating the
 * entries, because that file is the canonical record of the 24 confirmed Claude
 * credentials and a second copy is a second thing to be wrong. The alternative
 * — inventing plausible course names — is what the prototype's catalogue did,
 * under a header forbidding anyone to copy them anywhere, on a page whose whole
 * job is credibility.
 *
 * One thing it does not have, and it arrives with the query: **ids**. The column
 * is a `uuid` the database generates and the JSON carries none, so the ids below
 * are derived from the index and are uuid-shaped on purpose — a short stand-in
 * hides anything that truncates one.
 *
 * It used to be missing `kind` and `platform` too, flattening them into the
 * single `source` that `@/lib/practitioners` still carried. #53 reconciled that
 * type with the column pair, so the mapping below is straight through and no
 * longer lossy about a certification's platform.
 */

/**
 * `sort_order` restarts at 0 per platform in the seed — it is what a grouped
 * picker renders against, and the unique constraint does not span it. A single
 * list needs one key, so the group's own offset is folded in here and the
 * picker sorts on one number rather than sorting twice. Courses first, as the
 * seed writes them: it is the track somebody works through.
 */
const groupOffset: Record<CredentialKind, number> = {
  course: 0,
  certification: 1000,
};

const entries: CatalogueEntry[] = seeded.map((entry, index) => {
  /* Throws rather than falling back. `check (kind in ('certification',
     'course'))` already refuses anything else at the database, so a fallback
     would be defending against a state the schema forbids by inventing an
     answer — and the answer it invented would file a certification under the
     Academy, which is the one distinction the `<optgroup>`s exist to show.

     The public mapper in `@/lib/directory-mapping` deliberately does the
     opposite and reads an unknown kind as a course. The difference is who is
     reading: a wrong kind here is a bug in a file somebody just edited, and a
     wrong kind there is a row the database already accepted on a page whose
     visitors should not get a 500 over it. */
  if (entry.kind !== "certification" && entry.kind !== "course") {
    throw new Error(`Unknown credential kind ${entry.kind}`);
  }
  const kind: CredentialKind = entry.kind;

  return {
    /* Deterministic, so a reload does not repoint a credential. */
    id: `c0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind,
    platform: entry.platform,
    label: entry.label,
    courseUrl: entry.courseUrl,
    /* `active` takes its default for all 24 rows in the seed: retirement is a
       flag flip, never a delete. Nothing in the record is retired yet. */
    active: true,
    sortOrder: groupOffset[kind] + entry.sortOrder,
  };
});

export function credentialCatalogue(): CatalogueEntry[] {
  return entries;
}

/**
 * A part-filled draft, so the editor is judged with content in it rather than
 * empty — and so the two rules the preview exists to demonstrate have something
 * to demonstrate. A profile with no verified credential cannot show a check
 * being cleared.
 *
 * Deliberately mid-flow: two credentials, one checked and one waiting, and a
 * profile still `pending`. That is the state a practitioner is actually in
 * while Bluehex works through the queue.
 *
 * **It is example content and the page says so, in a notice nobody has to press
 * anything to see.** `example.invalid` is reserved by RFC 2606 and resolves
 * nowhere. None of this reaches the directory: the directory renders
 * `practitioners` in `@/lib/practitioners`, which is empty and stays empty until
 * a real person agrees to be published.
 */
export function exampleDraft(): ProfileDraft {
  return {
    name: "Mara Ellison",
    headline: "Staff engineer, agent platforms",
    location: "Sydney",
    countryCode: "AU",
    bio: "Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible. Working through the rest of the Academy track on weekends.",
    focus: ["Agents", "Evals", "MCP"],
    services: ["Architecture and advisory", "Evaluation and testing"],
    availability: "Evenings and weekends, and about one day a fortnight.",
    websiteUrl: "https://example.invalid/mara",
    githubUrl: "https://github.com/example-invalid",
    linkedinUrl: "",
    bookingUrl: "",
    contactEmail: "mara@example.invalid",
    contactPhone: "",
    contactNote: "Best reached weekday mornings.",
    credentials: [
      {
        key: "example-checked",
        catalogueId: entryLabelled("Claude Code in Action").id,
        earnedAt: "2026-01-22",
        evidenceUrl: "https://example.invalid/certificate/mara-ellison",
        evidencePublic: true,
      },
      {
        key: "example-waiting",
        catalogueId: entryLabelled("Introduction to Model Context Protocol").id,
        earnedAt: "2026-06-04",
        evidenceUrl: "https://example.invalid/certificate/mara-mcp",
        evidencePublic: false,
      },
    ],
  };
}

/** The two axes the practitioner does not own, as an admin would have left them. */
export function exampleControlled(): BluehexControlled {
  return {
    status: "pending",
    verified: { "example-checked": true, "example-waiting": false },
    reviewNote: null,
  };
}

/**
 * By label, so the fixture above reads as prose rather than as ids.
 *
 * Throws rather than returning undefined, for the same reason the real lookup
 * would: `catalogue_id` is a `not null` foreign key with `on delete restrict`,
 * so a credential pointing at nothing cannot exist. A fixture that quietly
 * rendered "Unknown credential" would be drawing a state the database refuses.
 */
function entryLabelled(label: string): CatalogueEntry {
  const found = entries.find((entry) => entry.label === label);
  if (!found) throw new Error(`No catalogue entry labelled ${label}`);

  return found;
}
