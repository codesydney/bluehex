import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  adminCaller,
  anonCaller,
  practitionerCaller,
  type Caller,
} from "./harness/callers";
import {
  expectAllowed,
  expectPermissionDenied,
  expectSqlstate,
  sqlstate,
} from "./harness/result";
import { sql } from "./harness/stack";

import { services } from "@/lib/practitioners";

/**
 * The two catalogues: `credential_catalogue` and `service_catalogue`.
 *
 * Public reference data rather than anybody's record, which makes their policies
 * dull and their *grants* the whole of the enforcement. Two invariants rest on a
 * single omission apiece — nobody but `bluehex_admin` holds `insert`, so a
 * practitioner cannot invent a credential, and a custom service never becomes a
 * filter chip. Both fail closed as `42501`, and neither is visible in a policy.
 *
 * `active` is deliberately absent from the read policies. A profile holding a
 * retired entry still has to render its label, so the retired rows are readable by
 * everyone and `active` filters the picker, which is a query rather than a policy.
 * The assertions below read an inactive row from `anon` for exactly that reason:
 * they are what a later tidy-up moving `active` into `using` would break.
 */

let anon: Caller;
let practitioner: Caller;
let admin: Caller;

/** Rows a test made, swept by label so no test depends on another's cleanup. */
const testLabel = (name: string) => `harness ${name}`;

afterEach(async () => {
  await sql("delete from public.credential_catalogue where label like 'harness %'");
  await sql("delete from public.service_catalogue where label like 'harness %'");
});

/** Sets up through SQL. Assertions are made through a caller, never by re-reading here. */
async function seedCredentialEntry(
  label: string,
  {
    kind = "course",
    platform = "Anthropic Academy",
    courseUrl = null as string | null,
    active = true,
    sortOrder = 0,
  } = {},
): Promise<void> {
  await sql(
    `insert into public.credential_catalogue
       (kind, platform, label, course_url, active, sort_order)
     values ($1, $2, $3, $4, $5, $6)`,
    [kind, platform, testLabel(label), courseUrl, active, sortOrder],
  );
}

async function seedServiceEntry(
  label: string,
  { active = true, sortOrder = 0 } = {},
): Promise<void> {
  await sql(
    `insert into public.service_catalogue (label, active, sort_order)
     values ($1, $2, $3)`,
    [testLabel(label), active, sortOrder],
  );
}

beforeAll(async () => {
  anon = anonCaller();
  practitioner = await practitionerCaller("practitioner");
  admin = await adminCaller("admin");
});

describe("credential_catalogue reads", () => {
  it("is readable by anon and by a practitioner, retired entries included", async () => {
    await seedCredentialEntry("retired course", { active: false });

    const columns = "id, kind, platform, label, course_url, active, sort_order";
    const asAnon = await anon.client
      .from("credential_catalogue")
      .select(columns)
      .eq("label", testLabel("retired course"));
    const asPractitioner = await practitioner.client
      .from("credential_catalogue")
      .select(columns)
      .eq("label", testLabel("retired course"));

    /* Retired rather than hidden: an earned credential whose catalogue entry was
       retired still has to render its label. */
    expectAllowed(asAnon);
    expect(asAnon.data).toHaveLength(1);
    expect(asAnon.data?.[0]?.active).toBe(false);
    expectAllowed(asPractitioner);
    expect(asPractitioner.data).toHaveLength(1);
  });

  it("grants `kind`, `platform` and `course_url` to anon and to a practitioner", async () => {
    await seedCredentialEntry("a certification", {
      kind: "certification",
      platform: "Pearson VUE",
      courseUrl: "https://anthropic-partners.skilljar.com/harness-entry",
    });

    /* The grant that fails closed and silently. Reads on this table are
       column-scoped and a column added by `alter table` inherits no privilege, so
       the three columns #103 added are invisible until named in `grant select (…)`
       — refused `42501` before any policy runs. Every other test in this file goes
       on passing while the picker cannot see them, which is why this is asserted
       rather than inferred from the migration. */
    const columns = "kind, platform, course_url";
    const asAnon = await anon.client
      .from("credential_catalogue")
      .select(columns)
      .eq("label", testLabel("a certification"))
      .single();
    const asPractitioner = await practitioner.client
      .from("credential_catalogue")
      .select(columns)
      .eq("label", testLabel("a certification"))
      .single();

    expectAllowed(asAnon);
    expect(asAnon.data).toEqual({
      kind: "certification",
      platform: "Pearson VUE",
      course_url: "https://anthropic-partners.skilljar.com/harness-entry",
    });
    /* `platform` and `course_url` disagreeing is the two axes working rather than a
       data error: Pearson VUE delivers the exam, and the page describing it lives on
       a partner Skilljar tenant. */
    expectAllowed(asPractitioner);
    expect(asPractitioner.data).toEqual(asAnon.data);
  });

  it("refuses `select *`, and any column outside the grant list", async () => {
    const star = await anon.client.from("credential_catalogue").select();
    /* One request per column outside the grant, rather than one naming both: a
       `select` is refused as soon as *any* column it names is ungranted, so a
       combined probe stays red while one of the two leaks — which is the same
       reason `select *` above cannot carry this on its own. */
    const created = await practitioner.client
      .from("credential_catalogue")
      .select("id, created_at");
    const updated = await practitioner.client
      .from("credential_catalogue")
      .select("id, updated_at");

    expectPermissionDenied(anon, star);
    expectPermissionDenied(practitioner, created);
    expectPermissionDenied(practitioner, updated);
  });
});

