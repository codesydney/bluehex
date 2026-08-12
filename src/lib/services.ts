/**
 * The engagement ladder and the intake steps shown on the home page.
 *
 * Deliberately narrow: Bluehex only sells Claude and Anthropic work, so every
 * rung here is the same subject at a different scale rather than a spread of
 * unrelated services.
 */

export type Engagement = {
  title: string;
  scale: string;
  blurb: string;
  points: string[];
};

export const engagements: Engagement[] = [
  {
    title: "One-to-one tutoring",
    scale: "Individuals",
    blurb:
      "An hour with a practitioner who uses Claude every day. Bring your own work — we start from what you are actually trying to ship.",
    points: ["Claude and Claude Code fundamentals", "Prompting and context habits", "Your codebase, not a toy example"],
  },
  {
    title: "Team workshops",
    scale: "Teams",
    blurb:
      "Get a whole team from curious to productive in a day. Run on your repositories, with the conventions your team already follows.",
    points: ["Hands-on sessions", "Agent and skill authoring", "Review and hand-off practices"],
  },
  {
    title: "Build with Claude",
    scale: "Product work",
    blurb:
      "We build the thing. Agents, MCP servers, Claude Code workflows and API integrations wired into your existing stack.",
    points: ["Agent and tool design", "MCP servers and integrations", "Evaluation before rollout"],
  },
  {
    title: "Enterprise consulting",
    scale: "Organisations",
    blurb:
      "Rollout strategy for organisations adopting Claude at scale — what to standardise, what to measure, and what to keep a human on.",
    points: ["Adoption and enablement plans", "Governance and guardrails", "Security and data-handling review"],
  },
];

export type Step = {
  title: string;
  blurb: string;
};

export const steps: Step[] = [
  {
    title: "Tell us what you need",
    blurb:
      "A short conversation about the work, the team and the constraints. No forms to fill in before a human reads it.",
  },
  {
    title: "Matched with a practitioner",
    blurb:
      "We put forward someone from the network whose credentials and background fit the engagement, and you meet them first.",
  },
  {
    title: "Start small, then scale",
    blurb:
      "Most engagements open with a single session or a scoped pilot. Grow it into a team rollout only once it has earned that.",
  },
];
