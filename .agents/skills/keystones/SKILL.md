---
name: keystones
description: Close a context-gathering pass by naming the keystones and turning them into invariants that are written down where they bind. Use before a design review or before handing substantial work to an agent — when you have explored a problem and want the constraints locked before anyone builds. Not a grilling skill and not a planning skill: it produces constraints, not steps.
---

# Keystones

Ends an exploration by writing down what must not happen. That is all it does.

The exploration itself is yours and stays freeform — reading code, asking questions,
poking at a service to see how it answers. This skill is the last five minutes: decide
which of what you found is load-bearing, turn those into statements someone can be
caught violating, and put them somewhere they will be read at the moment they matter.

## Why this exists rather than "scope it better upfront"

Scope is genuinely hard to set before you start, because the constraints that matter
usually only become visible once the work is underway. That objection is correct, and
"scope harder" is the wrong lesson to draw from work that sprawled.

Invariants do not have the problem. They say what is unacceptable rather than what to
build, so they can be stated before anyone knows the shape of the answer. **Plans go
stale the moment you learn something; invariants survive learning.**

The failure this prevents, in its usual form: a decision gets made early, something
later invalidates the premise it rested on, and instead of revisiting the decision
everyone builds machinery to keep satisfying it. Each step is individually reasonable.
Only the pile is wrong.

## When to use it

- After context gathering, before whatever design review comes next. That review can then
  attack the design without re-litigating the constraints, which makes it cheaper and
  sharper.
- Before handing a substantial piece of work to an agent, which will build whatever is
  asked for, quickly, including the wrong thing.
- When a piece of work is about to touch something permanent — migration history, a
  public URL, a data model, anything with a badge on it.

Skip it for work with no lasting artifact. A one-line fix does not need invariants.

## Workflow

### 1. Separate keystones from findings

Exploration turns up many facts. Most are findings: true, useful, and not load-bearing.
A **keystone** is the one where being wrong makes everything built on top of it wrong.

Ask of each candidate: *if this turns out to be wrong, what has to be redone?* If the
answer is "a bit of code", it is a finding. If it is "the schema, the API and every
consumer", it is a keystone. Keep the keystones and drop the rest — a list that includes
everything you learned constrains nothing.

Three to five. If there are more, they are not all keystones.

### 2. Turn each into a violable statement

The test: **could someone break this, and could you point at the breach in a diff?**

- "Nothing throwaway gets committed" — violable. You can point at the file.
- "No schema lands before the model is settled" — violable. You can point at the migration.
- "Keep the code clean" — not violable. It constrains nothing and makes the list feel
  productive while doing nothing.

Reject the vague ones rather than collecting them. A list of four real invariants beats
a list of ten where six are decoration, because the six teach everyone to skim.

Write each as a prohibition or a requirement, not as a preference. "Should" is a sign it
is a finding wearing an invariant's clothes.

### 3. Sort into durable and task-scoped

This is the most valuable step and the one most likely to be skipped.

- **Durable** — true beyond this task. These go in `AGENTS.md`, where they bind every
  future contributor and every agent. "Nothing throwaway gets committed" is durable.
- **Task-scoped** — true for this piece of work only. These go in the issue, or the PR
  description once one exists. "No schema before #9 settles the model" is task-scoped;
  it stops being meaningful the moment #9 lands.

### 4. Write them down

An invariant agreed in conversation and left there does not work. It has to be readable
at the moment someone is about to violate it, which is usually hours later and often by
someone else — or by an agent that never saw the conversation at all.

So this step is not optional and not a summary: edit `AGENTS.md`, or edit the issue. If
neither is appropriate, the invariant probably was not one.

### 5. Hand off

State the invariants at the top of whatever comes next — a design review, an
implementation prompt, a ticket. Anything that survives that review and turns out to be
load-bearing can be promoted back into the durable list; that promotion is how `AGENTS.md`
earns its weight over time instead of only accumulating incident reports.

If you have a grilling skill to hand — `grill-brief` for whether a thing should exist,
`grill-spec` for how — it is the natural next step. Neither is checked into this
repository, so do not assume they are available.

## What this does not catch

Invariants stop bad decisions from being made. They do not stop good decisions from
being over-served once a premise shifts underneath them — that is a behaviour rule, not
a constraint on the work, and it belongs in `AGENTS.md` as standing guidance:

> When a premise is removed, revisit the requirement that rested on it rather than
> building machinery to keep satisfying it.

The tell for that failure is work that defends an earlier decision instead of delivering
value — a third state added to a check, then a fourth, then a workaround for the type
system. That accumulation is visible in a diff without understanding the domain, and it
is the signal to stop and ask rather than continue.
