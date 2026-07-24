# Deckard — presentation-builder framework design

A reusable process, packaged as a **Claude plugin with embedded scripts** named
**Deckard** (manifest `name: deck`, so commands surface as `/deck:<skill>`),
for producing a presentation the way this repo's Claude Code training #2 was
built: from source data to a self-contained Marp deck. Derived from a full read
of the past sessions in `process/past-sessions/`. Commands are written short
throughout (`/ideate`, `/build`); they are namespaced in practice
(`/deck:ideate`, `/deck:build`).

This document is the design, not the implementation. It defines the **phases**,
the **source-document format**, the cross-cutting **conventions**, the **fixes**
the past work paid for in rework, and the **plugin shape**.

Scope note: the plugin builds presentations. It is **not** Claude-Code-specific
— many decks will be about Claude Code, but the tools must not assume that, nor
assume a particular media type (VHS is one option among several, see §2.4).

---

## 1. The pipeline

Four phases, each a distinct unit of work with its own artifact. They run
roughly in order but loop back freely.

| # | Phase | Input | Output | Invocation |
|---|-------|-------|--------|------------|
| 1 | **Ideate** | `data/` (any inputs) + discussion with the user | **`notes.md`** — the brainstorm: material, exploration, tentative decisions, gaps | `/ideate` |
| 2 | **Plan** | `notes.md` + `data/` | **`presentation.md`** — clean decisions + slides (§2) | `/plan` |
| 3 | **Produce media** | `presentation.md` | media files + directives | `/media` |
| 4 | **Build & publish** | `presentation.md` + brand kit | self-contained HTML | `/build` (+ automatic Stop hook, §8) |

Phase 0 is **`/init`** — a deterministic, idempotent scaffold: the skill body
just runs `scripts/init.mjs` via a dynamic-context bang command, which creates
`data/`, the two skeleton docs, and `deckard.json`, and never overwrites an
existing file. No model judgment in the scaffold path; other skills nudge the
user to run it if the layout is missing.

**The deliberate gate:** `/ideate` produces a *vision*, not slides — slides come
into existence only when `/plan` runs. This is by design, to stop the common
failure of jumping straight into writing slides without a global view of the
talk. `/plan` won't invent a vision from nothing; if the notes are thin it pushes
back to ideate.

### Project layout

```
data/               # user-provided inputs, freeform (csv, xlsx, json, md, notes,
                    #   todos, survey dumps…). The tool reads it, never writes it.
notes.md            # /ideate's brainstorm & working memory — material, exploration,
                    #   rejected ideas, gaps, decision rationale. Allowed to be big
                    #   and messy; the messy half by design.
presentation.md     # /plan's clean, decided artifact: distilled goal/audience/
                    #   narrative (meta sections) + slides. THE source of truth (§2).
deckard.json        # project config (brand-kit ref, overrides) + the marker
                    #   the plugin's hooks key on (§8). Created by /init.
.build/slides.md    # generated Marp file, git-ignored, never hand-edited (§4).
slides.html         # build output; publish → self-contained HTML.
blueprints/ output/ assets/   # media sources + produced media (§2.4, §5).
```

**The two docs are split by _kind_, not by phase** — `notes.md` is the messy
brainstorm, `presentation.md` is the clean decided artifact. They hold different
*kinds* of content, so there is **no duplication**: the settled goal/audience/
narrative have exactly one authoritative home (`presentation.md`), while
`notes.md` holds the *reasoning and raw material* behind them, not a maintained
copy of the final statements. This is why the earlier "vision doc" duplication
worry dissolves — and it matches the real project's lineage (`ideas.md` /
`training-2-draft.md` messy notes → clean `session-plan.md`). It is not the
drift trap of §5.1, which is about two *live rendered* copies edited at once.

The one-off session-log analysis that produced this framework (`transcript.py` →
`process/past-sessions/`) is a **retrospective/meta task, not a pipeline phase**
— a fresh presentation project has no prior sessions. It stays a standalone
utility, out of the plugin's main flow.

---

## 2. The source document

**One markdown file is the single source of truth**, produced by `/plan` from
the notes (§1). Everything downstream is generated from it; nothing downstream is
hand-edited (see §4). Default name `presentation.md` (this repo's
`session-plan.md` is the prior instance of it).

### 2.1 Heading hierarchy (fixed)

