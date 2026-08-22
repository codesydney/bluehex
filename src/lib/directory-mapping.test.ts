import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  toCatalogueEntry,
  toCredentials,
  toProfile,
  toServiceLabels,
  toServiceOptions,
  type CatalogueRow,
  type CredentialRow,
  type ProfileRow,
  type ServiceRow,
} from "@/lib/directory-mapping";

/* The rows below are the shapes `supabase/seed.sql` produces, read back through
   the `anon` grant. Copied rather than queried on purpose: this project runs
   against a live stack in `tests/db`, and these are the rules that hold whatever
   the stack says — ordering, null handling, and which fields exist at all. */

const claude101: CatalogueRow = {
  id: "cat-claude-101",
  kind: "course",
  platform: "Anthropic Academy",
  label: "Claude 101",
  course_url: "https://anthropic.skilljar.com/claude-101",
  active: true,
  sort_order: 0,
};

const mcp: CatalogueRow = {
  id: "cat-mcp",
  kind: "course",
  platform: "Anthropic Academy",
  label: "Introduction to Model Context Protocol",
  course_url: null,
  active: true,
  sort_order: 7,
};

const developerCert: CatalogueRow = {
  id: "cat-ccdv-f",
  kind: "certification",
  platform: "Pearson VUE",
  label: "Claude Certified Developer - Foundations (CCDV-F)",
  course_url: "https://anthropic-partners.skilljar.com/x",
  /* `sort_order` restarts at zero per platform in the seed, so a certification
     and a course legitimately share the number. That is the collision the kind
     tiebreak below exists for. */
  active: true,
  sort_order: 3,
};

function credentialRow(
  entry: CatalogueRow,
  overrides: Partial<CredentialRow> = {},
): CredentialRow {
  return {
    id: `cred-${entry.id}`,
    catalogue_id: entry.id,
    earned_at: "2026-01-22",
    verified: false,
    evidence_url_public: null,
    credential_catalogue: entry,
    ...overrides,
  };
}

describe("a catalogue row becomes an entry", () => {
  it("carries both axes and the page they are published on", () => {
    expect(toCatalogueEntry(developerCert)).toEqual({
      id: "cat-ccdv-f",
      kind: "certification",
      platform: "Pearson VUE",
      label: "Claude Certified Developer - Foundations (CCDV-F)",
      courseUrl: "https://anthropic-partners.skilljar.com/x",
      active: true,
      sortOrder: 3,
    });
  });

  it("reads an unrecognised kind as a course rather than throwing", () => {
    /* `kind` is `text` behind a check constraint, so the generated type is
       `string` and the narrowing happens in the mapper. It falls *down*: the
       failure mode is a certification described as a course, never the reverse,
       and never a 500 on the whole directory. */
    expect(toCatalogueEntry({ ...claude101, kind: "diploma" }).kind).toBe("course");
  });
});