describe("credential_catalogue writes", () => {
  it("refuses insert, update and delete to a practitioner", async () => {
    await seedCredentialEntry("a course");

    const insert = await practitioner.client
      .from("credential_catalogue")
      .insert({
        kind: "course",
        platform: "Anthropic Academy",
        label: testLabel("invented"),
      });
    const update = await practitioner.client
      .from("credential_catalogue")
      .update({ label: testLabel("renamed") })
      .eq("label", testLabel("a course"));
    const remove = await practitioner.client
      .from("credential_catalogue")
      .delete()
      .eq("label", testLabel("a course"));
    /* Readable is not writable. The three columns #103 added are in the `select`
       grant and in no other, so this is the other half of the grant assertion
       above — a `grant update (…)` written by reflex alongside the read would let a
       practitioner reweigh their own credential from `course` to `certification`. */
    const reweigh = await practitioner.client
      .from("credential_catalogue")
      .update({
        kind: "certification",
        platform: "Pearson VUE",
        course_url: "https://example.com/mine",
      })
      .eq("label", testLabel("a course"));

    /* The entire enforcement of "a practitioner cannot invent a credential":
       `catalogue_id` is a foreign key, and the table it points at is admin-only. */
    expectPermissionDenied(practitioner, insert);
    expectPermissionDenied(practitioner, update);
    expectPermissionDenied(practitioner, remove);
    expectPermissionDenied(practitioner, reweigh);

    const survivors = await anon.client
      .from("credential_catalogue")
      .select("label")
      .like("label", "harness %");
    expect(survivors.data).toEqual([{ label: testLabel("a course") }]);
  });

  it("refuses insert, update and delete to anon", async () => {
    await seedCredentialEntry("a course");

    const insert = await anon.client
      .from("credential_catalogue")
      .insert({
        kind: "certification",
        platform: "Pearson VUE",
        label: testLabel("invented"),
      });
    const update = await anon.client
      .from("credential_catalogue")
      .update({ label: testLabel("renamed") })
      .eq("label", testLabel("a course"));
    const remove = await anon.client
      .from("credential_catalogue")
      .delete()
      .eq("label", testLabel("a course"));

    /* Asserted rather than inferred from the absent grant, exactly as for the
       practitioner above: a later migration re-granting the table to `anon`
       would otherwise leave every test in this suite passing. */
    expectPermissionDenied(anon, insert);
    expectPermissionDenied(anon, update);
    expectPermissionDenied(anon, remove);
  });

  it("lets an admin add an entry, correct it and retire it", async () => {
    const added = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "certification",
        platform: "Pearson VUE",
        label: testLabel("builder"),
        course_url: "https://anthropic-partners.skilljar.com/harness-builder",
        sort_order: 3,
      })
      .select("id, kind, platform, label, course_url, active, sort_order")
      .single();
    expectAllowed(added);
    expect(added.data?.active).toBe(true);

    /* Corrections to this table are admin `UPDATE`s rather than migrations, or
       the history fills with Anthropic's release notes. */
    const corrected = await admin.client
      .from("credential_catalogue")
      .update({ label: testLabel("builder, renamed") })
      .eq("id", added.data!.id)
      .select("label")
      .single();
    expectAllowed(corrected);
    expect(corrected.data?.label).toBe(testLabel("builder, renamed"));

    const retired = await admin.client
      .from("credential_catalogue")
      .update({ active: false })
      .eq("id", added.data!.id)
      .select("active")
      .single();
    expectAllowed(retired);
    expect(retired.data?.active).toBe(false);

    /* `.select(...).single()` rather than a bare `delete()`: a DELETE matching
       zero rows is a 204 with no error, and RLS filters DELETE silently through
       `USING`, so `expectAllowed` on its own would prove the grant and not the
       delete. `PGRST116` on zero rows is what makes a no-op fail loudly. */
    const removed = await admin.client
      .from("credential_catalogue")
      .delete()
      .eq("id", added.data!.id)
      .select("id")
      .single();
    expectAllowed(removed);
  });

  it("refuses the same entry twice on one platform, and allows it on the other", async () => {
    await seedCredentialEntry("a course", { platform: "Anthropic Academy" });

    const duplicate = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "course",
        platform: "Anthropic Academy",
        label: testLabel("a course"),
      });
    /* `unique (platform, label)` rather than a slug: the id is the reference, and
       this is what stops two admins adding the same course twice. */
    expectSqlstate(duplicate, sqlstate.uniqueViolation);

    /* The same label on the other platform is a different credential — which is
       also why `kind` is deliberately not in the constraint: a course and the exam
       that certifies it can legitimately share a name. */
    const otherPlatform = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "certification",
        platform: "Pearson VUE",
        label: testLabel("a course"),
      });
    expectAllowed(otherPlatform);
  });

  it("refuses a `kind` or a `platform` outside its two-value axis", async () => {
    const badKind = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "workshop",
        platform: "Anthropic Academy",
        label: testLabel("a workshop"),
      });
    const badPlatform = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "certification",
        platform: "AWS",
        label: testLabel("solutions architect"),
      });

    /* Two genuine two-value axes, each still a check constraint; it is the labels
       that outgrew one and became rows. Asserted separately because one list
       widened by accident would otherwise be invisible. */
    expectSqlstate(badKind, sqlstate.checkViolation);
    expectSqlstate(badPlatform, sqlstate.checkViolation);
  });

  it("refuses a `course_url` the `https_url` domain rejects", async () => {
    const refused = await admin.client
      .from("credential_catalogue")
      .insert({
        kind: "course",
        platform: "Anthropic Academy",
        label: testLabel("hostile link"),
        course_url: "javascript:alert(1)",
      });

    /* `course_url` is granted to `anon` and rendered as an `href`, so it carries the
       same exposure as the published profile links and reuses their domain rather
       than being plain `text`. */
    expectSqlstate(refused, sqlstate.checkViolation);
  });
});

