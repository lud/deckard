# Deckard — presentation-builder framework design

A reusable process, packaged as a **Claude plugin with embedded scripts** named
**Deckard** (manifest `name: deck`, so commands surface as `/deck:<skill>`),
for producing a presentation from source data to a self-contained Marp deck.
The process is distilled from a **prior project** — a real training deck built
end-to-end with Claude Code, whose work sessions were analyzed retrospectively.
The user keeps that project's materials privately (original scripts, media
sources, brand styles) and **supplies them on request**; anything supplied is
snapshot-copied into this repo, never referenced externally. Commands are
written short throughout (`/ideate`, `/build`); they are namespaced in
practice (`/deck:ideate`, `/deck:build`).

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
just runs `scripts/init.mjs` via a dynamic-context bang command
(`${CLAUDE_PLUGIN_ROOT}` is substituted in skill bodies, including inside bang
commands — verified against docs 2026-07-24), which creates `data/`, the two
skeleton docs, and `deckard.json`, and never overwrites an existing file. No model judgment in the scaffold path; other skills nudge the
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
worry dissolves — and it matches how the prior project actually evolved
(several messy notes docs feeding one clean plan doc). It is not the
drift trap of §5.1, which is about two *live rendered* copies edited at once.

The session-log analysis that produced this framework (`utils/transcript.py`:
session `.jsonl` files → readable markdown) is a **retrospective/meta task,
not a pipeline phase** — a fresh presentation project has no prior sessions.
It ships as a standalone utility, out of the plugin's main flow.

---

## 2. The source document

**One markdown file is the single source of truth**, produced by `/plan` from
the notes (§1). Everything downstream is generated from it; nothing downstream is
hand-edited (see §4). Default name `presentation.md`.

### 2.1 Heading hierarchy (fixed)

```
# <Slideshow title>                 ← H1, once: the document + deck title
## Overview / Audience / Narrative  ← H2 meta sections (any number, any names)
## Followups                        ← H2 meta section (checkbox list)
## Slides                           ← H2, exactly one, fixed name "Slides"
### <Slide 1 title>                 ← H3, one per slide
#### deck: <Section>            ← H4 `deck:`-prefixed sections (§2.2)
### <Slide 2 title>
...
```

The fixed `## Slides` heading is the parser's anchor: everything before it is
metadata/narrative for humans and agents; every H3 under it is a slide to emit.
This keeps the meta sections (audience, narrative arc, followups, parking lot)
in the same file without the transform mistaking them for slides. Heading
detection is line-based but must **skip fenced-code interiors** — a
`#`-prefixed line inside a fence is not a heading (typical case: a shell
snippet whose comment lines start with `#`).

### 2.2 Per-slide body

The slide body is **everything under the `### title`** (after the metadata
comment, §2.3) up to the first `#### deck:`-prefixed heading — there is no
"Content" label. Machine-relevant sections follow as H4 headings carrying the
**`deck:` prefix**, which is what lets the transform cut without reserving
plain H4s:

```
### Skills — share yours
<!-- media: pending -->

Anything here is the slide body: prose, bullets, fenced code —
![and produced media](output/skills.gif)

#### deck: Media
- what to show while unproduced: a capture directive, "live screen-share",
  "none" — once produced, the asset tag moves up into the body

#### deck: Notes
- only what will be said out loud → the slide's presenter notes (§4)

#### deck: Knowledge
- optional: research trail, verbatim doc quotes, citations as owner/repo#NNNNN
```

Section names match case-insensitively; an unknown `deck:` section is a lint
finding (§5.1); a plain H4 without the prefix is ordinary content. **Ordering
rule:** body content lives strictly *before* the first `#### deck:` heading —
once sections start, everything up to the next slide belongs to the current
section, so a plain H4 appearing inside a `deck:` section is unreachable as a
content heading and is a lint finding (move it above the sections).

That heading and everything under it, up to the next `deck:` section, are held
**out of the generated deck** — the finding names the line, and the content is
not folded into the enclosing section. Otherwise a stray H4 under
`deck: Notes` would ride into the presenter notes as debris on top of the error
already reported; one clear finding beats a finding plus polluted output.
The §5.1 rule is about never losing content *silently*, which the line-numbered
finding satisfies.

