import { AgentDirectory } from "@/components/agent-directory";
import { Collaborators } from "@/components/collaborators";
import { Button, Hero } from "@/components/ui";
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
      <Hero
        title="Agent Exchange."
        lead={site.tagline}
        actions={
          <>
            <Button href="#agents" size="lg">
              Browse agents
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              List your agent
            </Button>
          </>
        }
      >
        <Collaborators />
      </Hero>

      <AgentDirectory agents={agents} />
    </>
  );
}
