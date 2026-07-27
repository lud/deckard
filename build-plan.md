# Deckard — build plan

Implementation roadmap for the design in `framework.md`. Milestones are small
and strictly ordered by dependency; each one ends with something **working and
verified**, so any session can pick up at the first unchecked box. Update the
checkboxes as work lands.

**Where the code lives:** its own repo at `~/src/deckard` — this repo, which
also carries these two docs. Some milestones adapt material from a prior
project the user keeps privately: a prior media skill and VHS tapes (M6), the
WTTJ brand styles (M8). M4's build/publish/font-embed scripts were **written
fresh in JS** — the originals turned out to be Python, so nothing was
portable. **Ask the user** for an original when a milestone needs one; anything
supplied is snapshot-copied in — runtime, tests, and CI reference only this
repo. Scrub rule: no WTTJ-branded material (theme, fonts, logos) lands in
this open-source repo; brand material goes only into the private kit dir at
M8. Iterate by starting test sessions with `claude --plugin-dir ~/src/deckard/plugin`
in a scratch project, with `/reload-plugins` after edits.

**Testing baseline (all milestones):** Node **≥ 22** (stable `node --test`,
`fs.globSync`); `node --test` under `test/`; `claude plugin validate plugin
--strict` must pass whenever the manifest or a SKILL.md changes. `just check`
runs install + test + typecheck + validate.

`just typecheck` is `tsc --noEmit` over `plugin/scripts/` and `test/` — the
scripts' `// @ts-check` JSDoc is a checked contract, not editor decoration.
Dev-only: nothing is compiled and the plugin still ships hand-written `.mjs`
(framework.md §9 records why TypeScript itself was deferred).

The zero-dependency rule governs the **shipped** scripts (framework.md §8);
the test suite may take **dev-only** dependencies, since a user installing the
plugin never installs them. Currently one: **`yaml` v2** for SKILL.md
frontmatter — chosen over `gray-matter`, which pulls js-yaml v3 (YAML **1.1**,
unmaintained) and would disagree with the CLI about what valid frontmatter
means; `yaml` v2 is YAML 1.2 with zero transitive deps.

**Repo layout:** the plugin is the `plugin/` subtree; the repo root is the dev
environment (framework.md §8). Validation therefore targets `plugin`, not `.`.
This started as a `CLAUDE.md` problem — at a plugin root the validator warns it
"is not loaded as project context", which fails `--strict` — and the subtree
split fixes it at the source: the root is no longer a plugin, so `CLAUDE.md`
sits there normally and never ships.

**Division of labour with `claude plugin validate --strict`** (probed
empirically 2026-07-26 — do not assume): the CLI owns YAML validity (it caught
the unquoted-colon bug) and `description` presence. It passes **silently** on a
deleted skill directory, a `name` disagreeing with its directory, and a
misspelled key such as `disable-model-invokation` — a dead invocation gate. The
test suite owns exactly those gaps, and asserts every frontmatter key against a
known-keys allowlist so the next typo fails loudly.

---

## ⚠ Next up — bound the autobuild loop, before any further milestone

**Start here.** M5 ships a hook that speaks to the model, and the only thing
stopping it looping is that the fingerprint of an unchanged deck is stable.
That is a weaker guarantee than it looks.

The failure: `additionalContext` wakes the model, the model must produce output,
that output ends a turn, and the turn fires the hook again. Convergence rests
entirely on the fingerprint not changing between firings — and the fingerprint is
a hash of files on disk that **anything** can touch. Another plugin's hook, a
formatter, an editor writing on save, a `.build/` cleaner, or a filesystem quirk
is enough. Worse, the build itself writes into `.build/`, so any future coupling
between what it writes and what the hash covers closes the cycle directly. The
other session already saw one instance of the class: `last-build.hash` vanished
between turns with nothing in the plugin able to explain it, which alone makes
every later turn rebuild unconditionally.

Unattended, this is the expensive kind of bug — a user who steps away for an hour
comes back to a session that has been waking itself the whole time.

Two ways to resolve it, and the second is likely better on its own merits:

- **Find a genuinely safe loop breaker.** Candidates: read `stop_hook_active` from
  the payload (undocumented, so it needs verifying first) and never address the
  model on a turn a hook caused; or keep a per-session counter of consecutive
  hook-caused firings and go user-only past a small N; or address the model only
  when the previous firing did not. Each needs a real convergence argument, not a
  plausible one — the last two attempts at this were both wrong.
