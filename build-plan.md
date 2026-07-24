# Deckard — build plan

Implementation roadmap for the design in `framework.md`. Milestones are small
and strictly ordered by dependency; each one ends with something **working and
verified**, so any session can pick up at the first unchecked box. Update the
checkboxes as work lands.

**Where the code lives:** its own repo at `~/src/deckard` — this repo, which
also carries these two docs (done 2026-07-25 — no extraction milestone
needed). The old **training repo** (`~/src/017.claude-code-training-2`, this
machine only) is a passive resource mine, nothing more: originals worth
consulting when porting (`embed-fonts.sh`, `publish.sh`, `generate.sh`,
`.claude/skills/next-media/`, `blueprints/`, `process/transcript.py`) and the
WTTJ styles the user retrieves at M8 (`themes/`, `style.css`, fonts). No
coordination with it, and no artifact from it, is on the critical path.
Iterate by starting test sessions with `claude --plugin-dir ~/src/deckard` in
a scratch project, with `/reload-plugins` after edits. Anything taken from
the training repo is **snapshot-copied** in — runtime, tests, and CI never
reference its paths. Scrub rule when copying: no WTTJ-branded material
(theme, fonts, logos) lands in this open-source repo; brand material goes
only into the private kit dir at M8.

**Testing baseline (all milestones):** Node **≥ 22** (stable `node --test`,
`fs.globSync`); zero-dep `node --test` under `test/`; `claude plugin
validate .` must pass whenever the manifest or a SKILL.md changes.

---

## M1 — Skeleton + dev harness

Everything else needs a loadable plugin to iterate inside.

- [ ] `.claude-plugin/plugin.json` — `name: "deck"`,
      `displayName: "Deckard"`, description, version `0.0.1`.
- [ ] Stub `skills/{init,ideate,plan,media,build}/SKILL.md` — frontmatter only
      (`description`, `disable-model-invocation: true`), body "not implemented".
- [ ] `scripts/`, `templates/`, `brand-kits/default/`, `test/` directories.
- [ ] `.gitignore` and a `node --test` smoke test that the manifest parses.

**Done when:** `claude plugin validate .` passes and a session started with
`--plugin-dir .` lists `/deck:init` … `/deck:build` — verify empirically that
the `deck` prefix renders as expected. The short `deck` prefix is the hard
requirement; individual skill names are flexible (`init` → `scaffold`, etc.)
if a collision or UX surprise appears.

## M2 — `/deck:init` (scaffold)

Small, independent, and exercises the skill→script wiring pattern every other
skill reuses.

- [ ] `templates/notes.skeleton.md`, `templates/presentation.skeleton.md`
      (the §2 hierarchy), `templates/deckard.skeleton.json`.
- [ ] Finalize the `deckard.json` schema (starting shape in framework.md §8:
      flat, every field optional with defaults — `brandKit`, `source`,
      `captureTool`, `outDir`, `publish`, `marpVersion`; presence alone is
      the hook marker); fold any deviation back into framework.md.
- [ ] Shared script entry helper with a `process.version` guard (Node ≥ 22,
      clear error).
- [ ] `scripts/init.mjs` — idempotent: create `data/`, the two docs,
      `deckard.json`, `.gitignore` entry for `.build/`; **never overwrite**;
      print created-vs-skipped report.
- [ ] `skills/init/SKILL.md` — a dynamic-context bang command running
      `init.mjs`; the model only relays the report.
- [ ] Tests: run twice against a temp dir — second run is a full no-op; a
      pre-existing file with content survives byte-identical.

**Done when:** `/deck:init` in an empty scratch project produces the layout,
and re-running it changes nothing.

## M3 — `plan-to-slides.mjs` (the transform + `--lint`)

The keystone. Line-based per §2 (no markdown parser), emitting Marp per §4.

- [ ] Parser: `## Slides` anchor; one slide per H3; leading HTML-comment
      `key: value` metadata block; body = everything up to the first
      `#### deck:` heading; `deck:`-prefixed H4 sections (`Media` / `Notes` /
      `Knowledge`, case-insensitive; unknown names = lint finding; a plain
      H4 without the prefix is content).