describe("held credentials", () => {
  it("come back in catalogue order, courses before certifications", () => {
    const credentials = toCredentials([
      credentialRow(developerCert),
      credentialRow(mcp),
      credentialRow(claude101),
    ]);

    expect(credentials.map((credential) => credential.entry.label)).toEqual([
      "Claude 101",
      "Introduction to Model Context Protocol",
      "Claude Certified Developer - Foundations (CCDV-F)",
    ]);
  });

  it("breaks a tie on the label, so the order is stable rather than merely sorted", () => {
    const beta: CatalogueRow = { ...claude101, id: "b", label: "Beta" };
    const alpha: CatalogueRow = { ...claude101, id: "a", label: "Alpha" };

    expect(
      toCredentials([credentialRow(beta), credentialRow(alpha)]).map(
        (credential) => credential.entry.label,
      ),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("publishes an evidence URL only where the practitioner did", () => {
    const [published, withheld] = toCredentials([
      credentialRow(claude101, { evidence_url_public: "https://example.invalid/certificate" }),
      credentialRow(mcp),
    ]);

    expect(published.evidenceUrl).toBe("https://example.invalid/certificate");
    /* Not "missing data": `evidence_url_public` is null unless `evidence_public`
       is true, and publishing a Skilljar page exposes a legal name. */
    expect(withheld.evidenceUrl).toBeNull();
  });

  it("never carries a field for the raw evidence URL", () => {
    /* The structural half of "`evidence_url` does not reach the browser". The
       query not naming it is the other half, and `anon` has no grant on it at
       all — but a mapper that spread the row would have carried it anyway, so
       the mapped object is asserted to have exactly four fields. */
    const [credential] = toCredentials([credentialRow(claude101)]);

    expect(Object.keys(credential).sort()).toEqual([
      "earnedAt",
      "entry",
      "evidenceUrl",
      "verified",
    ]);
  });

  it("drops a credential whose catalogue row did not come back", () => {
    /* `catalogue_id` is `not null` with `on delete restrict`, so this cannot
       come from the data — only from a query that forgot the embed. A
       label-less credential is the free text the catalogue exists to prevent,
       so it is dropped rather than rendered blank. */
    expect(toCredentials([{ ...credentialRow(claude101), credential_catalogue: null }])).toEqual(
      [],
    );
  });

  it("reads an absent collection as none held", () => {
    expect(toCredentials(null)).toEqual([]);
  });
});

describe("what a profile offers", () => {
  const catalogued = (label: string, sortOrder: number): ServiceRow => ({
    id: `svc-${label}`,
    catalogue_id: `cat-${label}`,
    label: null,
    service_catalogue: { id: `cat-${label}`, label, active: true, sort_order: sortOrder },
  });

  const custom = (label: string): ServiceRow => ({
    id: `svc-${label}`,
    catalogue_id: null,
    label,
    service_catalogue: null,
  });

  it("takes a catalogue service's label from the catalogue, in catalogue order", () => {
    expect(
      toServiceLabels([catalogued("Code review", 2), catalogued("One-to-one tutoring", 0)]),
    ).toEqual(["One-to-one tutoring", "Code review"]);
  });

  it("keeps a custom service, after the catalogued ones", () => {
    /* It renders and it is never a chip: there is no catalogue row to match, so
       the roster's filters cannot offer it. Promotion is what changes that. */
    expect(
      toServiceLabels([custom("Retrieval pipeline rescue"), catalogued("Implementation", 3)]),
    ).toEqual(["Implementation", "Retrieval pipeline rescue"]);
  });

  it("reads no services as none, which is a normal profile", () => {
    expect(toServiceLabels(null)).toEqual([]);
    expect(toServiceLabels([])).toEqual([]);
  });
});

describe("the filter vocabulary", () => {
  const option = (label: string, sortOrder: number, active = true) => ({
    id: `cat-${label}`,
    label,
    active,
    sort_order: sortOrder,
  });

  it("is the catalogue's own order rather than alphabetical", () => {
    expect(
      toServiceOptions([
        option("Evaluation and testing", 5),
        option("One-to-one tutoring", 0),
        option("Architecture and advisory", 4),
      ]).map((entry) => entry.label),
    ).toEqual(["One-to-one tutoring", "Architecture and advisory", "Evaluation and testing"]);
  });

  it("drops a retired entry, which is how a service leaves the vocabulary", () => {
    expect(
      toServiceOptions([option("Team training", 1), option("Prompt tuning", 2, false)]).map(
        (entry) => entry.label,
      ),
    ).toEqual(["Team training"]);
  });
});

describe("a profile row becomes the public record", () => {
  const row: ProfileRow = {
    id: "22222222-0000-4000-8000-000000000001",
    handle: "seed0001",
    name: "Mara Ellison",
    headline: "Staff engineer, agent platforms",
    location: "Sydney",
    country_code: "AU",
    bio: "Builds evaluation harnesses for tool-using agents.",
    focus: ["Agents", "Evals", "MCP"],
    availability: "Evenings and weekends.",
    website_url: "https://example.invalid/mara",
    github_url: null,
    linkedin_url: null,
    booking_url: null,
    practitioner_credentials: [credentialRow(claude101, { verified: true })],
    practitioner_services: [
      {
        id: "svc-1",
        catalogue_id: "cat-1",
        label: null,
        service_catalogue: {
          id: "cat-1",
          label: "Architecture and advisory",
          active: true,
          sort_order: 4,
        },
      },
    ],
  };

  it("maps every granted column and nothing else", () => {
    /* Exactly the `anon` grant plus the two embeds. `status`, `user_id`,
       `contact_id` and `approved_by` have no field to land in, which is the
       structural half of never rendering them: a component cannot reach for
       what the type does not have. */
    expect(Object.keys(toProfile(row)).sort()).toEqual([
      "availability",
      "bio",
      "bookingUrl",
      "countryCode",
      "credentials",
      "focus",
      "githubUrl",
      "handle",
      "headline",
      "id",
      "linkedinUrl",
      "location",
      "name",
      "services",
      "websiteUrl",
    ]);
  });

  it("keeps a null column null rather than substituting anything", () => {
    const bare = toProfile({
      ...row,
      headline: null,
      location: null,
      country_code: null,
      bio: null,
      availability: null,
      website_url: null,
      practitioner_credentials: null,
      practitioner_services: null,
    });

    expect(bare.headline).toBeNull();
    expect(bare.countryCode).toBeNull();
    expect(bare.credentials).toEqual([]);
    expect(bare.services).toEqual([]);
  });

  it("resolves the children it embeds", () => {
    const profile = toProfile(row);

    expect(profile.services).toEqual(["Architecture and advisory"]);
    expect(profile.credentials).toHaveLength(1);
    expect(profile.credentials[0]?.entry.label).toBe("Claude 101");
  });
});

describe("the hand-written row types", () => {
  /* `ProfileRow` describes one projection of `practitioners` rather than the
     whole table, so it is written by hand — but a column that changes type
     underneath it would otherwise go unnoticed until a page rendered wrong.
     This is a compile-time assertion with a runtime body: if the generated types
     stop agreeing, `pnpm build` fails here rather than the query does. */
  type Generated = Database["public"]["Tables"]["practitioners"]["Row"];
  type Projection = Omit<ProfileRow, "practitioner_credentials" | "practitioner_services">;
  type Assert<A extends B, B> = A;
  type _Columns = Assert<Pick<Generated, keyof Projection>, Projection>;

  type GeneratedCredential = Database["public"]["Tables"]["practitioner_credentials"]["Row"];
  type CredentialProjection = Omit<CredentialRow, "credential_catalogue">;
  type _Credentials = Assert<Pick<GeneratedCredential, keyof CredentialProjection>, CredentialProjection>;

  type GeneratedCatalogue = Database["public"]["Tables"]["credential_catalogue"]["Row"];
  type _Catalogue = Assert<Pick<GeneratedCatalogue, keyof CatalogueRow>, CatalogueRow>;

  it("still describe the generated columns", () => {
    /* The assertions are the three aliases above — they fail at compile time,
       not here. This body exists so the file reports a test, and it names them
       so they are used rather than merely declared. */
    const columns: _Columns | null = null;
    const credentials: _Credentials | null = null;
    const catalogue: _Catalogue | null = null;

    expect([columns, credentials, catalogue]).toEqual([null, null, null]);
  });
});
