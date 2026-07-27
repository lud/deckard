---
name: pipeline
description: "How Deckard works: the four phases, the source format, the transform and its modes, and the media states. Load this when working on a Deckard presentation project, when another /deck: skill asks for it, or when asked how the deck tooling fits together."
---

# How Deckard works

Shared background for every `/deck:` command. Read once per session; the other
skills point here so each one can stay about its own phase.

Deckard turns source material into a self-contained Marp deck. It builds
presentations about anything — treat the deck's subject as the user's business.

## The four phases

| # | Command | Input | Output |
|---|---------|-------|--------|
| 0 | `/deck:init` | — | `data/`, `notes.md`, `presentation.md`, `deckard.json` |
| 1 | `/deck:ideate` | `data/` + discussion | **`notes.md`** — the brainstorm |
| 2 | `/deck:plan` | `notes.md` + `data/` | **`presentation.md`** — decisions + slides |
| 3 | `/deck:media` | `presentation.md` | media files + capture directives |
| 4 | `/deck:build` | `presentation.md` + brand kit | `slides.html` at the root |
| 5 | `/deck:publish` | the render | `slides-embedded.html` — self-contained, shareable |

They run roughly in order and loop back freely. Phases 1 and 2 are separated on
purpose: ideate settles *what the talk is*, and slides come into existence only
when plan runs, which is what keeps a deck from becoming a pile of slides with
no throughline.

## Two documents, split by kind

- **`notes.md`** — the brainstorm and working memory: raw material, evidence,
  reasoning, rejected ideas, open questions. Allowed to be long and messy.
- **`presentation.md`** — the clean decided artifact: goal, audience and
  narrative in meta sections, then the slides. **The source of truth.**

They hold different *kinds* of content, so each settled decision has exactly
one home. Everything the deck renders comes from `presentation.md`.

## The source format

```markdown
# Deck title                     ← H1, once
## Overview / Audience / …       ← H2 meta sections, for humans and agents
## Slides                        ← H2, the parser's anchor, exactly one
### Slide title                  ← H3, one per slide
<!--
media: pending                   ← per-slide metadata, key: value
layout: lead
-->
Body: prose, bullets, fenced code, image tags.
#### Content heading             ← plain H4 is slide content
#### deck: Media                 ← machine-relevant sections
#### deck: Notes
#### deck: Knowledge
```

Rules worth holding in mind while authoring:

- The **body** is everything from the metadata comment to the first
  `#### deck:` heading. Body content belongs strictly above the sections.
- **Heading budget:** the title's H3 becomes H1, so content headings shift with
  it — H4 → H2, H5 → H3, H6 → H4. Author within that range.
- `deck:` section names match case-insensitively. **Media** says what to show
  while it is unproduced; **Notes** holds spoken words, which become presenter
  notes; **Knowledge** keeps the research trail.
- Images use **inline markdown syntax** — `![bg right:40% fit](path)` passes
  through to Marp verbatim, which is how layout needs are met.
- Metadata keys: `media`, `media-type`, `layout`, and a repeatable `marp:` that
  carries any raw Marp directive (`marp: transition: fade`).
- **Slide titles may repeat.** A *companion slide* gives media its own room:
  the info slide keeps its content with `media: none`, and one or more
  neighbouring slides with the same title carry the media in their body. A
  companion's title may extend the shared title with a caption naming what
  it shows: `### <title> – <caption>`. Each companion is its own slide to
  the parser, lint and `--status`.

Humans hand-edit this file, so the transform reports anything it cannot express
rather than dropping it. Run `--lint` after editing.

## Generated files

```
presentation.md ──transform──▶ .build/slides.md ──marp──▶ slides.html ──publish──▶ slides-embedded.html
```

`presentation.md` is the only file anyone edits. `.build/slides.md` exists
for debugging; `slides.html` at the project root is the fast render — asset
references stay file references, so overwriting a media file and refreshing
the browser shows the new take; `slides-embedded.html` is the self-contained
file for sharing. All three are git-ignored build outputs. Presenter notes
live once, in the source, and ride into the deck.

## The transform and its three modes

`node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-to-slides.mjs"` — run it from the
project root, or pass `--project <dir>`.

| Mode | Purpose |
|------|---------|
| *(default)* | writes `.build/slides.md` |
| `--lint` | checks the deck; **errors exit 1**, warnings exit 0 |
| `--status` | per-slide media state as JSON |