**Heading budget.** The transform promotes the slide title H3 → H1, and
in-slide content headings shift with it: H4 → H2, H5 → H3, H6 → H4. Markdown
stops at H6, so content can't nest deeper than a rendered H4 — fine for
PowerPoint-like content. The plan skill documents these format limitations to
the authoring agent (build plan M7).

### 2.3 Per-slide metadata — HTML comment, `key: value` lines

Each slide needs machine-readable metadata the transform reads — at minimum a
media-resolution state (§5.2: `media: done | pending | handoff | none`; key
absent = not yet classified), and optionally layout hints (`bg-right`, `lead`),
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

Beyond pipeline keys (`media:`) and the named layout hints, a repeatable
**`marp:` passthrough key** carries a raw Marp directive verbatim (e.g.
`marp: transition: fade` — the parser splits on the *first* colon; the value
is emitted as a `_`-prefixed spot directive per §4). It is the escape hatch
that keeps rare layout needs from ever forcing a hand edit downstream.

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
   rationalized** — not invented. Name the arc (one prior deck's arc, as an
   example: setup/payoff — show a tool early as "a magic trick", reveal its
   guts late; one throughline). Place
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
`media:` state (§5.2). The skill: **report the backlog first** — five buckets
from the `media:` state (missing = key absent / pending / handoff / none /
done; the first two are actionable by the agent, `handoff` waits on the human;
the bookkeeping is the core value), states read via the transform's `--status`
JSON mode (§5.5) — then work through items until told to stop. Arguments scope it: no args = status + proceed,
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

**Deckard locates a Marp CLI; it never downloads one.** The build looks for
`marpCommand` from `deckard.json`, then `marp` on `PATH`, then the project's
`node_modules/.bin/marp`. Reaching for `npx @marp-team/marp-cli@<version>`
instead would fetch and execute ~160 third-party packages behind a permission
grant that reads as "run one script", with npm's own confirmation suppressed by
`-y` — the supply-chain objection §8 raised against shipping binaries, arriving
through a side door, and only the top-level version pinned at that. It also
breaks offline and in CI.

When nothing is found, the build stops and **asks the user to install it**,
naming both a global and a project-local command and where to record a path
(`marpCommand`). The wording tells the agent not to install software on its own
unless the user has already endorsed that in the session — an agent silently
installing 160 packages is exactly the surprise this avoids.