```
# <Slideshow title>                 ← H1, once: the document + deck title
## Overview / Audience / Narrative  ← H2 meta sections (any number, any names)
## Followups                        ← H2 meta section (checkbox list)
## Slides                           ← H2, exactly one, fixed name "Slides"
### <Slide 1 title>                 ← H3, one per slide
### <Slide 2 title>
...
```

The fixed `## Slides` heading is the parser's anchor: everything before it is
metadata/narrative for humans and agents; every H3 under it is a slide to emit.
This keeps the meta sections (audience, narrative arc, followups, parking lot)
in the same file without the transform mistaking them for slides.

### 2.2 Per-slide body

Under each `### slide`, keep the proven subsection labels (bold, not headings —
so we don't spend H4/H5 on them):

```
### Skills — share yours

**Content**
- bullets that become the slide body

**Media**
- what to show; once produced, an ![alt](path) tag OR an inline code block OR
  an explicit "live screen-share / none"

**Speaker notes**
- only what will be said out loud → become presenter notes in the deck (§4)

**Knowledge** (optional)
- research trail, verbatim doc quotes, citations as owner/repo#NNNNN
```

### 2.3 Per-slide metadata — HTML comment, `key: value` lines

Each slide needs machine-readable metadata the transform reads — at minimum a
media-resolution state (§5.2), and optionally layout hints (`bg-right`, `lead`),
a media-type hint, etc. Requirements: **markdown-native, human-editable,
agent-editable, and parseable by a simple script** (no full CommonMark parser).

**Decision (confirmed by research):** an **HTML comment with `key: value` lines**
at the top of each slide.

```
### Skills — share yours
<!--
media: done
media-type: screenshot
layout: bg-right
-->
```

Why this over the alternatives (Pandoc header attributes `### Title {key=val}`,
kramdown IALs `{: key="val"}`, MyST field lists, Djot brace attributes):

- **Trivial, dependency-free parsing** — locate `<!-- ... -->`, split each line
  on the first `:`. No AST, none of the brace/quote/`no-space-around-=` edge
  cases the bracket-attribute syntaxes require. (For values containing colons,
  follow MultiMarkdown's rule: indent continuation lines.)
- **Best human/LLM ergonomics** — `key: value` is the most over-represented
  micro-pattern in both technical writing and LLM training data (YAML,
  frontmatter, headers, config), so humans and agents both get it right by
  pattern-matching alone.
- **Invisible when rendered** — like any HTML comment, it vanishes in a plain
  markdown preview, so the source still reads cleanly as a document (unlike
  attributes cluttering the heading line).
- **Consistent mental model end to end** — Marp's *own* per-slide config is also
  `key: value` inside HTML comments, so "comment blocks hold metadata; the
  transform turns some into Marp directives, some into presenter-note comments,
  and keeps pipeline-only keys like `media: done` to itself" is one idea, not
  three. There is prior art for the exact shape (zeke/html-frontmatter,
  MultiMarkdown metadata).

**Collision caveat for the generated `slides.md` (not the source).** Marp treats
*every* HTML comment as either a directive or a presenter note. So when the
transform emits comments into `slides.md`, a custom key that happens to match a
Marp directive name (`class`, `paginate`, `header`, `footer`, `color`,
`backgroundColor`, `theme`, `style`, `lang`, `headingDivider`, or their
`_`-prefixed forms) would be silently swallowed as a directive. Rule for the
generator: keep pipeline-only metadata out of the emitted Marp comments
entirely, or namespace custom keys (`x-media:`). In the **source** doc there is
no risk at all — Marp never sees it.

### 2.4 Media type is not enforced

The Media section describes *what to show*; the plugin classifies how to produce
it but **mandates no specific tool**. Buckets:

- **Reproducible capture** — scriptable terminal/CLI/TUI recording. VHS is the
  documented default for this (with all the hard-won VHS knowledge in §5.4), but
  the framework treats it as pluggable; another project might use a screen
  recorder, asciinema, Playwright screenshots, etc.
- **Inline text or code** — when the content is literally text (JSON, a config,
  a directory tree), keep it as a fenced code block in the slide; no asset.
- **Manual / hand-off** — real screenshots, live demos, annotated images: never
  fabricated; the plugin emits a precise capture directive instead (§5.7).

---

## 3. Phase detail & the prompts that worked

### Phase 1 — Ideate
A **discussion around `data/`**, not a one-shot write. Read every input in
`data/` in full first, then talk it through with the user to settle: is there a
defined objective/outcome, or just topics to cover? Who's the audience and what
did they already have? What's the one takeaway? Which available data backs each
topic, and where is data *missing* to support a claim? Propose nothing until
each candidate is grounded in a cited signal from the data. Mine everything, not
just the obvious "what do you want" answers: complaints → topics, tips people
already use → showcase + peer-presenter format, negative signals → explicitly
defer.

Output: **`notes.md`**, the brainstorm and working memory — deliberately the
messy half (§2 layout). It holds:
- **Tentative decisions** — objective (or "no fixed goal, these topics"),
  audience + prior coverage, key takeaway. These converge over the discussion;
  `/plan` distills the settled versions into `presentation.md` (their permanent,
  authoritative home — `notes.md` does not keep a maintained copy).
- **Candidate topics, tiered** — Strong / Good / Parking-lot — each annotated with
  which `data/` evidence backs it, and flagged where the evidence is **missing**
  (a data/evidence inventory is a first-class output).
- **Exploration, rejected ideas, decision rationale, open questions**, out-of-scope.

Deliberately **no slides and no timed agenda** in this phase (a past session
jumped to a full agenda and threw it away 7 minutes later).

**Re-running `/ideate` after `/plan`** (to change direction) is supported and
must be safe: `/ideate` updates `notes.md` and **assesses the delta against the
existing `presentation.md`** —
- *Additive* (a new chapter/topic) → fold into the notes, flag as safe.
- *Directional shift* (goal or narrative changes) → **warn** the user and name
  exactly which slides are affected; do **not** silently rewrite the deck.
Actual slide reconciliation is `/plan`'s job (below).

Kickoff template:
> The `data/` folder has what I've got for a `<topic>` talk to `<audience>`, who
> already had `<prior coverage>`. Read it, then let's figure out the objective
> and the topics worth covering — don't write slides yet.

### Phase 2 — Plan (narrative, then slides)
Consumes `notes.md` + `data/`, produces `presentation.md`. Two steps, in order —
the first is what keeps the talk coherent:

1. **Crystallize the narrative.** Ordering is **inherited from the user, then
   rationalized** — not invented. Name the arc (in #2: setup/payoff — show a tool
   early as "a magic trick", reveal its guts late; one throughline). Place
   late-arriving content by matching the **strongest existing thread**, not by
   appending. Distill the settled decisions from `notes.md` into
   `presentation.md`'s meta H2 sections; title/intro slides stay lean.
2. **Author the slides.** Expand generously (one topic can become several
   slides), write the **whole slide set in one pass**, then iterate **one slide
   at a time** with targeted edits — never bulk-rewrite after the first draft.
   The user reviews top-to-bottom; report what each edit changed.

From here on `presentation.md` is the source of truth; `notes.md` continues as
the working record. **Re-running `/plan`** after a direction change **reconciles**
rather than regenerates: keep untouched slides, revise/insert the affected ones,
and report the diff to the user.

### Phase 3 — Produce media (`/media`)
State-driven, not session-bounded. The old "one unit of work per fresh session"
rule was a token-economy workaround; the durable fix was always the explicit
`media:` state (§5.2). The skill: **report the backlog first** (missing /
pending / handed-off — the bookkeeping is the core value), then work through
items until told to stop. Arguments scope it: no args = status + proceed,
`status` = report only, a slide title = just that one. A deck of cheap diagrams
resolves in a single session; for heavy capture work the user resets the
session when they see fit. Classification per §2.4, improvements in §5.2–§5.4.

### Phase 4 — Build & publish
Generate the deck and inline everything (§4). Layout conventions the user
converged on: tall screenshots as `bg right/left:N% fit` asides; wide terminal
gifs as capped inline images; when a slide is too dense, **duplicate it (keep the
title)** rather than shrink text (Marp doesn't auto-shrink). Keep **build vs.
publish** distinct: build = fast local render; publish = self-contained
shareable HTML. Never re-run a document converter (pandoc, single-file-cli) over
already-rendered Marp output — it re-parses and mangles Marp's player; use
literal asset-path → data-URI substitution.

---

## 4. Generation & the hidden intermediary

The user never edits the Marp file. The pipeline is:

```
presentation.md  ──/build script──▶  .build/slides.md  ──marp──▶  slides.html
(source of truth,     (transform)     (generated, gitignored)      (+ publish → embedded HTML)
 all metadata)
```

- `slides.md` is a **generated, git-ignored intermediary** in a local build dir
  (e.g. `.build/`). It exists on disk for debugging but is not authored or
  committed. This structurally **eliminates the drift** that plagued the past
  work (a hand-derived `slides.md` diverging from the plan).
- The transform maps: **Content** → slide body; **Media** image tags / code
  blocks → kept; **Speaker notes** → a **presenter-note HTML comment** in the
  generated slides.md (any comment Marp doesn't recognize as a directive is
  collected as that slide's note, surfaced in presenter view and PPTX export);
  **Knowledge** → dropped (or optionally emitted as `> If asked` blockquotes);
  per-slide **metadata** → Marp layout directives. Use the **`_`-prefixed spot
  form** (`<!-- _class: lead -->`, `<!-- _paginate: false -->`) for per-slide
  scope — plain local directives *inherit forward* to all following slides,
  which is a footgun when set per slide. Keep the presenter-note comment and the
  directive comment **separate** so a note is never parsed as a directive, and
  never emit an unnamespaced custom key that collides with a Marp directive name
  (§2.3 caveat).
- **`speaker-notes.md` is gone entirely.** Notes live once, in the source doc,
  and ride into the deck as presenter notes. No second copy, no drift.
- Fonts embed at the **theme layer** (`embed-fonts.sh` bakes base64 `@font-face`
  into the theme CSS between markers; Marp inlines the theme verbatim), so the
  published deck is self-contained with no publish-script changes.

---

## 5. Fixes to bake in (each was paid for in rework)

### 5.1 One source, everything else generated
Covered by §2 + §4. The rule: humans and agents edit only `presentation.md`;
`slides.md`, `slides.html`, and the embedded HTML are all build outputs.

### 5.2 Media "done" is explicit metadata, not "has an image tag"
The worst dead end in the corpus: a fresh session re-flagged an already-resolved
slide (it had a code block, not an image tag) and started recording a redundant
tape typing that same content — the user aborted it. Resolution state must be an
explicit per-slide metadata field (§2.3, e.g. `media: done | pending | none`),
robust enough that even a cheap model won't reopen a closed slide (§7).

### 5.3 Three-way media classification
VHS-reproducible / inline-text-or-code / manual-handoff (§2.4). For a technical
audience, prefer a code block over a screenshot whenever content is literally
text — check this *before* defaulting to a manual capture.

### 5.4 Capture knowledge the skill carries pre-loaded (VHS reference)
Documented in a `reference/` doc, not enforced. These cost multiple re-records:
- Wait on the prompt with `Wait@60s /^> ?$/`, never a fixed `Sleep`, for any
  latency-dependent step.
- VHS matches `>` in its text grid though it *renders* `❯`; `+Screen` can match
  the still-visible command line (use default `+Line`); a `Wait` timeout aborts
  the **whole** recording; VHS runs its own bash, not your shell.
- Any tape launching an interactive `claude` needs
  `--settings '{"disableAllHooks": true}'` (keeps a custom statusline out of
  frame; `statusLine: null` is rejected).
- Never render/overwrite committed media **from inside a Claude session** — it
  injects a "transcript saving is off" banner + usage warnings. Validate syntax;
  hand regeneration to a clean shell.
- Sandbox setup in `Hide` blocks + throwaway `/tmp` fixtures; build the capture
  to **prove the slide's specific claim**, not just run the happy path.
- Always Read the rendered output back to verify; flag imperfections rather than
  shipping silently.

### 5.5 Lint the deck
Implemented as the transform's `--lint` mode (same parser, no second
implementation): confirm every asset path referenced in the source resolves on
disk, and flag
orphaned media referenced nowhere (cutting a slide once left dead gifs + a stale
tape registration).

### 5.6 Auto-discover captures
The old `generate.sh` used a manually-maintained `TAPES` array — "a tape left out
is never regenerated." The regeneration script should glob the blueprints dir
instead.

### 5.7 Empirical over docs; never fabricate
Docs were wrong repeatedly (statusline behavior, `settings.local.json`
auto-gitignore removed in v2.0.46, CLAUDE.md dir-scoping). For any
TUI/timing/permission/feature-availability claim headed for a slide: verify with
a live CLI or capture probe; treat a research subagent's answer as a hypothesis
to spot-check, especially when it contradicts the user's own working setup.
Never synthesize a "realistic" example when the point depends on authenticity —
ask for the real artifact or emit a capture directive.

### 5.8 Learnings become rules
When a debugging detour yields a durable operational fact, fold it into the
plugin's `reference/` (or the scaffolded project's CLAUDE.md) **with the
reasoning**, not just the conclusion.

---

## 6. Cross-cutting conventions

- **Iterate in a file, not in chat.** Every phase has one living markdown doc;
  corrections are targeted edits.
- **Batch-directive mode.** Honor the user's rapid-edit protocol: "the next
  messages are directives — apply them without commentary; when I say done, tell
  me what you noticed." Silent apply, one consolidated report at the end.
- **Always leave an artifact, never a blank page.** A media need becomes a
  produced draft or a precise directive — never a vague "get a screenshot" TODO.
- **State-driven media loop** (§3 Phase 3), resumable across sessions; when to
  reset a session is the user's call, not a rule.
- **State facts plainly.** Don't hedge ("we tested X") in an authoritative doc —
  it implies the unhedged claims are unverified. Keep verification as an optional
  "how to confirm it yourself" aside.

---

## 7. Model tiering

Judgment-heavy phases (ideate, narrative, media classification, "is this already
resolved?") reward a strong model. The Haiku session showed a cheap model
executes a flawed instruction **literally** — it reopened a closed slide and
started redundant work a stronger model had avoided. So: mechanical sub-steps
(running a capture, embedding a tag, base64 inlining) are safe on a cheap model,
but the guardrails — especially the explicit "done" state (§5.2) — must be robust
enough to survive a literal-minded executor rather than relying on model
judgment to catch the "this is already fine" case.

---

## 8. Plugin shape

Confirmed: a **plugin with embedded scripts**, not a loose skills directory.
Branded **Deckard**; the manifest `name` is what becomes the slash-command
prefix, and `displayName` carries the branding — so `name: deck`,
`displayName: "Deckard"` gives the short `/deck:<skill>` commands.

**Language: zero-dependency Node `.mjs`, no build step** (`// @ts-check` +
JSDoc for editor-level types). Rationale: the §2 format is deliberately
line-parseable, so no markdown-parser dependency exists to install; Marp CLI
already makes Node a hard requirement of the pipeline; the Stop hook runs
every turn and needs instant startup (rules out the Elixir VM's boot time and
Python's interpreter/env roulette); and shipping compiled binaries (Rust/Go/
Zig) in a plugin is an arch×OS matrix plus a supply-chain trust problem —
unauditable executables have no place in an open-sourceable tool.

```
deckard/                       # own repo: ~/src/deckard
  .claude-plugin/plugin.json   # name: deck → prefix /deck:* ; displayName: Deckard
  skills/
    init/SKILL.md              # bang-command → scripts/init.mjs; deterministic scaffold
    ideate/SKILL.md            # discuss data/ → notes.md; re-run assesses delta (§3 P1)
    plan/SKILL.md              # notes.md + data/ → presentation.md; re-run reconciles
    media/SKILL.md             # state-driven loop (§3 P3); fixes 5.2–5.4
    media/capture-vhs.md       # fix 5.4, VHS lore — loaded on demand from the skill
    build/SKILL.md             # explicit build+publish: lint, render, report
  hooks/hooks.json             # Stop event, async: true → scripts/autobuild.mjs
  scripts/                     # all zero-dep Node, no install step
    init.mjs                   # idempotent: data/, skeleton docs, deckard.json
    plan-to-slides.mjs         # presentation.md → .build/slides.md (§4); --lint = fix 5.5
    autobuild.mjs              # exits fast unless deckard.json present + source changed
    build.mjs  publish.mjs  embed-fonts.mjs
    regenerate-media.mjs       # auto-discovering capture runner (fix 5.6)
  templates/
    notes.skeleton.md          # /ideate's brainstorm outline (§3 Phase 1)
    presentation.skeleton.md   # the §2 hierarchy, ready to fill
    deckard.skeleton.json      # project config, filled by init
    common.tape                # default VHS look, for the VHS media path
  brand-kits/
    default/                   # neutral bundled kit (directory contract below)
  utils/
    transcript.py              # standalone retrospective tool (session .jsonl → md)
```

The phase skills carry `disable-model-invocation: true` (the phases are
deliberate user-triggered gates), and skills pre-authorize their tooling with
`allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*)` so builds don't prompt.
Local development: `claude --plugin-dir ~/src/deckard` (from whichever project
is being used to test) + `/reload-plugins`; `claude plugin validate` in CI.

### Project config — `deckard.json`
Created by `/init` at the project root. Holds the brand-kit reference, the
source filename if overridden from `presentation.md`, the preferred capture
tool, and output paths. It doubles as the **marker file**: plugin hooks fire
in every project where the plugin is enabled, so `autobuild.mjs` exits
immediately when the project has no `deckard.json`.

### Autobuild hook
A `Stop` hook (fires once per turn, when the agent hands the prompt back — not
per message) declared `async: true`, so it never blocks control returning to
the user. It no-ops without `deckard.json`, hashes `presentation.md` + theme
against the last build, and re-renders only on change — quiet turns cost
nothing. `/build` remains the explicit path: full lint + publish + a
human-readable report; the hook only does the fast incremental render.

### Brand kit — a directory contract, not a skill
Scripts can't consume a skill and a config file can't reference one, so a kit
is a **directory with a fixed contract**, referenced by path in `deckard.json`:

```
<kit>/
  theme.css        # required — the Marp theme the build consumes
  fonts/           # optional — embed-fonts.mjs bakes these into the theme
  kit.md           # optional — agent-facing directives
```

Both consumers are served: the **build scripts** use `theme.css` + `fonts/`
deterministically; the **agent** (the plan/build skills say so) reads `kit.md`
when making styling decisions, if it exists. `kit.md` carries what the old
brand-kit-skill idea would have: palette (core tokens with hex + usage +
"never use as" negatives; secondary Light/Solid/Dark triads with semantic
roles), typography (named weights → roles + letter-spacing/line-height/case +
fallback stack), logo (inline SVG + clear-space + placement), component
recipes (card/tag/etc. as CSS), and a DO/DON'T checklist lintable against the
compiled output.

Deckard bundles a neutral `brand-kits/default/`; the WTTJ kit lives in a
**private** directory/repo pointed at from config — which is what lets the
tool itself be open-sourced.

**Theme verification habit to encode:** never declare a theme done from source
inspection — export representative slide types (cover/lead, bg-image, bullet,
code/table) to PNG, Read them, and grep the *compiled* HTML to confirm the
cascade won where Marp's default theme could conflict.

---

## 9. Open decisions

Resolved from the last round: plugin (not loose skills) ✔ · retrospective is a
utility, not a phase ✔ · `speaker-notes.md` removed, notes inline via generation
✔ · `slides.md` is a generated, git-ignored intermediary the user never edits ✔ ·
brand kit always applied, with real fonts (delivery reshaped 2026-07-24: a
directory contract, not a skill — see below) ✔ · media type not enforced ✔ ·
heading hierarchy H1 / H2-meta / `## Slides` / H3-per-slide ✔.

Also resolved this round: **per-slide metadata syntax** — HTML-comment
`key: value` block, confirmed by research over the bracket-attribute
alternatives (§2.3) ✔. **Ideation I/O** — a `data/` folder of freeform inputs
feeds a discussion; the two docs are split by *kind*: `notes.md` (messy
brainstorm, `/ideate`) vs. `presentation.md` (clean decisions + slides, `/plan`),
so goal/audience live in one authoritative home with no maintained duplicate;
slides exist only after `/plan`; re-running `/ideate` assesses the delta and
`/plan` reconciles rather than regenerates ✔.

Resolved 2026-07-24:
- **Name: Deckard** ✔ — manifest `name: deck` (the command prefix →
  `/deck:init`), `displayName: "Deckard"` (the branding). Supersedes the
  showtime/prezbot shortlist.
- **Source doc stays `presentation.md`** ✔ — `deck.md` rejected: it reads as
  "just the slides", while the file also carries the meta/context sections;
  bonus: it sorts after `notes.md`, matching the process order in a file tree.
- **Explicit idempotent `/init`** ✔ — deterministic scaffold script, never
  overwrites; replaces the lazy-scaffold idea (§1 Phase 0).
- **Media loop de-session-ized** ✔ — state-driven, status-report-first,
  argument-scoped; session resets are the user's call (§3 P3).
- **Autobuild** ✔ — async `Stop` hook gated on `deckard.json` (§8); `/build`
  stays the explicit lint+publish path.
- **Project config: `deckard.json`** ✔ — config + hook marker (§8).
- **Brand kit: swappable directory contract** ✔ — `theme.css` + `fonts/` +
  optional `kit.md`; neutral default bundled, WTTJ kit private (§8).
- **Implementation language: zero-dependency Node `.mjs`, no build step** ✔
  (§8 rationale).
- **Lint folded into the transform** (`--lint` mode) ✔ (§5.5).

Still open: nothing blocking. Next step: scaffold §8 and write
`plan-to-slides.mjs`, validated against this repo's deck (convert
`session-plan.md` into the §2 format as the golden fixture).