- **Stop reporting to the model from the hook at all** (recommended). The hook
  becomes user-only: `systemMessage`, nothing else, and the loop class disappears
  by construction rather than being bounded. The model then learns about breakage
  where it is actually actionable — the shared skill already tells it to run
  `--lint` after editing a deck, which is the moment it can fix what it just
  broke, without anything having to wake it. Cheaper, simpler, and it keeps the
  Stop hook doing what a turn-end notification is for.

**Done when:** a deliberately broken deck cannot cause more than one extra model
turn *under any sequence of file changes* — demonstrated, not argued — or the
model-facing channel is gone and the skills carry the `--lint` habit instead.

Note for the interim: the hook only runs in sessions started with
`--plugin-dir`, since Deckard is not installed as a plugin, so nothing runs
unattended by default.

---

## M1 — Skeleton + dev harness

Everything else needs a loadable plugin to iterate inside.

- [x] `.claude-plugin/plugin.json` — `name: "deck"`,
      `displayName: "Deckard"`, description, version `0.0.1` (plus `author`,
      which `claude plugin validate --strict` requires — M9's CI runs strict).
- [x] Stub `skills/{init,ideate,plan,media,build}/SKILL.md` — frontmatter only
      (`description`, `disable-model-invocation: true`), body "not implemented".
      Quote any description containing a colon — the frontmatter is real YAML
      and an unquoted `: ` drops *all* metadata silently (the CLI reports it).
- [x] `scripts/`, `templates/`, `brand-kits/default/`, `test/` directories.
- [x] `.gitignore` and a `node --test` smoke test that the manifest parses.

**Done when:** `claude plugin validate plugin` passes and a session started
with `--plugin-dir plugin` lists `/deck:init` … `/deck:build` — verify
empirically that the `deck` prefix renders as expected. The short `deck` prefix is the hard
requirement; individual skill names are flexible (`init` → `scaffold`, etc.)
if a collision or UX surprise appears.

**Landed 2026-07-26.** `just check` green (3 tests + strict validation);
`claude --plugin-dir <repo>/plugin -p "/deck:init"` in an empty scratch
project resolved the command and loaded the stub body, so the `deck` prefix,
skill discovery, and subdirectory loading are confirmed empirically.

## M2 — `/deck:init` (scaffold)

Small, independent, and exercises the skill→script wiring pattern every other
skill reuses.

- [x] `templates/notes.skeleton.md`, `templates/presentation.skeleton.md`
      (the §2 hierarchy), `templates/deckard.skeleton.json`. The skeleton
      slide is authored to lint clean under M3's rules — `media: pending`
      paired with a `deck: Media` section, per the §5.5 coherence check.
- [x] Finalize the `deckard.json` schema (flat, every field optional with
      defaults — `brandKit`, `source`, `captureTool`, `outDir`, `publish`,
      `marpVersion`; presence alone is the hook marker). Folded into
      framework.md §8: `/init` writes only `brandKit` + `source` so projects
      inherit later default changes, and `brandKit` resolves by shape (bare
      name = bundled kit, path-like = relative to the project root).
- [x] Shared script entry helper with a `process.version` guard (Node ≥ 22,
      clear error) — `scripts/lib/entry.mjs`, which also carries
      `isEntryPoint()` so scripts export their functions to tests and still
      run as a CLI.
- [x] `scripts/init.mjs` — idempotent: create `data/`, the two docs,
      `deckard.json`, `.gitignore` entry for `.build/`; **never overwrite**;
      print created-vs-skipped report. "Never overwrite" is the `wx` open
      flag, not a preceding existence check.
- [x] `skills/init/SKILL.md` — a dynamic-context bang command running
      `init.mjs`; the model only relays the report.
- [x] Tests: run twice against a temp dir — second run is a full no-op; a
      pre-existing file with content survives byte-identical.

**Done when:** `/deck:init` in an empty scratch project produces the layout,
and re-running it changes nothing.

**Landed 2026-07-26.** `just check` green (10 tests). Live in an empty scratch
project: `/deck:init` scaffolded the layout, and a second live run reported
five skips with every file hash unchanged. Two findings from the wiring, both
in framework.md §8: `${CLAUDE_PLUGIN_ROOT}` expands in `allowed-tools` as well
as in the body, so the grant can name the exact command; and a bang command
runs during context assembly regardless of that grant — a control run with a
deliberately non-matching `allowed-tools` still scaffolded.

## M3 — `plan-to-slides.mjs` (the transform + `--lint`)

The keystone. Line-based per §2 (no markdown parser), emitting Marp per §4.

- [x] Parser: `## Slides` anchor; one slide per H3; leading HTML-comment
      `key: value` metadata block; body = everything up to the first
      `#### deck:` heading; `deck:`-prefixed H4 sections (`Media` / `Notes` /
      `Knowledge`, case-insensitive; unknown names = lint finding; a plain
      H4 without the prefix is content).
- [x] Emitter: body → slide with headings promoted two levels (title
      H3 → H1, content H4 → H2 … H6 → H4); `deck: Media` dropped (produced
      assets live in the body); `deck: Notes` → a **separate**
      presenter-note comment; `deck: Knowledge` dropped; layout keys →
      `_`-prefixed Marp directives; repeatable `marp:` passthrough key →
      raw spot directive (§2.3); pipeline keys (`media:`) never emitted;
      no unnamespaced key that collides with a Marp directive name (§2.3);
      generated file opens with a do-not-edit **YAML comment inside the
      frontmatter** (an HTML comment there becomes slide 1's presenter
      note, §5.1).
- [x] `--lint`: every referenced asset resolves on disk; orphaned media in
      `output/`/`assets/` flagged; malformed metadata blocks reported with
      line numbers; unrecognized content (unknown `deck:` section names,
      stray content between anchors, plain H4 inside a `deck:` section —
      the §2.2 ordering rule) is a finding with a line number — the
      transform never silently drops it (§5.1, hand-edit robustness);
      state/section coherence per §5.5 (`deck: Media` present on a
      `done | none` slide = stale intent; `pending | handoff` with no
      `deck: Media` = missing directive).
- [x] Unit tests: metadata edge cases, directive scoping, note-vs-directive
      separation, slides with no media, meta sections ignored, heading
      promotion (H4–H6 → H2–H4; plain H4 is content, `deck:` H4 is a
      section, case-insensitive), `#`-prefixed lines inside fenced code not
      parsed as headings (§2.1).
- [x] **Golden fixture — purpose-built in this repo:** `test/fixtures/`
      holds a hand-authored **kitchen-sink deck** in §2 format — a
      `presentation.md`, the assets it references (stubs are fine; lint
      checks existence), and the expected `slides.md` — with a golden-file
      test: transform(fixture) ≡ committed expected output. Authored to
      *document the format by example*: it deliberately covers the edge-case
      matrix (every `deck:` section, every `media:` state, heading promotion
      H4–H6 → H2–H4, fenced code containing `#`-prefixed lines, `marp:`
      passthrough, layout keys, a slide with no media, meta sections above
      `## Slides`) and one slide per **slide class** the brand kits style
      (cover/lead, bg-image aside, bullets, code/table) — the same deck
      later serves M8's theme-verification exports and layout iteration.
- [x] Lint fixtures: small deliberately-broken decks asserting each `--lint`
      finding (missing asset, orphaned asset, malformed metadata, unknown
      `deck:` section, unreachable plain H4, state/section incoherence).

**Done when:** the golden test passes, the kitchen-sink fixture lints clean,
and each lint fixture produces exactly its expected finding.

**Landed 2026-07-26.** `just check` green (46 tests). Twelve lint fixtures,
each producing exactly one distinct code; the nine-slide kitchen sink lints
clean and round-trips to a reviewed golden file. Deviations folded into
framework.md:

- **Findings carry a severity, and only errors fail** — `orphaned-asset` is a
  warning, since producing media leaves alternates behind and only the author
  knows which still matter (§5.5). Severity is one per-code set, so moving a
  finding between the two is a one-line change.
- **The parser, emitter and linter are three modules under `scripts/lib/`**
  rather than one file, with `plan-to-slides.mjs` as the CLI over them. One
  parse tree still feeds all three modes (§8 tree updated).
- `lib/config.mjs` reads `deckard.json` with defaults, ready for M4/M5.
- The emitter carries the source H1 into Marp's `title:` frontmatter key, and
  `layout:` becomes `_class:`.
- **A stranded plain H4 and its content are held out of the deck** rather than
  absorbed by the enclosing `deck:` section (§2.2, decided 2026-07-26): since
  the finding already reports it, folding it into a presenter note would add
  debris to an error instead of replacing it. The parser keeps the block on the
  slide as `stranded` so a report can still quote it.
- **Added `skills/pipeline/SKILL.md`** — the shared background every phase
  skill loads first (framework.md §8), and the home of the `--status` /
  buckets / `handoff` explanation. Each phase skill carries one line, *"Make
  sure the `deck:pipeline` knowledge skill is loaded"*, and the skill is
  model-invocable so that line resolves through the Skill tool. A test asserts
  each phase skill carries it, so M4's and M6's skills cannot land without it.
  Its own description needed quoting: a `: ` inside it is the M1 colon trap
  again.

## M4 — Build & publish (`/deck:build`)

- [x] `scripts/build.mjs` — run the transform, then Marp on `.build/slides.md`
      → `slides.html`, using the configured brand kit's `theme.css`. The
      renderer is **located, never fetched** (`lib/marp.mjs`: `marpCommand` →
      `PATH` → `node_modules/.bin/marp`), which replaced the planned
      `npx @marp-team/marp-cli@4.5.0`: measured, that fetches 163 packages /
      131 MB behind a grant reading "run one script", with npm's confirmation
      suppressed by `-y`, and fails offline. 4.5.0 is now the version Deckard
      is *verified against*; a mismatch is a note, not a refusal.
- [x] `scripts/embed-fonts.mjs` — base64 fonts into the theme, sourced from
      the kit's `fonts/`. **Written fresh in JS** (the prior originals were
      Python, so there was nothing to port). It inlines the `url()` references
      a kit author already wrote, rather than synthesising `@font-face` rules
      between markers: the kit keeps control of family names, weights and
      `unicode-range`, and no filename convention has to be invented.