The version Deckard is **verified against** is 4.5.0 (it rendered the prior
project's full deck, confirmed 2026-07-24). A different version is a note in
the report, not a refusal: Marp is stable across releases, and declining to
render over a version string would be stricter than the risk warrants.

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
- The transform maps: the **body** (everything between the metadata comment
  and the first `#### deck:` heading) → slide content, headings promoted two
  levels (title H3 → H1, content H4 → H2 … H6 → H4, §2.2); **`deck: Media`**
  → dropped from output (it holds pre-media intent; produced assets live in
  the body); **`deck: Notes`** → a **presenter-note HTML comment** in the
  generated slides.md (any comment Marp doesn't recognize as a directive is
  collected as that slide's note, surfaced in presenter view and PPTX export);
  **`deck: Knowledge`** → dropped (or optionally emitted as `> If asked`
  blockquotes); per-slide **metadata** → Marp layout directives. Use the **`_`-prefixed spot
  form** (`<!-- _class: lead -->`, `<!-- _paginate: false -->`) for per-slide
  scope — plain local directives *inherit forward* to all following slides,
  which is a footgun when set per slide. Keep the presenter-note comment and the
  directive comment **separate** so a note is never parsed as a directive, and
  never emit an unnamespaced custom key that collides with a Marp directive name
  (§2.3 caveat).
- **`speaker-notes.md` is gone entirely.** Notes live once, in the source doc,
  and ride into the deck as presenter notes. No second copy, no drift.
- Fonts embed at the **theme layer** (`embed-fonts.mjs` rewrites the theme's
  `url()` references as base64 data URIs; Marp inlines the theme verbatim), so
  the published deck is self-contained with no publish-script changes.
  Substituting the references a kit author already wrote — rather than
  synthesising `@font-face` rules from filenames — leaves family names, weights
  and `unicode-range` under the kit's control and invents no naming convention.
  The composed theme is written to the build directory, so a build never
  mutates the kit it read.
- **Build and publish write to different files.** The render lands in
  `<outDir>/slides.html`, git-ignored and keeping relative asset paths; publish
  writes the configured `publish` name at the project root, self-contained.
  Errors from `--lint` stop a build before rendering, since a deck holding what
  the format cannot express renders into output nobody should trust.

**Direct Marp authoring — evaluated, rejected (2026-07-24).** The alternative
(meta sections in an `info.md`, the agent authoring `slides.md` directly as
the Marp file, no translation) was seriously weighed against the prior
project's recorded experience. It loses on three observed grounds — none of
which is drift; collapsing to one artifact would fix drift just as well as
generating from one source:

1. **The speaker-notes dilemma.** In the prior project, notes-as-HTML-comments
   were offered and rejected as source clutter; a separate
   speaker-notes file then caused the drift regret. Both positions available
   in a hand-authored Marp file are bad; the authored-subsection →
   emitted-comment translation is the only third option.
2. **Pre-media intent.** Before media exists, a slide carries prose describing
   *what to show* — it needs a visible-but-unrendered home that raw Marp
   doesn't have.
3. **State leakage.** Marp collects every unrecognized comment as a presenter
   note, so per-slide pipeline state (`media: done`) in a raw Marp file leaks
   into presenter view and PPTX export. The escapes are worse: a strip filter
   is itself a transform (so "no transform" collapses — the comparison is
   translation-transform vs strip-transform, and the parser is needed either
   way for lint/status; only the cheap emitter differs), and title-keyed
   external state reintroduces the §5.2 fragility a literal-minded executor
   trips over (§7).

The strongest pro-direct argument — layout iteration landing one indirection
from the artifact — is neutralized by bg-image syntax passing through
verbatim in the slide body plus the `marp:` passthrough key (§2.3). If this
is ever revisited, the fallback design is namespaced comments + strip filter,
never title-keyed external state.

---

## 5. Fixes to bake in (each was paid for in rework)

### 5.1 One source, everything else generated
Covered by §2 + §4. The rule: humans and agents edit only `presentation.md`;
`slides.md`, `slides.html`, and the embedded HTML are all build outputs.

And humans *will* edit `presentation.md` by hand — that's the point of an
authoring format — so the format is a contract with people, not just tooling:
the transform must **never silently drop content it doesn't recognize**
(unknown subsection labels, stray content between anchors → lint findings
with line numbers, never quiet loss), and `--lint` is the safety net that
keeps hand edits honest. The generated `slides.md` opens with a do-not-edit
banner as a **YAML comment inside the frontmatter** — an HTML comment there
would be collected as slide 1's presenter note.

### 5.2 Media "done" is explicit metadata, not "has an image tag"
The worst dead end in the prior project: a fresh session re-flagged an already-resolved
slide (it had a code block, not an image tag) and started recording a redundant
tape typing that same content — the user aborted it. Resolution state must be an
explicit per-slide metadata field (§2.3: `media: done | pending | handoff |
none`, key absent = unclassified), robust enough that even a cheap model won't
reopen a closed slide (§7). `handoff` is likewise explicit — never *inferred*
from the presence of a capture directive in the Media section — for the same
literal-executor reason.

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
implementation; the same parser also backs a `--status` mode emitting
per-slide `{title, mediaState, assets}` JSON for `/media` — one parser, two
consumers): confirm every asset path referenced in the source resolves on
disk, and flag
orphaned media referenced nowhere (cutting a slide once left dead gifs + a stale
tape registration).

Findings carry a **severity**, and only errors fail the run. `orphaned-asset` is
a **warning**: producing media leaves alternates behind — a GIF and a still of
the same moment, three takes of one capture — and only the author knows which
still matter, so failing a build over them would teach people to stop running
the linter. Everything else is an error, because it names something the format
cannot express. Severity is a per-code policy in one set, so moving a finding
between the two is a one-line change.

Also flag **state/section incoherence**: a `deck: Media`
section on a `media: done | none` slide is stale intent; `media: pending |
handoff` with *no* `deck: Media` section is a missing directive; and the
§2.2 ordering rule (plain H4 inside a `deck:` section = unreachable content
heading).

### 5.6 Auto-discover captures
The prior project's regeneration script used a manually-maintained tape list —
"a tape left out is never regenerated." The regeneration script should glob
the blueprints dir instead.

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
resolved?") reward a strong model. A prior-project session run on a small
model showed that it executes a flawed instruction **literally** — it
reopened a closed slide and started redundant work a stronger model had
avoided. So: mechanical sub-steps
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
JSDoc types, enforced by `tsc --noEmit` as `just typecheck` — dev-only, so the
annotations are a checked contract rather than editor decoration). Baseline **Node ≥ 22** — stable `node --test`
and `fs.globSync` with zero deps; the scripts' shared entry helper guards
`process.version` with a clear error. Rationale: the §2 format is deliberately
line-parseable, so no markdown-parser dependency exists to install; Marp CLI
already makes Node a hard requirement of the pipeline; the Stop hook runs
every turn and needs instant startup (rules out the Elixir VM's boot time and
Python's interpreter/env roulette); and shipping compiled binaries (Rust/Go/
Zig) in a plugin is an arch×OS matrix plus a supply-chain trust problem —
unauditable executables have no place in an open-sourceable tool.