describe("service_catalogue reads", () => {
  it("is readable by anon and by a practitioner, retired entries included", async () => {
    await seedServiceEntry("retired service", { active: false });

    const columns = "id, label, active, sort_order";
    const asAnon = await anon.client
      .from("service_catalogue")
      .select(columns)
      .eq("label", testLabel("retired service"));
    const asPractitioner = await practitioner.client
      .from("service_catalogue")
      .select(columns)
      .eq("label", testLabel("retired service"));

    /* Same reason as the credential catalogue: a profile offering a service that
       was later retired still has to render its label. */
    expectAllowed(asAnon);
    expect(asAnon.data).toHaveLength(1);
    expect(asAnon.data?.[0]?.active).toBe(false);
    expectAllowed(asPractitioner);
    expect(asPractitioner.data).toHaveLength(1);
  });

  it("refuses `select *`, and any column outside the grant list", async () => {
    const star = await anon.client.from("service_catalogue").select();
    /* Both provenance columns, for the same reason as the credential catalogue:
       either one alone leaves the other free to be granted unnoticed. */
    const created = await practitioner.client
      .from("service_catalogue")
      .select("id, created_at");
    const updated = await practitioner.client
      .from("service_catalogue")
      .select("id, updated_at");

    expectPermissionDenied(anon, star);
    expectPermissionDenied(practitioner, created);
    expectPermissionDenied(practitioner, updated);
  });

  it("carries the six services from `src/lib/practitioners.ts`, in that order", async () => {
    const seeded = await anon.client
      .from("service_catalogue")
      .select("label, active, sort_order")
      .not("label", "like", "harness %")
      .order("sort_order");

    expectAllowed(seeded);
    /* Bluehex's own first guess at the vocabulary, read from the module the
       directory renders from rather than retyped — the filter chips and the rows
       behind them cannot drift apart. Promotion is what corrects it from here. */
    expect(seeded.data).toEqual(
      services.map((label, index) => ({ label, active: true, sort_order: index })),
    );
  });
});