- [x] `scripts/publish.mjs` — literal asset-path → data-URI substitution
      (never a re-parse of rendered output). Fresh JS, same reason. Paths are
      substituted longest-first, so one asset path that prefixes another is
      never partly replaced.
- [x] `skills/build/SKILL.md` — runs lint + build + publish, reports
      human-readably (lint findings, output paths, sizes). The model runs the
      script with Bash rather than a bang command: a render takes tens of
      seconds and can fail, and both want reporting the model controls.
- [x] Verification: the kitchen-sink fixture builds end-to-end — lints clean,
      renders, publishes self-contained. Confirmed in the output: no asset
      path references survive, both assets are data URIs, presenter notes are
      present, and the kit theme is applied. **Layout review is deferred to
      the brand-kit phase**, where proper layouts get designed and the
      exported-PNG habit has something to check against.

**Done when:** `/deck:build` takes the kitchen-sink fixture to rendered,
publishable HTML end-to-end.

**Landed 2026-07-26.** `just check` green (62 tests). The fixture builds to a
119 kB self-contained deck. Decisions worth carrying forward:

- **Errors block the render** — a deck holding something the format cannot
  express would produce output nobody should trust. `--no-lint` renders anyway
  for work in progress, `--no-publish` stops after the local render.
- **Build and publish write to different places.** The render lands in
  `<outDir>/slides.html` (git-ignored, fast, relative asset paths intact);
  publish writes `<publish>` at the project root, self-contained. That split is
  what keeps the local loop fast and never re-parses rendered output.
