import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { reviewQueueFixtures } from "./_lib/queue.fixtures";
import { checkable, type QueueProfile } from "./_lib/queue";
import { ReviewQueue } from "./review-queue";

/**
 * What the review queue may and may not put on screen.
 *
 * Rendered to static markup rather than driven in a browser: every assertion
 * here is about what the HTML contains, which is exactly the level the binding
 * rule is stated at. No JSX and no DOM environment, so the file is a `.ts` and
 * the suite needs neither React Testing Library nor jsdom.
 *
 * The component shows one profile at a time and selects the first, so each
 * profile is rendered as a queue of one. That is also how the awkward fixtures
 * get individually asserted.
 */

const queue = reviewQueueFixtures();

function render(profiles: QueueProfile[]): string {
  return renderToStaticMarkup(
    createElement(ReviewQueue, { queue: profiles, reviewer: "david" }),
  );
}

function renderOne(name: string): string {
  const person = queue.find((candidate) => candidate.name === name);
  if (!person) throw new Error(`fixture "${name}" is gone`);
  return render([person]);
}

const everyProfile: [string, string][] = queue.map((person) => [person.name, render([person])]);

/* ------------------------------------------------------------------ */
/* Binding: nothing renders a certificate                             */
/* ------------------------------------------------------------------ */

