# Deckard — build plan

Implementation roadmap for the design in `framework.md`. Milestones are small
and strictly ordered by dependency; each one ends with something **working and
verified**, so any session can pick up at the first unchecked box. Update the
checkboxes as work lands.

**Where the code lives:** its own repo at `~/src/deckard` — this repo, which
also carries these two docs. Some milestones adapt material from a prior
project the user keeps privately: original build/publish/font-embed shell
scripts (M4), a prior media skill and VHS tapes (M6), the WTTJ brand styles
(M8). **Ask the user** for an original when a milestone needs one; anything
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

- [ ] `scripts/build.mjs` — run the transform, then Marp at the **pinned
      version** (`npx @marp-team/marp-cli@4.5.0` — verified end-to-end, §3
      Phase 4; a constant in `build.mjs`, overridable via `marpVersion`
      in `deckard.json`) on `.build/slides.md` → `slides.html`, using the
      configured brand kit's `theme.css`.
- [ ] `scripts/embed-fonts.mjs` — base64 `@font-face` between markers in the
      theme, sourced from the kit's `fonts/`. The user can supply a prior
      shell-script original to port — ask for it.
- [ ] `scripts/publish.mjs` — literal asset-path → data-URI substitution
      (never a re-parse of rendered output). The user can supply a prior
      shell-script original to port — ask for it.
- [ ] `skills/build/SKILL.md` — runs lint + build + publish, reports
      human-readably (lint findings, output paths, sizes).
- [ ] Verification: build the kitchen-sink fixture and review per the §8
      habit — export representative slide PNGs, Read them, check presenter
      notes in Marp's presenter view.

**Done when:** `/deck:build` takes the kitchen-sink fixture to rendered,
publishable HTML end-to-end.

## M5 — Autobuild hook

Needs M4's build entry point.

- [ ] `scripts/autobuild.mjs` — exit fast when `deckard.json` absent; hash
      `presentation.md` + active theme against `.build/last-build.hash`;
      rebuild (build only, no publish) on change.
- [ ] **Surface errors, and only errors** (decided 2026-07-26). A silent
      auto-rebuild would let a deck break and stay broken until someone ran
      `/deck:build`, so the hook reports **error**-severity findings — one
      terse line naming the count and `--lint`, never a full report. It stays
      **silent when clean**, which is the hook's whole point on a quiet turn.
      **Warnings are deliberately excluded:** `orphaned-asset` fires
      constantly and legitimately while media is being produced, and a nag on
      every turn is how users learn to ignore output — the same reasoning that
      made it a warning to begin with (§5.5). A useful consequence: with
      warnings out of scope the hook can skip the orphan directory scan, so it
      does no filesystem walk beyond reading the source.
- [ ] `hooks/hooks.json` — `Stop` event, `async: true`, sensible timeout.
- [ ] Verify `async: true` on Stop hooks against the installed CLI (docs say
      supported as of 2026-07-24, incl. `asyncRewake`; confirm empirically
      per §5.7 — docs have been wrong before).
- [ ] Manual verification: in a deckard project, an edit to
      `presentation.md` is rebuilt by end of turn; in a non-deckard project
      the hook is an instant no-op; a quiet turn triggers no rebuild.

**Done when:** editing a slide and ending the turn refreshes `slides.html`
with no visible latency at the prompt.

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
      the bundled default; clear error when a kit lacks `theme.css`.
- [ ] Theme verification habit (§8): export representative slide PNGs (the
      kitchen-sink fixture supplies one slide per class) and review; grep
      compiled HTML for cascade conflicts with Marp defaults.

**Done when:** switching kits is a one-line config change and the fixture
builds correctly under both.

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

---

## Iteration protocol

- One milestone per session is a good default; M3 may take two.
- Land each milestone with its tests green and `plugin validate` clean before
  starting the next.
- Deviations from `framework.md` discovered during implementation get folded
  back into it (with reasoning) in the same session — the two docs must not
  drift.