- **The kit is never mutated.** Fonts are embedded into `<outDir>/theme.css`,
  a build copy, leaving the shipped kit pristine — so a build cannot dirty the
  plugin's own `brand-kits/`.
- **Two M8 items landed early because the build needs them:** kit resolution
  (`lib/kit.mjs`, with errors naming what to fix) and a **minimal** neutral
  `brand-kits/default/theme.css`. M8 still owns the real design work.
- **Fixture assets are now real images**, not text stubs — a 480×900 PNG and a
  160×36 GIF, generated so the bg-image slide has something to show. Lint only
  checks existence, but the published deck embeds them, and the brand-kit phase
  needs to see them.
- The Marp render is deliberately **outside** the test suite: it downloads a
  pinned CLI and drives a browser. Tests cover the gate, kit resolution, font
  embedding and the publish substitution; the render is verified end-to-end.

## M5 — Autobuild hook

Needs M4's build entry point.

- [x] `scripts/autobuild.mjs` — exit fast when `deckard.json` absent; hash
      `presentation.md` + active theme against `.build/last-build.hash`;
      rebuild (build only, no publish) on change.
- [x] **Report a rebuild in one short line, and report errors** (decided
      2026-07-26). The line fires *only when a rebuild actually happened* —
      something like `deckard: rebuilt .build/slides.html — 9 slides`. A silent
      successful build is indistinguishable from a hook that never ran, which
      makes the whole mechanism impossible to trust; one line per genuine
      rebuild is the confirmation that costs nothing. **A turn that changed
      nothing prints nothing**, so quiet turns stay quiet.
      **Errors** are reported the same way: one terse line naming the count and
      pointing at `--lint`, never a full report — otherwise a deck could break
      and stay broken until someone ran `/deck:build`.
      **Warnings are deliberately excluded:** `orphaned-asset` fires
      constantly and legitimately while media is being produced, and a nag on
      every turn is how users learn to ignore output — the same reasoning that
      made it a warning to begin with (§5.5). A useful consequence: with
      warnings out of scope the hook can skip the orphan directory scan, so it
      does no filesystem walk beyond reading the source.