The rule governs **what ships**: the runtime scripts a user's session executes.
The test suite is free to take dev-only dependencies (a `package.json` with
`devDependencies`, git-ignored `node_modules`, committed lockfile) — none of it
reaches a plugin install, so neither the hook's startup cost nor the
no-install-step promise is affected. Where a real parser exists for a format
*we author*, tests use it rather than re-implementing one; the line-based
parsing of §2 is a property of the source format under test, not a house style
for the tests that exercise it.

The repo separates **what ships** from **what develops it**: the plugin is the
`plugin/` subtree and nothing else. Dev-only material — `package.json` and its
git-ignored `node_modules`, `test/`, the `justfile`, `CLAUDE.md`, and these two
design docs — sits at the repo root, outside the shipped payload. This also
keeps `CLAUDE.md` at the root where a developer expects it: at a plugin root
the validator warns it "is not loaded as project context", advice aimed at
context a plugin ships to *users*, which this file is not.

```
deckard/                       # own repo: ~/src/deckard — the dev root
  CLAUDE.md  justfile          # development rules; `just check` = local CI
  package.json  test/          # test-only deps (§ zero-dep rule below)
  framework.md  build-plan.md
  utils/
    transcript.py              # standalone retrospective tool (session .jsonl → md)
 plugin/                       # ↓ everything below here is what ships
  .claude-plugin/plugin.json   # name: deck → prefix /deck:* ; displayName: Deckard
  skills/
    pipeline/SKILL.md          # shared background; every phase skill loads it first
    init/SKILL.md              # bang-command → scripts/init.mjs; deterministic scaffold
    ideate/SKILL.md            # discuss data/ → notes.md; re-run assesses delta (§3 P1)
    plan/SKILL.md              # notes.md + data/ → presentation.md; re-run reconciles
    media/SKILL.md             # state-driven loop (§3 P3); fixes 5.2–5.4
    media/capture-vhs.md       # fix 5.4, VHS lore — loaded on demand from the skill
    build/SKILL.md             # explicit build+publish: lint, render, report
  hooks/hooks.json             # Stop event, async: true → scripts/autobuild.mjs
  scripts/                     # all zero-dep Node, no install step
    lib/entry.mjs              # Node ≥ 22 guard + isEntryPoint (CLI or import)
    lib/config.mjs             # deckard.json + defaults, for every script
    lib/deck-parse.mjs         # THE §2 parser — line-based, fence-aware
    lib/deck-emit.mjs          # parse tree → Marp (§4)
    lib/deck-lint.mjs          # fix 5.5, over the same parse tree
    init.mjs                   # idempotent: data/, skeleton docs, deckard.json
    plan-to-slides.mjs         # presentation.md → .build/slides.md (§4); --lint = fix 5.5; --status = media-state JSON for /media
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
```

The phase skills carry `disable-model-invocation: true` (the phases are
deliberate user-triggered gates), and skills pre-authorize their tooling with
`allowed-tools` so builds don't prompt — `${CLAUDE_PLUGIN_ROOT}` expands there
as it does in the body, so the grant names the exact command
(`Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs")`) rather than all of
`node`. A **bang command runs while the skill's context is assembled**, ahead
of the model's first move: measured 2026-07-26, `/deck:init` scaffolded a
project even under a grant deliberately set to match nothing. So the grant
earns its place for the scripts a *model* runs (`/deck:build`), and for the
policy fallback below.

