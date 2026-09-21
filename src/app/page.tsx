import { AgentDirectory } from "@/components/agent-directory";
import { Button, SectionLabel } from "@/components/ui";
import { agents } from "@/lib/agents";
import { site } from "@/lib/site";

/**
 * Agent Exchange — the home page.
 *
 * `agents` is a hardcoded array, not a query, and deliberately so: see
 * `@/lib/agents` for why. That also means there is no cached-Postgres-read
 * story to tell here the way `/practitioners` has one — this page is as
 * static as `next build` can make it, and stays that way until a submission
 * model exists to query against.
 */
export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="container-x pt-36 pb-20 md:pt-48 md:pb-28">
        <SectionLabel>Agent Exchange</SectionLabel>

        <h1 className="display-1 mt-8 max-w-6xl">Agent Exchange.</h1>

        <p className="mt-10 max-w-2xl text-lg text-t-muted md:text-xl">{site.tagline}</p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Button href="#agents" size="lg">
            Browse agents
          </Button>
          <Button href="/contact" variant="outline" size="lg">
            List your agent
          </Button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Agent directory — search, filters, listings                      */}
      {/* ---------------------------------------------------------------- */}
      <AgentDirectory agents={agents} />
    </>
  );
}