- [x] **The hook needs a renderer too.** It uses the same `lib/marp.mjs`
      resolution, and when nothing is found it emits
      `missingMarpMessage({ hook: true })` — which tells the model to locate a
      Marp (after the *user* installs one, or with their endorsement) and record
      the path in `deckard.json` as `marpCommand`, so every later turn finds it.
      A hook that silently stopped rendering would be worse than one that says
      why.
- [x] `hooks/hooks.json` — `Stop` event, sensible timeout, the **matcher-group
      shape** (`"Stop": [{ "hooks": [{ … }] }]` — a Stop group just omits the
      matcher), and **exec form** for the handler (`"command": "node"`,
      `"args": [path]`), which the hooks reference recommends for plugin scripts
      so a plugin root containing spaces is never re-tokenized by a shell.
      Flattening the group away is accepted, validates, and **silently never
      fires** — worth remembering, since nothing reports the difference. That
      flat form was our own misreading of the reference, which is consistently
      three levels (event → matcher group → handler); a summarised doc lookup
      invented it, and reading the raw page corrected it.
- [x] Verify `async` on Stop hooks empirically (§5.7 — docs have been wrong
      before). It is supported, and it **does not survive a headless session**:
      `claude -p` exits at the end of a turn and kills the backgrounded hook,
      even for a script that only writes a file, because Node's startup loses a
      race that a shell builtin wins. So the plan's `async: true` became
      **`async: false`**, which the numbers make cheap — **~30 ms** on a turn
      that changed nothing, **~0.5 s** for a real re-render. Blocking briefly
      and reliably beats never blocking and sometimes not running.
- [x] Manual verification: in a deckard project, an edit to
      `presentation.md` is rebuilt by end of turn; in a non-deckard project
      the hook is an instant no-op; a quiet turn triggers no rebuild.

**Done when:** editing a slide and ending the turn refreshes `slides.html`
with no visible latency at the prompt.

**Landed 2026-07-26.** `just check` green (74 tests). Verified live: a session
that appended a slide to `presentation.md` came back to a `.build/` holding
`slides.md`, `slides.html`, `theme.css` and `last-build.hash`, and a second
session that changed nothing left every byte alone. Direct runs cover the rest
of the matrix — a non-deckard project prints nothing (30 ms), a broken deck
reports `1 error … run /deck:build for detail`, and a missing renderer reports
one line to the user plus the full `marpCommand` instruction to the model.

- **Reporting goes through `systemMessage`** in JSON on stdout. A hook's plain
  stdout on exit 0 goes to the debug log and is never shown, so the obvious
  `console.log` would have been invisible. Confirmed in a live session: it
  displays as `Stop says: deckard: …`.
- **The model is reachable too, but only through the nested field.**
  `hookSpecificOutput: { hookEventName: "Stop", additionalContext }` arrives at
  the start of the next turn (prefixed `Stop hook additional context:`, verified
  2026-07-27 by resuming a session and asking what it received). The top-level
  `additionalContext` field is accepted and silently dropped — which looked like
  proof that a finished turn cannot reach the model, and briefly got written
  down as such. It was the wrong shape, not a closed door. So the user gets one
  line and the model gets the findings, or the full instruction to locate a Marp
  CLI and record `marpCommand`.
