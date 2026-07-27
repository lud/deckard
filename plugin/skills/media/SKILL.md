---
name: media
description: "Phase 3 — decide what each slide shows: report the media backlog, discuss illustrations with the user, and record each decision as an asset or a precise directive."
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-to-slides.mjs":*)
---

# /deck:media

Make sure the `deck:pipeline` knowledge skill is loaded.

Ideate and plan settled what each slide *says*; this phase decides what it
*shows*. It is a conversation with the user around the deck, not a production
line: propose, discuss, decide, record.

## Start from state, never from prose

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-to-slides.mjs" --status` and
report the backlog from its buckets: unclassified (no `media:` key), then
`pending`, `handoff`, `none`, `done`. Read state only from this JSON —
`done` and `none` are **closed**, and a closed slide stays closed whatever
its body looks like.

Arguments scope the pass: no arguments = report, then work through the open
slides with the user; `status` = report only; a slide title = just that
slide.

## Deciding what a slide shows — with the user, out loud

Decisions here are made in conversation, never silently. The user knows
things the deck does not: assets that already exist, what they plan to demo
live, what the audience has already seen. For each open slide:

1. Say in one line what the slide argues, and **propose** how to show it —
   a concrete suggestion with a recommendation and a placement (inline or
   companion slide). "Nothing" is a valid proposal.
2. **Let the user decide.** Only then record the state and the asset tag or
   directive.

Work one or two slides at a time so each proposal gets a real answer; never
classify the whole backlog in one silent pass, however obvious the answers
seem.

The proposal logic, in this order:

1. **Code block first.** When the content is literally text — JSON, a
   config, a directory tree, terminal output the audience should read — a
   fenced code block in the body beats any image. Set `media: none` (or
   `done` if the block *is* the payoff and nothing else is wanted).
2. **Only a person can capture it** — a real screenshot, a photograph, a
   live demo, anything whose authenticity matters. Write a precise capture
   directive into `deck: Media` (what to capture, framing, what the slide
   needs it to prove) and set `media: handoff`. Handoff is always set
   explicitly — never inferred from the directive's presence.
3. **Tooling can produce it** — a diagram, a scripted recording, an export.
   Set `media: pending` and record the intent in `deck: Media`. Producing
   the asset is the user's tooling, not this skill: if the user has a
   rendering skill or tool, defer to it; if not, `pending` waits. Never
   fabricate a "realistic" stand-in, and never re-run a capture on your own
   initiative — re-recording costs time and, for Claude-demo captures,
   tokens on every take.

Once an asset exists, its image tag moves into the slide body and the slide
becomes `media: done`.

## Placement: inline, or a companion slide

Big images and text do not share a slide well — Marp does not auto-shrink,
and layouts fight large media. Two placements:

- **Inline** — small or wide media alongside the content: an image tag in
  the body, `![bg right:40% fit](...)` and similar Marp syntax passing
  through verbatim.
- **Companion slide** — when the media deserves the space: the info slide
  keeps its content and takes `media: none`; add a neighbouring slide whose
  body is the media, with its own `media:` state. It repeats the info
  slide's title, optionally extended with a short capitalized **caption** naming what it
  shows — `### <same title> – <caption>`, e.g. `### Skills – Recorded
  demo` — so the deck reads as one topic across slides while each
  companion says what it displays. More than one companion is fine.
  `--status` lists each companion as its own slide.

Suggest the companion move whenever an image would crowd a slide; splitting
beats shrinking.

## Keep the record honest

- Every decision ends in the file: a state in the metadata comment, plus
  either an asset tag in the body or a precise directive in `deck: Media` —
  never a vague "get a screenshot" TODO.
- Run `--lint` after editing; it checks state/section coherence (a
  `deck: Media` section on a closed slide is stale intent, `pending`/
  `handoff` without one is a missing directive).
- Orphaned-asset warnings are normal while media is in flux — mention them
  once, leave the files to the user.

## Stay relaxed

While this phase is active, keep pulling the conversation back to the media
backlog — but when the user drifts into other work (rewording a slide,
re-planning, asking unrelated questions), follow them. Lint after edits,
then return to the backlog when they do. This skill focuses the work; it
never fences it.