describe("evidence is linked and never embedded", () => {
  /* `evidence_url` is submitted by an untrusted practitioner and the admin
     reading it is the one principal who can set `verified`. Framing it lets the
     page navigate the top frame away or draw a fake Bluehex sign-in and phish
     the session that grants the badge; fetching it server-side to proxy or
     screenshot is SSRF against a host running Supabase on localhost:54321 and
     cloud metadata on 169.254.169.254; any remote subresource, an `<img>`
     included, leaks the admin's address and the timing of the review back to
     the person under review; a PDF rendered inline parses attacker-controlled
     binary in a browser holding admin rights. */
  const embedding = /<(iframe|embed|object|img|picture|source|video|audio|track|link|script|frame|frameset|portal)\b/i;

  it.each(everyProfile)("renders no embedding element at all for %s", (_name, html) => {
    expect(html).not.toMatch(embedding);
  });

  it.each(everyProfile)("puts every evidence URL in an href and nowhere else", (name, html) => {
    const person = queue.find((candidate) => candidate.name === name)!;

    for (const held of person.credentials) {
      if (!held.evidenceUrl) continue;

      /* The only attribute the URL may appear in is `href`. Anything that would
         make the browser fetch it — src, srcset, data, poster, action, a CSS
         url() — is the rule being broken however it got there. */
      const fetching = new RegExp(
        `(src|srcset|data|poster|action|formaction|background|cite|ping|style)\\s*=\\s*"[^"]*${escapeForRegExp(held.evidenceUrl)}`,
        "i",
      );
      expect(html).not.toMatch(fetching);

      /* And it is present: withholding the URL from the one screen where the
         judgement is made was never part of the argument for not rendering
         certificates. It is what distinguishes a file-share link from a
         Skilljar certificate page, and it is the only reason a reused
         certificate is catchable by a human at all. */
      expect(html).toContain(held.evidenceUrl);
    }
  });

  it.each(everyProfile)("links only https, and only with noopener noreferrer, for %s", (_name, html) => {
    /* Every anchor, not the http ones. Skipping the rest is how this assertion
       would step around the case it exists to catch: a `javascript:` href would
       be filtered out before the check and the suite would stay green. */
    for (const anchor of html.match(/<a\b[^>]*>/g) ?? []) {
      expect(anchor).toMatch(/href="https:\/\//i);
      expect(anchor).toContain('rel="noopener noreferrer"');
      expect(anchor).toContain('target="_blank"');
    }
  });

  it.each([
    "javascript:alert(document.cookie)",
    " javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "http://anthropic.skilljar.com/certificate/x",
    "vbscript:msgbox(1)",
  ])("refuses to link %s while still showing it", (hostile) => {
    /* The database refuses all of these — `evidence_url` is `public.https_url`
       — so this is the redundant half of the pair, asserted because the rule
       belongs in the file that writes the `href` rather than only in a
       migration. The string still renders: it is what the admin is judging, and
       an evidence URL that is not an https address is itself the finding. */
    const person = queue.find((candidate) => candidate.name === "Aroha Ngata")!;
    const html = render([
      {
        ...person,
        credentials: [{ ...person.credentials[0]!, evidenceUrl: hostile }],
      },
    ]);

    expect(html).not.toMatch(/<a\b/);
    expect(html).toContain("Not an https address, so there is nothing to open.");
    expect(html).toContain(escapeForHtml(hostile));
  });

  it("shows the URL as text as well as linking it", () => {
    /* Two occurrences: the href and the visible string. `Open certificate`
       alone renders a Drive link and a certificate page identically. */
    const html = renderOne("Marcus Bell");
    const url = "https://drive.google.com/file/d/1Xk9mQ/view";

    expect(html.split(url)).toHaveLength(3);
  });
});

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* React escapes text children; the assertion has to compare against what lands
   in the markup rather than against the input. */
function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/* The invariants from the design notes                               */
/* ------------------------------------------------------------------ */

describe("the two axes stay apart", () => {
  it("captions them separately, as two decisions rather than two stages", () => {
    const html = renderOne("Priya Raghavan");

    expect(html).toContain("Visible?");
    expect(html).toContain("Credentials");
    expect(html).toContain("Independent of the badge");
    expect(html).toContain("Checked one at a time");
  });

  it("does not read as unfinished when a profile is approved and unbadged", () => {
    /* Approved, one credential earned, no certificate to check — nothing left
       to do, and no badge. If this ever says otherwise, admins start withholding
       approval until they can verify and the directory empties. */
    const haewon = queue.find((person) => person.name === "Hae-Won Park")!;
    const html = render([{ ...haewon, status: "approved" }]);

    expect(html).toContain("Nothing left on this profile.");
    expect(html).toContain("no certificate supplied");
    expect(html).toContain("cannot be checked");
  });
});

describe("there is no verify-a-profile action", () => {
  it.each(everyProfile)("offers a check only per credential, for %s", (name, html) => {
    const person = queue.find((candidate) => candidate.name === name)!;

    /* One Verify button per credential an admin can actually act on, and not
       one more. A profile-level control would show up here as a count that does
       not match. */
    expect(html.split(">Verify<")).toHaveLength(checkable(person).length + 1);
    expect(html).not.toMatch(/verify (this )?profile/i);
    expect(html).not.toMatch(/verify all/i);
  });

  it("offers nothing to check on a profile with no credentials", () => {
    /* Devon Achebe's bio claims progress nobody can check. If a design ever
       tempts an admin to treat that as something to verify, the confusion
       in-progress rows caused has moved into the prose rather than been
       removed. */
    const html = renderOne("Devon Achebe");

    expect(html).toContain("None claimed.");
    expect(html).not.toContain(">Verify<");
  });
});

describe("Bluehex gets no Withdraw button", () => {
  it.each(everyProfile)("offers only pending, approved and rejected for %s", (_name, html) => {
    expect(html).not.toMatch(/withdraw/i);

    const controls = ["Approve", "Reject", "Back to pending"].filter((label) =>
      html.includes(`>${label}<`),
    );
    /* Two of the three at a time: the button for the status the profile is
       already in is not rendered. */
    expect(controls).toHaveLength(2);
  });
});

describe("owner assignment is one-way", () => {
  it("offers it on the unclaimed profile", () => {
    const html = renderOne("Ines Delacroix");

    expect(html).toContain(">Assign owner<");
    expect(html).toMatch(/cannot be\s+undone/);
  });

  it.each(everyProfile.filter(([name]) => name !== "Ines Delacroix"))(
    "offers nothing at all once %s has an owner",
    (_name, html) => {
      expect(html).not.toContain("Assign owner");
      expect(html).not.toMatch(/reassign|change owner|transfer/i);
    },
  );
});

describe("verified_by and verified_at are the substance", () => {
  it("names the human and the day on every checked credential", () => {
    const html = renderOne("Priya Raghavan");

    expect(html).toContain("Checked by david on 2026-08-10.");
    expect(html).toContain("Checked by david on 2026-08-12.");
  });

  it("says nothing of the kind on a credential nobody has checked", () => {
    const html = renderOne("Aroha Ngata");

    expect(html).not.toContain("Checked by");
  });
});

describe("the queue itself", () => {
  it("says how much work there is and of what kind", () => {
    const html = render(queue);

    expect(html).toContain("profiles need you");
    for (const label of [
      "Everything",
      "Needs a decision",
      "Certificates to check",
      "Edited since checked",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Longest untouched");
  });

  it("puts the longest untouched profile at the top and opens it", () => {
    const html = render(queue);

    /* Hae-Won Park, 2026-08-12, is the oldest of the profiles with work. The
       detail panel opens on whatever is first. */
    expect(html).toContain("Hae-Won Park");
    expect(html.indexOf("Hae-Won Park")).toBeLessThan(html.indexOf("Marcus Bell"));
  });

  it("moves a profile out of the working list once nothing is outstanding", () => {
    /* All nine fixtures have work to do, which is what a queue looks like on
       the day it is opened. Approving Hae-Won Park finishes her — the earned
       credential with no evidence is not a task — and she leaves the list. */
    const finished = queue.map((person) =>
      person.name === "Hae-Won Park" ? { ...person, status: "approved" as const } : person,
    );
    const html = render(finished);

    expect(html).toContain("Reviewed — 1");
    expect(html).toContain("8 profiles need you");
  });
});