- **The hash records the last *attempt*, not the last success** — written before
  the build runs. That ordering is what makes the model-facing report converge:
  `additionalContext` wakes the model, which produces output, which ends a turn,
  which fires the hook again, so a broken deck reported itself forever until the
  user interrupted (observed 2026-07-27, three identical firings). With the
  attempt recorded, the next firing sees an unchanged deck and stays silent,
  bounding the cycle at the one turn where the model is told. It also settles the
  earlier "does a broken deck nag every turn?" question: it reports once per
  change. The cost is that a failed build marks its inputs as seen, so the retry
  comes from the next edit rather than the next turn — which is the right trade,
  since nothing about an unchanged broken deck deserves a second render.
- **No `requireNode()` guard here**, unlike the other entry points: an old
  runtime should leave the session alone rather than complain once per turn.
  `/deck:build` is where that gets said.

## M6 — `/deck:media`

Generalizes a media skill from the prior project — the user can supply the
original as a reference; ask for it.

- [ ] `skills/media/SKILL.md` — state-driven per §3 P3: backlog report first
      (five buckets: missing = key absent / pending / handoff / none / done,
      read via the transform's `--status` JSON mode — never re-parsed in
      prose); then work items until told to stop. Args: none = status +
      proceed, `status` = report only, slide title = that slide.
- [ ] Three-way classification (§2.4) with the "code block before screenshot"
      check; explicit `media: done | pending | handoff | none` updates
      (`handoff` set explicitly, never inferred from a capture directive);
      manual-handoff emits a precise capture directive into the slide's
      `deck: Media` section.
- [ ] `skills/media/capture-vhs.md` — the §5.4 VHS lore, linked on demand.
- [ ] `scripts/regenerate-media.mjs` — glob `blueprints/**/*.tape` (fix 5.6,
      `fs.globSync`), run each; no manual list.
- [ ] `common.tape` — the default VHS look; the user can supply a prior
      tape as a starting point (ask). Decide its home then (`templates/` vs
      next to `skills/media/`).
- [ ] Verification: on the fixture, flip one slide to `media: pending` and
      run the loop; confirm it never reopens a `done` slide (§5.2 scenario).

**Done when:** the §5.2 dead-end scenario (re-opening a resolved slide) is
demonstrably impossible and the status report matches the fixture's states.

## M7 — `/deck:ideate` + `/deck:plan`

Prompt-craft; §3 already contains the working prompts.

- [ ] `skills/ideate/SKILL.md` — read all of `data/`, discussion protocol,
      evidence-grounded topic tiers → `notes.md`; no slides, no timed agenda;
      re-run = delta assessment against `presentation.md` (additive vs
      directional, §3 P1).
- [ ] `skills/plan/SKILL.md` — narrative first, then whole-set draft, then
      one-slide-at-a-time iteration; pushes back if `notes.md` is thin;
      re-run = reconcile, report the diff; documents the source-format
      limitations to the authoring agent (§2.2 heading budget — title
      H3 → H1, content H4–H6 → H2–H4, nothing deeper; `deck:` sections;
      inline-image-syntax-only).
- [ ] Dry-run verification: toy `data/` folder (a survey CSV + a notes file),
      run ideate → plan → build end-to-end on a 5-slide throwaway deck.

**Done when:** the toy project goes from `data/` to rendered HTML using only
`/deck:*` commands.

## M8 — Brand kits

- [ ] `brand-kits/default/` — neutral `theme.css` (+ minimal `kit.md`);
      referenced by the skeleton `deckard.json`.
- [ ] Build the **WTTJ kit** (the user supplies the WTTJ theme CSS and
      fonts — ask for them) as a private directory following the contract —
      fully self-contained, fonts **copied** in, never referenced across
      repos; ask the user where the private dir/repo should live; rebuild
      the kitchen-sink fixture with it.
- [ ] Kit resolution in the scripts: path from `deckard.json`, fallback to
      the bundled default; clear error when a kit lacks `theme.css`
      (landed early at M4 — `lib/kit.mjs` — because the build needed it;
      re-verify here against a second, real kit).