**`--lint`** reports each finding with a line number and a severity. Errors name
something the format cannot express — a missing asset, malformed metadata, an
unknown section, a heading that can never reach a slide. Warnings report on the
surroundings: `orphaned-asset` means a file exists that no slide references,
which is normal while producing media (alternates, extra takes) and is the
author's call, so it never fails a build.

**`--status`** is how `/deck:media` learns each slide's state, in place of
working it out from the prose. It emits every slide's `mediaState`, whether it
has a `deck: Media` section, and its assets — plus `buckets`, the slide titles
grouped by state, so the backlog report quotes counts it did not have to
derive. Read state from here rather than by rereading the source: a session
that inferred state from the text once concluded a resolved slide still needed
media and started re-recording it.

## Who runs what

The phase commands are **user-invoked gates**, which is why you cannot invoke
them: `/deck:init`, `/deck:ideate`, `/deck:plan`, `/deck:media`,
`/deck:build`, `/deck:publish`. Asked to build a deck, point the user at
`/deck:build`; asked to publish or produce the shareable file, point them at
`/deck:publish` — the phases are theirs to trigger, and the autobuild hook
already keeps the local render current, so nothing is going stale while they
decide.

The transform's **read-only modes are yours** to run whenever they help:
`--lint` after editing a deck, `--status` to read media state.

When an automatic rebuild fails, the user gets one line from the hook at the
end of the turn, and **you** get the detail with the next user prompt: a hook
injects additional context carrying a fresh lint report, a brand-kit or
renderer problem, or the recorded build failure. It is re-checked at the
moment of injection, so treat it as the deck's current state and address it
as part of your turn. It arrives once per breakage — if you need the picture
again later, run `--lint` yourself.

## Media states

`media:` in a slide's metadata. A missing key means "not classified yet".

| State | Meaning | Who resolves it |
|-------|---------|-----------------|
| *(absent)* | not yet classified | the agent, by classifying it |
| `pending` | needs producing, and a script can | the agent |
| `handoff` | needs producing, and only a person can | the user |
| `none` | this slide wants no asset | closed |
| `done` | the asset exists and sits in the body | closed |

Two rules make this reliable rather than advisory:

- **`done` and `none` are closed.** A closed slide stays closed; the state is
  the authority, not the presence or absence of an image tag.
- **`handoff` is set explicitly, never inferred.** A capture directive inside
  `deck: Media` may be addressed to the *user*, so its presence alone never
  means "record this."

When media can only come from a person — a real screenshot, a photograph, a
live demo — write a precise capture directive into `deck: Media` and mark the
slide `handoff`. Describe what to capture and why the slide needs it. Every
media need ends as a produced asset or a precise directive.

## Choosing how to produce media

1. **Inline text or code** — when the content *is* text (JSON, a config, a
   directory tree), a fenced code block beats a screenshot. Check this first.
2. **Produced asset** — a recording, export or diagram made by tooling. The
   tool is the project's business (`captureTool` in the config records the
   preference); Deckard ships none, and assets are produced outside the
   plugin — never automatically, and never re-recorded without the user
   deciding to.
3. **Manual handoff** — anything only a person can capture.

## Project config — `deckard.json`

Flat, every field optional, and its presence marks the directory as a Deckard
project. `brandKit` (bare name = a kit bundled with the plugin, path-like =
relative to the project), `source` (default `presentation.md`), `outDir`
(`.build`), `publish` (`slides.html`), `captureTool`, and `marpCommand` — a
path to a Marp CLI for when it is not on `PATH`.

Deckard **locates** a Marp CLI rather than downloading one. If a build reports
that none was found, relay its message: installing software is the user's
decision, so ask them rather than installing it yourself, unless they have
already endorsed installing tooling in this session. Once it exists, its path
belongs in `marpCommand` so later builds and the autobuild hook find it too.

A **brand kit** is a directory: `theme.css` (what the build uses), optional
`fonts/`, and an optional `kit.md` of agent-facing styling directives — read
`kit.md` when making styling decisions.

## Craft guidance

`${CLAUDE_PLUGIN_ROOT}/reference/presentation-craft.md` distills the
presentation canon — Mayer's multimedia-learning principles,
assertion-evidence structure, Duarte, Phillips, Tufte and others — into
attributed rules, grouped by decision moment (narrative / slides / media).
The phase skills read it at their decision points; reach for it yourself
whenever slide quality is being discussed.

## Working conventions

- **Iterate in a file, not in chat.** Every phase has one living document;
  corrections are targeted edits to it.
- **State facts plainly**, and verify claims that reach a slide against a live
  run rather than from memory or docs.
- **Report what changed** after each edit.
