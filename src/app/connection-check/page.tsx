import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Connection check",
  description: "Confirms the app can reach Supabase.",
  robots: { index: false, follow: false },
};

/**
 * The walking skeleton's far end: it tries to read a row and reports what happened,
 * so "the database is wired up" is a claim you can check rather than assume — locally,
 * and on a Vercel preview against the hosted project.
 *
 * It reports three states rather than two, because "reached Supabase" and "read the
 * row" are different claims and only one of them is true on the hosted project right
 * now. `connection_check` is a local-only fixture: its migration is deliberately not
 * pushed, so the hosted schema history can start at the first real table instead of
 * carrying a health-check table that gets dropped a fortnight later. Against hosted,
 * PostgREST answers `PGRST205` — which is a *successful* connection reporting an
 * absent table, and collapsing it into "not connected" would report a working
 * deployment as broken.
 *
 * It renders failures instead of throwing. A page that 500s tells you something is
 * wrong and nothing else, and on a deployment the message is hidden; the whole point
 * of this route is to say *which* part is wrong.
 *
 * Delete it once real queries exist and would notice a broken connection first.
 */
export default async function ConnectionCheckPage() {
  /* Nothing in this render reads cookies or headers, so without `connection()` Next
     would prerender the page at build time — which means querying Supabase during
     `next build`, in CI and previews where the keys may not be set. AGENTS.md calls
     this out as the one case that still needs it. */
  await connection();

  const result = await check();

  return (
    <>
      <PageHeader
        label="Connection check"
        title="Can the app reach Supabase?"
        lead="Read through the Supabase client with the publishable key, subject to row level security like any visitor's request."
      />

      <section className="container-x pb-24">
        <Card>
          <Badge tone="strong">{states[result.state].label}</Badge>
          <p className="mt-6 text-lg">{states[result.state].summary}</p>

          {result.state === "read" ? (
            <dl className="mt-8 grid gap-3 text-sm text-t-muted sm:grid-cols-2">
              <div>
                <dt className="text-t-faint">Row says</dt>
                <dd className="mt-1">{result.note}</dd>
              </div>
              <div>
                <dt className="text-t-faint">Row written at</dt>
                <dd className="mt-1">{result.checkedAt}</dd>
              </div>
            </dl>
          ) : (
            <pre className="mt-6 overflow-x-auto rounded-lg bg-ink/5 p-4 text-sm whitespace-pre-wrap text-t-muted">
              {result.detail}
            </pre>
          )}

          <p className="mt-8 text-sm text-t-faint">Checked at {new Date().toISOString()}</p>
        </Card>
      </section>
    </>
  );
}

/* The three outcomes worth telling apart. `reachable` is the one that is easy to get
   wrong: it means Supabase answered and accepted the key, and only the table is
   missing — a pass for everything this page is actually testing. */
type State = "read" | "reachable" | "unreachable";

const states: Record<State, { label: string; summary: string }> = {
  read: {
    label: "Connected",
    summary: "Supabase answered and the row came back.",
  },
  reachable: {
    label: "Reachable — schema not deployed",
    summary:
      "Supabase answered and accepted the key, so the URL and credentials are right. The connection_check table is a local-only fixture and is not in this database, which is expected until the first real migration is pushed.",
  },
  unreachable: {
    label: "Not connected",
    summary: "Supabase could not be reached, or refused the credentials.",
  },
};

type Result =
  | { state: "read"; note: string; checkedAt: string }
  | { state: "reachable" | "unreachable"; detail: string };

/* PostgREST's code for a table that is not in its schema cache. The request itself
   succeeded, so this is the signal that separates "no schema here" from "no
   connection". */
const TABLE_NOT_FOUND = "PGRST205";

async function check(): Promise<Result> {
  try {
    const { data, error } = await getClient()
      .from("connection_check")
      .select("note, checked_at")
      .order("id")
      .limit(1)
      .maybeSingle();

    if (error) {
      const detail = `${error.code ?? "error"}: ${error.message}`;
      return error.code === TABLE_NOT_FOUND
        ? { state: "reachable", detail }
        : { state: "unreachable", detail };
    }

    /* Reached the table and it is empty — the connection is fine, the fixture is not.
       Worth separating from a missing table, because the fix is different. */
    if (!data) {
      return { state: "reachable", detail: "connection_check exists but has no rows." };
    }

    return { state: "read", note: data.note, checkedAt: data.checked_at };
  } catch (cause) {
    /* getClient() throws when the environment variables are missing, and fetch throws
       when nothing is listening — both mean not connected, and both are worth reading
       rather than swallowing. */
    return {
      state: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