- [ ] Emitter: body → slide with headings promoted two levels (title
      H3 → H1, content H4 → H2 … H6 → H4); `deck: Media` dropped (produced
      assets live in the body); `deck: Notes` → a **separate**
      presenter-note comment; `deck: Knowledge` dropped; layout keys →
      `_`-prefixed Marp directives; repeatable `marp:` passthrough key →
      raw spot directive (§2.3); pipeline keys (`media:`) never emitted;
      no unnamespaced key that collides with a Marp directive name (§2.3);
      generated file opens with a do-not-edit **YAML comment inside the
      frontmatter** (an HTML comment there becomes slide 1's presenter
      note, §5.1).
- [ ] `--lint`: every referenced asset resolves on disk; orphaned media in
      `output/`/`assets/` flagged; malformed metadata blocks reported with
      line numbers; unrecognized content (unknown `deck:` section names,
      stray content between anchors, plain H4 inside a `deck:` section —
      the §2.2 ordering rule) is a finding with a line number — the
      transform never silently drops it (§5.1, hand-edit robustness);
      state/section coherence per §5.5 (`deck: Media` present on a
      `done | none` slide = stale intent; `pending | handoff` with no
      `deck: Media` = missing directive).
- [ ] Unit tests: metadata edge cases, directive scoping, note-vs-directive
      separation, slides with no media, meta sections ignored, heading
      promotion (H4–H6 → H2–H4; plain H4 is content, `deck:` H4 is a
      section, case-insensitive), `#`-prefixed lines inside fenced code not
      parsed as headings (§2.1, the YOLO-slide case).
- [ ] **Golden fixture — purpose-built in this repo:** `test/fixtures/`
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
- [ ] Lint fixtures: small deliberately-broken decks asserting each `--lint`
      finding (missing asset, orphaned asset, malformed metadata, unknown
      `deck:` section, unreachable plain H4, state/section incoherence).

**Done when:** the golden test passes, the kitchen-sink fixture lints clean,
and each lint fixture produces exactly its expected finding.

## M4 — Build & publish (`/deck:build`)

- [ ] `scripts/build.mjs` — run the transform, then Marp at the **pinned
      version** (`npx @marp-team/marp-cli@4.5.0` — the version that built the
      training deck; a constant in `build.mjs`, overridable via `marpVersion`
      in `deckard.json`) on `.build/slides.md` → `slides.html`, using the
      configured brand kit's `theme.css`.
- [ ] `scripts/embed-fonts.mjs` — port of the training repo's
      `embed-fonts.sh`: base64 `@font-face` between markers in the theme,
      sourced from the kit's `fonts/`.
- [ ] `scripts/publish.mjs` — port of the training repo's `publish.sh`:
      literal asset-path → data-URI substitution (never a re-parse of
      rendered output).
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
      rebuild (build only, no publish/lint) on change.
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

Generalization of the training repo's `.claude/skills/next-media/`.

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
- [ ] Adapt the training repo's `blueprints/common.tape` as the default VHS
      look; decide its home then (`templates/` vs next to `skills/media/`).
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
- [ ] Extract the **WTTJ kit** (the user retrieves `themes/`, `style.css`,
      and fonts from the training repo) into a private directory following
      the contract — fully self-contained, fonts **copied** in, never
      referenced across repos; ask the user where the private dir/repo
      should live; rebuild the kitchen-sink fixture with it.
- [ ] Kit resolution in the scripts: path from `deckard.json`, fallback to
      the bundled default; clear error when a kit lacks `theme.css`.
- [ ] Theme verification habit (§8): export representative slide PNGs (the
      kitchen-sink fixture supplies one slide per class) and review; grep
      compiled HTML for cascade conflicts with Marp defaults.

**Done when:** switching kits is a one-line config change and the fixture
builds correctly under both.

## M9 — Open-source prep

(The repo split already happened — deckard was born as its own repo at
`~/src/deckard`.)

- [ ] README (install, quickstart, the four phases, Node ≥ 22 requirement),
      license, marketplace metadata; `utils/transcript.py` ships as the
      standalone retrospective tool.
- [ ] CI: `node --test` + `claude plugin validate`.
- [ ] Final dogfood: a genuinely fresh deck built start-to-finish on the
      published plugin.

**Done when:** a colleague can install Deckard from the repo and reach a
rendered deck without touching the training repo.

---

## Iteration protocol

- One milestone per session is a good default; M3 may take two.
- Land each milestone with its tests green and `plugin validate` clean before
  starting the next.
- Deviations from `framework.md` discovered during implementation get folded
  back into it (with reasoning) in the same session — the two docs must not
  drift.
