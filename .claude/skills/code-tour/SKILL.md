---
name: code-tour
description: Run a guided, learner-driven code tour to consolidate understanding of recently built code — trace one real flow end to end, hop by hop, with withheld answers, self-discovery homework, and a closing self-quiz. Use when the user says things like "it's still not clear to me", "walk me through what we built", "I want to consolidate", "give me a tour", or after several slices land faster than understanding.
---

<!--
  code-tour — © 2026 David Taing. All rights reserved.
  Original work, vendored from github.com/davidtaing/skills. Not a fork or
  adaptation of a third-party skill.
-->

# Code Tour

A consolidation session where the **learner does the cognitive work**. The teacher
picks the route, points at where to look, and verifies understanding — but never
hands over an answer the learner could retrieve or discover themselves.

## Setup

1. Pick **one real flow** and trace it end to end — a single HTTP request, CLI
   invocation, or message path. Concrete beats comprehensive.
2. Show the full route map upfront (every layer the flow touches, as a diagram),
   then mark "← we are here" as you go. The map kills the lost-in-the-middle feeling.
3. Read the actual source files before explaining anything. Reference code as
   `file.ex:line` so the learner can open it.
4. **Defuse naming collisions immediately** when the route map contains one
   (e.g. Phoenix "pipeline" vs a domain Pipeline resource). Name the collision
   before it causes silent confusion.

## Hop protocol (repeat per layer)

- **One concept per hop.** Show the real code, explain the structure and the one
  design idea it embodies. Resist completeness — point at things worth noticing,
  don't enumerate everything.
- **End every hop with a comprehension check** the learner answers in their own
  words before advancing. "Ready?" is not a check; "what decides X and where
  would you look?" is.
- **Affirm precisely.** Echo back what they got right in sharpened vocabulary
  (give the concept its real name: content negotiation, mass assignment). If
  they're right at the wrong zoom level, say so — "right skeleton, wrong zoom" —
  and ask them to zoom in rather than zooming in for them.
- **Seed forward-looking questions** that the next hop answers, so hops pull
  rather than push ("something must parse the body — and it's not in this file").

## Withholding answers

When the learner is unsure, give **where to look + a discriminating question**,
never the answer:

- Two competing hypotheses → name the experiment/doc that splits them
  (`h Module.fun` in a REPL, a specific file, a curl).
- A buried assumption in their guess → surface the assumption, have them predict,
  *then* read the code to check themselves.
- Honor "don't tell me yet" strictly. Track withheld answers — they are homework.

**Predict-then-verify** beats verify alone: before they open a file or run a
command, get the prediction on record.

When they attempt and genuinely can't generate the answer (e.g. a domain they've
never touched, like a security attack they've never seen), **teach it directly** —
withholding only works for retrievable/discoverable knowledge. Prefer a concrete
story or prior-art comparison over an abstract definition.

## Tangents

Design questions surfaced mid-tour ("should we relitigate X?") get **parked, not
chased**: capture the insight that resolved or sharpened the question, note the
open sub-question, name the future trigger point for deciding it. Then return to
the route.

## Closing

1. **Self-quiz**: 5–8 questions built from the hops, answerable cold if the tour
   stuck. Phrase for retrieval, not recognition. Include one "do" item (run the
   curl, trigger the error path they predicted).
2. If the learner quizzes immediately and wobbles on something they had earlier,
   treat it as **end-of-session fade, not a gap** — give the scaffold/mnemonic
   they built earlier with a blank to fill, and suggest stopping. Sleep beats
   another rep.
3. **Bookmark in memory** (or a session-notes file if no memory system): hops
   completed *as verified in the learner's own words*, pending homework with
   explicit "answer not revealed — ask before telling" flags, parked tangents
   with their trigger points, and remaining route. Next session opens by asking
   what they found — never by revealing.

## Pacing signals

- A streak of quick "sounds good" approvals → comprehension check now.
- "We've covered a lot of ground" / "I'm not 100%" → offer to pause and quiz
  rather than push to finish the route. Stopping before saturation is success.
- Learner asks "what should I be looking at? don't tell me" → they're driving;
  protect that.