### Bang commands — the syntax that fires
Documented at code.claude.com/docs/en/skills § "Inject dynamic context"
(`slash-commands` redirects there; custom commands merged into skills).
The `` !`<command>` `` form is **preprocessing**: each command runs before the
model sees anything, its stdout replaces the placeholder, and the result is
scanned once — inserted output never expands further. Multi-line commands go
in a fence opened with ` ```! `.

Measured against CLI 2.1.220, since the rest of the matrix is undocumented:
the scan is **plain text, not markdown-aware**. `` !`cmd` `` fires at a line
start, after any whitespace, inside a list item, indented four spaces, and
*inside a fenced code block* — plain or `bash`-tagged. Backticks are required
(`!cmd` alone does nothing), and the one reliable inline escape is the
documented rule: a non-whitespace character immediately before the `!`, as in
`` KEY=!`cmd` ``. So a **SKILL.md body cannot carry a fenced example of this
syntax** — it would run it. Examples belong in a linked reference doc, which
is loaded by the Read tool at runtime and is never preprocessed (verified).

Consequences the skills are written around:
- **Deterministic phases** — `/init`'s scaffold cannot be skipped, deferred, or
  reasoned away by the model, which is the §7 guardrail in its strongest form.
- **Effects land before the model speaks**, so a bang command must be safe to
  run unconditionally: idempotent, never destructive.
- **Its stdout costs context**, so scripts print terse reports.
- **Policy fallback** — `disableSkillShellExecution` (settable for plugin
  skills) replaces each command with
  `[shell command execution disabled by policy]`. Skills that rely on a bang
  command name that placeholder and tell the model to run the script with
  Bash instead, which is where `allowed-tools` does real work.
Local development: `claude --plugin-dir ~/src/deckard/plugin` (from whichever
project is being used to test — the flag takes the *shipped subtree*, verified
to load from a subdirectory) + `/reload-plugins`; `claude plugin validate
plugin --strict` in CI, wired as `just validate`.

### The shared background skill
A session can begin at any phase — often `/plan` directly, sometimes `/build` on
an inherited project — so every phase skill opens with one line:

> Make sure the `deck:pipeline` knowledge skill is loaded.

`skills/pipeline/SKILL.md` holds what every phase needs and no phase should
restate: the four phases and their artifacts, the §2 source format with its
heading budget, the transform's three modes (including what `--status` buckets
are for and why state is read from JSON rather than inferred from prose), the
five media states with the "closed stays closed" and "handoff is explicit"
rules, and the config and brand-kit contracts.

Unlike the phase skills it is **model-invocable** — it carries no
`disable-model-invocation`, because shared knowledge is something the model
should be able to reach for, while the phases stay deliberate user-triggered
gates. So the pointer is a one-line request the model satisfies with the Skill
tool (verified 2026-07-26: a fresh `/deck:init` session's only tool call was
`Skill(deck:pipeline)`), and the skill loads once per session rather than per
phase invocation. It earns its keep on its own too: `/deck:pipeline` explains
the tool to whoever inherits a deck, and the model can load it when a deck
question comes up outside any phase command.

Naming the skill rather than a file path is what keeps this cheap to maintain:
the pointer carries no description of the contents to drift out of date — the
skill's own `description` says when it applies. A test asserts every phase
skill carries the line, so a new skill cannot quietly skip it.

### Project config — `deckard.json`
Created by `/init` at the project root. Holds the brand-kit reference, the
source filename if overridden from `presentation.md`, the preferred capture
tool, and output paths. It doubles as the **marker file**: plugin hooks fire
in every project where the plugin is enabled, so `autobuild.mjs` exits
immediately when the project has no `deckard.json`.

Schema (finalized at M2) — flat until something forces nesting, every field
optional with a default, since the file's mere presence is already the marker:

```jsonc
{
  "brandKit": "path/to/kit",     // default: the plugin's brand-kits/default
  "source": "presentation.md",   // default
  "captureTool": "vhs",          // default; informational, for /media
  "outDir": ".build",            // default
  "publish": "slides.html",      // default output name
  "marpCommand": null            // path to a Marp CLI when it is not on PATH
}
```

`/init` writes the two keys a project actually sets — `brandKit` and `source` —
and leaves the rest to their defaults, so a project inherits later default
changes instead of freezing today's values in every scaffold.

`brandKit` resolves by shape: a bare name (`"default"`) selects a kit bundled
with the plugin; anything containing a path separator or starting with `.`
resolves as a path relative to the project root. That keeps the common case
short and a private kit (§8, WTTJ) explicit.

### Autobuild hook
A `Stop` hook (fires once per turn, when the agent hands the prompt back — not
per message). It no-ops without `deckard.json`, hashes `presentation.md` + the
active theme against the last build, and re-renders only on change — quiet turns
cost nothing.

**Two things about hooks that had to be measured** (2026-07-26; the docs and the
design's own assumption were both wrong):

- **The entry shape.** A `Stop` array of hook objects — the flat form — is
  accepted, validates, and **silently never fires**. What runs is the nested
  group: `"Stop": [{ "hooks": [{ type, command, … }] }]`. Nothing reports the
  difference, so the only symptom is a hook that does nothing.
- **`async: true` does not survive a headless session.** When `claude -p`
  finishes a turn it exits, and the backgrounded hook is killed — even a script
  that only writes a file, because Node's startup loses the race a shell builtin
  wins. So the design's original `async: true` is replaced by **`async: false`**,
  which the measurements make cheap: a turn that touched nothing costs **~30 ms**,
  and a full re-render costs **~0.5 s** — paid only on turns that changed the
  deck, which is exactly when the render is wanted. Blocking briefly and
  reliably beats never blocking and sometimes not running.

`${CLAUDE_PLUGIN_ROOT}` does expand inside a hook command (also measured). `/build` remains the explicit path: full lint + publish + a
human-readable report; the hook only does the fast incremental render.

The hook speaks in single lines. When it **rebuilds**, it says so — one short
line naming the output and slide count — because a silent successful build is
indistinguishable from a hook that never ran, and a mechanism nobody can see
working is a mechanism nobody trusts. When a **turn changed nothing**, it prints
nothing, so quiet turns stay quiet. When the deck has **errors**, it names the
count and points at `--lint`, rather than letting a deck break and stay broken
until someone runs `/build`.

Warnings stay out of the automatic path: `orphaned-asset` fires legitimately on
every turn while media is being produced, and output that nags every turn is
output people learn to skip. `/build` is where the full picture, warnings
included, gets reported — and because the hook keeps the render current, `/build`
is the deliberate publish-and-verify step rather than part of the authoring loop.

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

Deckard bundles a neutral `brand-kits/default/`; the WTTJ kit (the user's
company brand — Welcome to the Jungle; the user supplies its theme CSS and
fonts) lives in a **private** directory/repo pointed at from config — which
is what lets the tool itself be open-sourced. A kit directory is **fully
self-contained**: fonts are *copied* into it, never referenced across repos
(same rule and reason as the test fixture). No WTTJ-branded material — theme,
fonts, logos — may land in the open-source repo.

**Theme verification habit to encode:** never declare a theme done from source
inspection — export representative slide types (cover/lead, bg-image, bullet,
code/table) to PNG, Read them, and grep the *compiled* HTML to confirm the
cascade won where Marp's default theme could conflict. The kitchen-sink
fixture (build plan M3) supplies exactly one slide per class for this.

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

Resolved 2026-07-25 (Q&A while importing the docs into the deckard repo):
- **`media:` enum gains `handoff`** ✔ — `done | pending | handoff | none`,
  key absent = unclassified; explicit, never inferred (§2.3, §5.2, §7).
- **Transform `--status` mode** ✔ — per-slide media-state JSON for `/media`;
  one parser, two consumers (§5.5).
- **`deckard.json` starting shape** ✔ — flat, all fields optional with
  defaults (§8); schema finalized at M2.
- **Marp CLI pinned** ✔ — concrete version chosen at M4 (§3 Phase 4).
  *Superseded 2026-07-26 on how it is obtained: located, not fetched — see
  below.*
- **Node ≥ 22 baseline** ✔ — `node --test` + `fs.globSync`, guarded entry
  helper (§8).
- **Prior-project materials** ✔ — the user supplies originals on request
  (build/publish/font-embed scripts, a media skill, VHS tapes, WTTJ styles);
  anything supplied is snapshot-copied in and scrubbed of WTTJ branding.
- **Brand kits fully self-contained** ✔ — fonts copied in, never referenced
  across repos (§8).
- **Direct Marp authoring rejected** ✔ — the single-source design was
  challenged and re-argued against the prior project's recorded experience;
  `presentation.md` + transform stands, on the notes dilemma / pre-media
  intent / state-leakage grounds (§4), explicitly *not* on drift. Added the
  `marp:` passthrough key (§2.3) and the hand-edit robustness principle
  (§5.1).
- **Per-slide body format v2** ✔ — bold subsection labels replaced by
  `deck:`-prefixed H4 sections (`Media` / `Notes` / `Knowledge`); the body is
  label-free (everything before the first `#### deck:`), produced assets live
  in the body, and content headings H4–H6 are freed for real use (promoted
  two levels with the title, §2.2).