describe("service_catalogue writes", () => {
  it("refuses insert, update and delete to a practitioner", async () => {
    await seedServiceEntry("a service");

    const insert = await practitioner.client
      .from("service_catalogue")
      .insert({ label: testLabel("my own speciality") });
    const update = await practitioner.client
      .from("service_catalogue")
      .update({ label: testLabel("renamed") })
      .eq("label", testLabel("a service"));
    const remove = await practitioner.client
      .from("service_catalogue")
      .delete()
      .eq("label", testLabel("a service"));

    /* The whole of "a custom service never becomes a filter chip". A practitioner
       writes custom services on their own profile (#90); widening the filter
       vocabulary is promotion, which is Bluehex's call. */
    expectPermissionDenied(practitioner, insert);
    expectPermissionDenied(practitioner, update);
    expectPermissionDenied(practitioner, remove);
  });

  it("refuses insert, update and delete to anon", async () => {
    await seedServiceEntry("a service");

    const insert = await anon.client
      .from("service_catalogue")
      .insert({ label: testLabel("my own speciality") });
    const update = await anon.client
      .from("service_catalogue")
      .update({ label: testLabel("renamed") })
      .eq("label", testLabel("a service"));
    const remove = await anon.client
      .from("service_catalogue")
      .delete()
      .eq("label", testLabel("a service"));

    expectPermissionDenied(anon, insert);
    expectPermissionDenied(anon, update);
    expectPermissionDenied(anon, remove);
  });

  it("lets an admin promote a service, rename it and retire it", async () => {
    const promoted = await admin.client
      .from("service_catalogue")
      .insert({ label: testLabel("prompt library review"), sort_order: 9 })
      .select("id, label, active")
      .single();
    expectAllowed(promoted);
    expect(promoted.data?.active).toBe(true);

    const renamed = await admin.client
      .from("service_catalogue")
      .update({ label: testLabel("prompt review") })
      .eq("id", promoted.data!.id)
      .select("label")
      .single();
    expectAllowed(renamed);

    const retired = await admin.client
      .from("service_catalogue")
      .update({ active: false })
      .eq("id", promoted.data!.id)
      .select("active")
      .single();
    expectAllowed(retired);
    expect(retired.data?.active).toBe(false);

    /* Same as the credential catalogue: the returned row is what distinguishes
       a delete that happened from one RLS filtered to nothing. */
    const removed = await admin.client
      .from("service_catalogue")
      .delete()
      .eq("id", promoted.data!.id)
      .select("id")
      .single();
    expectAllowed(removed);
  });

  it("refuses the same label twice", async () => {
    await seedServiceEntry("a service");

    const duplicate = await admin.client
      .from("service_catalogue")
      .insert({ label: testLabel("a service") });

    /* `label` is unique on its own here — there is no `platform` axis, and two rows
       spelling the same service would be two chips filtering the same thing. */
    expectSqlstate(duplicate, sqlstate.uniqueViolation);
  });

  it("bumps `updated_at` when an entry is edited, and leaves it alone at insert", async () => {
    const inserted = await admin.client
      .from("service_catalogue")
      .insert({ label: testLabel("timestamped") })
      .select("id")
      .single();
    expectAllowed(inserted);

    const [fresh] = await sql<{ created_at: Date; updated_at: Date }>(
      "select created_at, updated_at from public.service_catalogue where id = $1",
      [inserted.data!.id],
    );
    /* `before update` only: a row that has never been edited must not claim it
       was. Both columns take the same default at insert. */
    expect(new Date(fresh!.updated_at).getTime()).toBe(
      new Date(fresh!.created_at).getTime(),
    );

    const edited = await admin.client
      .from("service_catalogue")
      .update({ label: testLabel("timestamped, corrected") })
      .eq("id", inserted.data!.id)
      .select("id")
      .single();
    expectAllowed(edited);

    const [after] = await sql<{ created_at: Date; updated_at: Date }>(
      "select created_at, updated_at from public.service_catalogue where id = $1",
      [inserted.data!.id],
    );
    /* This table's correction path is an admin `UPDATE`, exactly like the
       credential catalogue's — a timestamp that silently lies is worse than an
       absent one. */
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(after!.created_at).getTime(),
    );
  });
});