- [ ] **Verify and test `embed-fonts.mjs` against real fonts.** M4 left this
      the one code path never exercised for real: the bundled default kit has
      no `fonts/` and no `url()` references, so the only coverage is a unit
      test with a text file named `.woff2`. The WTTJ kit is the first kit with
      genuine font files, so verify here that:
      - every `url()` in the kit's `theme.css` resolves and is replaced by a
        `data:` URI in `<outDir>/theme.css`, with the kit itself left
        unmodified;
      - the **published** deck renders in the kit's typeface with no network
        access — the real proof is opening it offline, since a missing embed
        degrades silently to a fallback font rather than erroring;
      - each font format the kit ships maps to the right MIME type
        (`woff2`/`woff`/`ttf`/`otf`), and a format outside that set is
        reported rather than silently left as a relative reference;
      - `unicode-range`, `font-weight` and `font-style` survive untouched —
        substitution rewrites the `url()` only, which is the whole reason it
        works on references the kit author wrote.
      Add a fixture kit with one small real font (a permissively licensed
      face, not the WTTJ one — the scrub rule keeps brand material out of this
      repo) so the path stays covered by `just check` afterwards.
- [ ] Theme verification habit (§8): export representative slide PNGs (the
      kitchen-sink fixture supplies one slide per class) and review; grep
      compiled HTML for cascade conflicts with Marp defaults. This is also
      where the layouts deferred from M4 get designed and checked.

**Done when:** switching kits is a one-line config change, the fixture builds
correctly under both, and the published deck shows the kit's fonts with the
network off.

## M9 — Open-source prep

- [ ] README (install, quickstart, the four phases, Node ≥ 22 requirement),
      license, marketplace metadata; `utils/transcript.py` ships as the
      standalone retrospective tool.
- [ ] Marketplace manifest (`.claude-plugin/marketplace.json` at the repo
      root, `"source": "./plugin"` — validated as a working shape 2026-07-26,
      deferred to here since nothing needs it earlier). It needs its own
      `description` to survive `--strict`, and **validation does not check
      that `source` resolves** — a manifest pointing at a nonexistent
      directory passes clean, so the test suite must assert the link.
- [ ] CI: `just check` (install + `node --test` + `claude plugin validate
      plugin --strict`), plus validating the marketplace manifest at the root.
- [ ] Final dogfood: a genuinely fresh deck built start-to-finish on the
      published plugin.

**Done when:** a colleague can install Deckard from the repo and reach a
rendered deck with nothing but this repo and its README.

## M10 — Refactor the larger modules toward a functional style

Deliberately last: the shape of these modules is still being learned, and
refactoring toward a style before the requirements settle optimises the wrong
thing. By here the format, the lint rules and the build path have all stopped
moving, so the remaining complexity is real complexity worth reshaping.

- [ ] `lib/deck-parse.mjs` — the closure-based handlers mutate seven pieces of
      loop state (`title`, `inSlides`, `fence`, `slide`, `section`, `stranded`,
      `awaitingMetadata`). Reshape as an explicit state value threaded through
      pure `(state, line) → state` steps, so each heading level becomes a
      function that can be read and tested on its own.
- [ ] `lib/deck-lint.mjs` — the rules are already independent; make that
      structural. A list of `(deck, context) → Finding[]` rules, folded, so
      adding a check means adding a function to a list and severity stays the
      one lookup it already is.
- [ ] `build.mjs` — separate deciding from doing: a pure function that turns
      config + deck + resolved renderer into a plan of steps, and a thin driver
      that performs them. The lint gate, the version note and the publish step
      become inspectable without spawning anything.
- [ ] Keep the shipped style plain: functions and plain data, no classes, no
      dependencies, and no clever combinator layer that a reader has to learn
      before they can audit the plugin (§8).

**Safety net, which is the point of doing it here:** the golden file plus the
fixtures pin the behaviour, and a differential run — old implementation vs new
over every fixture and a set of adversarial inputs, comparing whole parse trees
— is the check that catches what tests miss. That is exactly how the M3 handler
extraction was verified (28 inputs, 0 mismatches), so the pattern is known to
work here.

**Done when:** `just check` is green, the golden file is byte-identical, and a
differential over every fixture reports no mismatches.

---

## Iteration protocol

- One milestone per session is a good default; M3 may take two.
- Land each milestone with its tests green and `plugin validate` clean before
  starting the next.
- Deviations from `framework.md` discovered during implementation get folded
  back into it (with reasoning) in the same session — the two docs must not
  drift.
