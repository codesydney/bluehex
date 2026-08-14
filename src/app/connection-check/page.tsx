import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Connection check",
  description: "Confirms the app can read from Supabase.",
  robots: { index: false, follow: false },
};

/**
 * The walking skeleton's far end. It reads one row from `connection_check` and shows
 * what came back, so "the database is wired up" is a claim you can check rather than
 * assume — locally, and on a Vercel preview against the hosted project.
 *
 * It deliberately renders the failure instead of throwing. A page that 500s tells you
 * something is wrong and nothing else, and on a deployment the message is hidden; the
 * whole point of this route is to say *which* part is wrong.
 *
 * Delete it once real queries exist and would notice a broken connection first.
 */
export default async function ConnectionCheckPage() {
  /* Nothing in this render reads cookies or headers, so without `connection()` Next
     would prerender the page at build time — which means querying Supabase during
     `next build`, in CI and previews where the keys may not be set. AGENTS.md calls
     this out as the one case that still needs it. */
  await connection();

  const result = await read();

  return (
    <>
      <PageHeader
        label="Connection check"
        title="Can the app reach Supabase?"
        lead="One row, read through the Supabase client with the publishable key, subject to row level security like any visitor's request."
      />

      <section className="container-x pb-24">
        <Card>
          {result.ok ? (
            <>
              <Badge tone="strong">Connected</Badge>
              <p className="mt-6 text-lg">{result.note}</p>
              <dl className="mt-8 grid gap-3 text-sm text-t-muted sm:grid-cols-2">
                <div>
                  <dt className="text-t-faint">Row written at</dt>
                  <dd className="mt-1">{result.checkedAt}</dd>
                </div>
                <div>
                  <dt className="text-t-faint">Read at</dt>
                  <dd className="mt-1">{new Date().toISOString()}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <Badge tone="strong">Not connected</Badge>
              <p className="mt-6 text-lg">Supabase did not return the row.</p>
              <pre className="mt-6 overflow-x-auto rounded-lg bg-ink/5 p-4 text-sm whitespace-pre-wrap text-t-muted">
                {result.message}
              </pre>
            </>
          )}
        </Card>
      </section>
    </>
  );
}

type Result =
  | { ok: true; note: string; checkedAt: string }
  | { ok: false; message: string };

async function read(): Promise<Result> {
  try {
    const { data, error } = await getClient()
      .from("connection_check")
      .select("note, checked_at")
      .order("id")
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, message: `${error.code ?? "error"}: ${error.message}` };
    if (!data) return { ok: false, message: "Connected, but connection_check is empty." };

    return { ok: true, note: data.note, checkedAt: data.checked_at };
  } catch (cause) {
    /* getClient() throws when the environment variables are missing, and fetch throws
       when nothing is listening — both mean "not connected", and both are worth
       reading rather than swallowing. */
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
  }
}
