---
name: plan
description: "Phase 2 — distill notes.md into presentation.md: crystallize the narrative first, then author the full slide set, then iterate one slide at a time."
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-to-slides.mjs":*), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs")
---

# /deck:plan

Make sure the `deck:pipeline` knowledge skill is loaded.

This phase consumes `notes.md` + `data/` and produces `presentation.md`, the
source of truth. It needs a vision to work from: when `notes.md` is thin or
missing, push back to `/deck:ideate` and say what is missing — an objective,
an audience, grounded topics. Slides invented without that global view are
the failure this gate exists to stop.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"`

The scaffold report above covers sessions that start here with notes already
written: any missing project file now exists, and every existing one is
byte-identical. Mention it only if something was created. Should it read
`[shell command execution disabled by policy]`, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"` with Bash.

Read `${CLAUDE_PLUGIN_ROOT}/reference/presentation-craft.md` before
authoring — its narrative and slide sections are the quality bar for both
steps, and each rule carries the source and evidence to cite when proposing
a change to the user.

This phase is a conversation too, with the balance shifted from ideate's:
you hold the bird's-eye view of `notes.md` and `data/` at once, which the
user does not — so **lead with concrete proposals rather than open
questions**, and let discussion refine them. A proposal is the start of the
exchange, not a decision already taken.

## Step 1 — crystallize the narrative

Before any slide exists:

- **Inherit the ordering from the user, then rationalize it** — the
  narrative is theirs; your job is to name it, tighten it, and make the arc
  explicit (setup/payoff, one throughline, whatever the material calls
  for). For a sectioned deck — quarterly results, a multi-project review —
  the arc may be no more than a deliberate ordering with the headline
  first; that is a shape, not a gap.
- Place late-arriving content by matching the **strongest existing thread**,
  never by appending.
- Distill the settled decisions from `notes.md` — goal, audience, takeaway,
  narrative — into the meta H2 sections of `presentation.md`. One
  authoritative home; the notes keep the reasoning, the plan keeps the
  results. Title and intro slides stay lean.

Present the proposed narrative — the arc, the ordering and its rationale,
what got left out and why — and refine it with the user **before** any
slide is authored. Slides written on an arc the user has not seen are the
bulk rewrite waiting to happen.

## Step 2 — author the slides

- Expand generously: one topic can become several slides.
- Write the **whole slide set in one pass** first — the draft is itself a
  proposal — then walk it with the user top to bottom and iterate **one
  slide at a time** with targeted edits, reporting what each edit changed.
  After the first draft, bulk rewrites are off the table.
- Run `--lint` after writing and after each editing round.

## What the format lets you write

Author within the source contract (details in the pipeline skill):

- One H3 per slide under `## Slides`; the H3 becomes the rendered H1.
- **Heading budget:** content headings H4–H6 render as H2–H4. Nothing
  deeper exists.
- Per-slide metadata in the leading HTML comment. Leave `media:` unset —
  classifying media is `/deck:media`'s phase; set it only where the decision
  is already made in the notes.
- `deck: Media` / `deck: Notes` / `deck: Knowledge` sections after the body;
  spoken words go in Notes, research trail in Knowledge.
- Images by inline markdown syntax only; `marp:` metadata keys pass raw
  directives through.
- **Companion slides** for media that deserves its own room: same title,
  optionally extended with a caption (`### <title> – <caption>`). Sketch one
  where an image will obviously crowd its slide, and leave the media
  decision itself to `/deck:media`.

## Re-running after a direction change

Reconcile, never regenerate: keep untouched slides as they are, revise or
insert the affected ones, and report the diff to the user slide by slide.
