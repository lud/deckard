---
name: ideate
description: "Phase 1 — take stock of data/, help the user create, fetch, find and refine the material for what they want to dig into, and settle objective, audience and topics in discussion, growing notes.md. Produces a vision, never slides."
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs")
---

# /deck:ideate

Make sure the `deck:pipeline` knowledge skill is loaded.

This phase is a **discussion that builds and mines `data/`**, not a one-shot
write. The user says what they want to dig into; you take stock of the
material, help them gather and shape more of it, and settle the talk with
them. It ends with a vision recorded in `notes.md`; slides come into
existence only when `/deck:plan` runs.

## The project layout

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"`

The scaffold has run and its report is above. It creates `data/`, `notes.md`,
`presentation.md` and `deckard.json` where they are missing and leaves every
existing file byte-identical. Tell the user in one line what it created; when
every path reads `skipped`, the project was already set up and there is
nothing to relay.

Should the report instead read `[shell command execution disabled by policy]`,
run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"` with Bash — the scaffold
is idempotent, so running it is safe either way.

## Take stock of data/

Start every run — the first and each later one — by listing `data/` and
reading every input **in full**. The user adds material between sessions, so
compare what is on disk with the Material section of `notes.md` and treat
anything unrecorded as new.

Then report the inventory before anything else: one line per file saying what
it holds and what it could support, new arrivals called out, and the angles
the material suggests. An empty `data/` is an ordinary starting point: say so
and move straight to the next step.

## Ask what to dig into

The user sets the direction. Ask what they want to dig into, and offer the
angles the inventory suggested as options to pick from, extend or discard.
A subject with no material behind it yet is a fine answer — gathering that
material is the next part of this phase.

## Build the material together

Ideation is as much about assembling `data/` as about reading it. Once a
direction exists, help the user get the material it needs:

- **Create** — the user often holds the knowledge in their head. Interview
  them and write what they say into a file in `data/`, in their words.
- **Fetch** — when they name a source (a URL, a repository, an export, the
  output of a command), retrieve it and save it into `data/`.
- **Find** — propose sources that would back a claim or fill a gap, search
  for them when the user wants that, and bring back candidates for them to
  accept or reject.
- **Refine** — clean, extract, tabulate or summarise a raw input into a
  derived file that is easier to cite, next to its original.

Sources vary by project, so reach them with whatever the session offers —
MCP servers, APIs, shell commands, web search and fetch. When the tool a
source needs is missing, say which one would do it and let the user set it
up or bring the material themselves.

Make suggestions freely: what would strengthen a topic, which gap matters
most, which input deserves a closer cut. The user decides what gets pursued.

Rules for everything you put in `data/`:

- **Add files; leave the user's own files as they are.** A refinement is a new
  file named after its original.
- **Record provenance at the top of each file you add** — where it came from,
  when, and how it was obtained or derived. Material written from the
  conversation is marked as the user's account.
- **Every figure and quote traces to a source.** When the data a claim needs
  cannot be found, record the gap; the user chooses whether to drop the claim
  or go get the evidence.
- **Keep the Material section of `notes.md` current** as files arrive, so the
  next run can tell what is new.

## Discuss, then settle

Read `${CLAUDE_PLUGIN_ROOT}/reference/presentation-craft.md` once per
session — its narrative section (throughline, contrast, sticky takeaway) is
the quality bar for what this phase settles, and it opens by saying when
those rules apply: a sectioned report is a legitimate shape, not a deck
missing its story.

Gathering and discussing interleave: a settled objective exposes missing
material, and new material reshapes the topics. Work through these with the
user, in whatever order the conversation takes:

- **Objective** — is there a defined outcome, or just topics to cover? Both
  are valid; record which it is.
- **Audience** — who, and what did they already have? Prior coverage decides
  what needs no reintroduction.
- **The one takeaway** — what should still be in their heads a week later.
- **Topics, grounded** — propose a topic only when a cited signal from
  `data/` backs it, and say which. Where a claim wants support the data does
  not hold, flag the gap explicitly and suggest how to fill it: the evidence
  inventory is a first-class output.

Mine the material beyond the obvious answers: complaints become topics, tips
people already use become showcases (and candidate peer-presenters), negative
signals become explicit deferrals.

## Write notes.md as you go

`notes.md` is the brainstorm and working memory — allowed to be long and
messy. Keep in it:

- **Material** — every file in `data/`: what it holds, where it came from,
  who added it.
- **Tentative decisions** — objective, audience + prior coverage, takeaway.
  These converge over the discussion; `/deck:plan` later distills the settled
  versions into `presentation.md`, their permanent home.
- **Candidate topics, tiered** — Strong / Good / Parking lot, each annotated
  with the `data/` evidence behind it, gaps flagged.
- **Exploration** — rejected ideas, decision rationale, open questions,
  out-of-scope items.

Iterate in the file with targeted edits and report what changed. **No slides
and no timed agenda** — jumping to an agenda here is how a past deck got
thrown away minutes after being written.

## Re-running after /deck:plan

Changing direction mid-project is normal, and so is coming back with new
material. Take stock as above, update `notes.md`, then assess the
delta against the existing `presentation.md`:

- **Additive** (a new chapter or topic) — fold it into the notes and flag it
  as safe to plan in.
- **Directional** (the goal or narrative shifts) — warn the user and name
  exactly which slides are affected. Reconciling the deck is `/deck:plan`'s
  job; leave `presentation.md` untouched.
