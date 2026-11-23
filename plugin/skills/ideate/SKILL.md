---
name: ideate
description: "Phase 1 — read data/ in full, then settle objective, audience and topics in discussion with the user, growing notes.md. Produces a vision, never slides."
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs")
---

# /deck:ideate

Make sure the `deck:pipeline` knowledge skill is loaded.

This phase is a **discussion around `data/`**, not a one-shot write. It ends
with a vision recorded in `notes.md`; slides come into existence only when
`/deck:plan` runs.

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

## Read everything first

Read every input in `data/` **in full** before proposing anything. If `data/`
is empty, ask what material exists and where it should land.

## Discuss, then settle

Read `${CLAUDE_PLUGIN_ROOT}/reference/presentation-craft.md` once per
session — its narrative section (throughline, contrast, sticky takeaway) is
the quality bar for what this phase settles, and it opens by saying when
those rules apply: a sectioned report is a legitimate shape, not a deck
missing its story.

Work through these with the user, in whatever order the conversation takes:

- **Objective** — is there a defined outcome, or just topics to cover? Both
  are valid; record which it is.
- **Audience** — who, and what did they already have? Prior coverage decides
  what needs no reintroduction.
- **The one takeaway** — what should still be in their heads a week later.
- **Topics, grounded** — propose a topic only when a cited signal from
  `data/` backs it, and say which. Where a claim wants support the data does
  not hold, flag the gap explicitly: the evidence inventory is a first-class
  output.

Mine the material beyond the obvious answers: complaints become topics, tips
people already use become showcases (and candidate peer-presenters), negative
signals become explicit deferrals.

## Write notes.md as you go

`notes.md` is the brainstorm and working memory — allowed to be long and
messy. Keep in it:

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

Changing direction mid-project is normal. Update `notes.md`, then assess the
delta against the existing `presentation.md`:

- **Additive** (a new chapter or topic) — fold it into the notes and flag it
  as safe to plan in.
- **Directional** (the goal or narrative shifts) — warn the user and name
  exactly which slides are affected. Reconciling the deck is `/deck:plan`'s
  job; leave `presentation.md` untouched.