- **Golden fixture is purpose-built** ✔ — a hand-authored kitchen-sink deck
  in `test/fixtures/`, deliberately covering the format's edge-case matrix
  plus one slide per brand-kit slide class (it doubles as the theme-preview
  deck, §8). Migrating the prior project's real deck was considered and
  dropped — a real deck can't cover the edge-case matrix a test fixture
  should.

Resolved 2026-07-26 (while landing M3):
- **Ships plain `.mjs`; TypeScript weighed and deferred** ✔ — the `plugin/`
  boundary makes a build step *contained*, which is not the same as free: the
  shipped subtree is what users audit, and a compile step adds a stale-artifact
  question to a dev loop already built on `--plugin-dir` + `/reload-plugins`
  (worst under the M5 Stop hook, which would run stale code silently). The
  defects M3 actually produced were semantic — content routed to the wrong
  bucket, a missing blank line, a miscounted bucket, a column shift breaking a
  regex — and fixtures caught all of them where types would have caught none.
  What was missing was *enforcement* of the JSDoc already written, so
  `just typecheck` now runs `tsc --noEmit` over `plugin/scripts/` and `test/`
  (§8). Node's type-stripping retires this trade-off on its own once the
  plugin's Node floor clears the experimental stage. Should the move happen
  first, `ts-blank-space` is the tool that preserves auditability — it erases
  annotations into spaces, so comments, indentation, lines and columns all
  hold and a diff against the source shows only erasures (it is also the
  strategy Node's own stripping uses, so semantics match the no-build future).
  `tsc` keeps JSDoc but renormalizes formatting; esbuild and Bun drop comments
  entirely, which costs the reader the prose explaining *why*. Whichever runs,
  run it in CI and assert a clean working tree, so a stale `plugin/` cannot
  ship or be served to `--plugin-dir`.

Resolved 2026-07-26 (while landing M4):
- **Marp is located, never fetched** ✔ — supersedes running the renderer through
  `npx` (§3 Phase 4). Resolution order is `marpCommand` → `PATH` →
  `node_modules/.bin/marp`. `npx -y` would fetch and execute ~160 packages
  (131 MB measured) behind a grant that reads as "run one script", with npm's
  confirmation suppressed, and would fail offline — the §8 supply-chain
  objection arriving through a side door. The `marpVersion` config key is
  replaced by `marpCommand`; 4.5.0 becomes the version Deckard is *verified
  against* rather than one it installs, and a mismatch is a note in the report,
  not a refusal.
- **Installing tooling is the user's decision** ✔ — the missing-renderer message
  asks for an install and tells the agent not to run one unilaterally unless the
  user has already endorsed that in the session. An agent that silently installs
  160 packages is the surprise worth designing out.

Resolved 2026-07-26 (while landing M3):
- **A shared background skill** ✔ — `skills/pipeline/SKILL.md`, loaded first by
  every phase skill, since a session may start at any phase (§8). It is where
  `--status`, its buckets, and the `handoff` state are explained, so no phase
  skill restates them and none of them are left to inference. **Model-invocable**
  (the only skill that is), and pointed at by name rather than by path, so the
  one-line pointer has nothing in it to keep in sync.

Resolved 2026-07-26 (while landing M1):
- **The plugin is a `plugin/` subtree, not the repo root** ✔ — ships exactly
  what's under it; dev environment (deps, tests, justfile, `CLAUDE.md`, these
  docs) stays at the root (§8). `--plugin-dir` loads a subdirectory fine
  (verified). No build step for now: `.mjs` goes straight into `plugin/`, and
  the boundary is what makes a later compile step (TypeScript into `plugin/`)
  a contained change rather than a restructure.
- **Test-only dependencies are allowed** ✔ — the zero-dependency rule governs
  the shipped runtime scripts, not the test suite (§8). First one: `yaml` v2
  for SKILL.md frontmatter, so descriptions can contain colons without the
  tests pretending to be a YAML parser.

Still open: nothing blocking. Next step: scaffold §8 and write
`plan-to-slides.mjs`, validated against the purpose-built kitchen-sink
fixture (build plan M3).
