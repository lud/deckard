# Deckard — build plan

Implementation roadmap for the design in `framework.md`. Milestones are small
and strictly ordered by dependency; each one ends with something **working and
verified**, so any session can pick up at the first unchecked box. Update the
checkboxes as work lands.

**Where the code lives:** its own repo at `~/src/deckard` (done 2026-07-25 —
no extraction milestone needed). Iterate by starting test sessions with
`claude --plugin-dir ~/src/deckard` (in a scratch project or in this training
repo) and `/reload-plugins` after edits. This repo stays the source of the
golden fixture, but the fixture is **copied** into the deckard repo's test
tree — its tests must not reach outside their repo.

**Testing baseline (all milestones):** zero-dep `node --test` under
`deckard/test/`; `claude plugin validate ./deckard` must pass whenever the
manifest or a SKILL.md changes.

---

## M1 — Skeleton + dev harness

Everything else needs a loadable plugin to iterate inside.

- [ ] `deckard/.claude-plugin/plugin.json` — `name: "deck"`,
      `displayName: "Deckard"`, description, version `0.0.1`.
- [ ] Stub `skills/{init,ideate,plan,media,build}/SKILL.md` — frontmatter only
      (`description`, `disable-model-invocation: true`), body "not implemented".
- [ ] `scripts/`, `templates/`, `brand-kits/default/`, `test/` directories.
- [ ] `.gitignore` and a `node --test` smoke test that the manifest parses.

**Done when:** `claude plugin validate ./deckard` passes and a session started
with `--plugin-dir ./deckard` lists `/deck:init` … `/deck:build`.

## M2 — `/deck:init` (scaffold)

Small, independent, and exercises the skill→script wiring pattern every other
skill reuses.

- [ ] `templates/notes.skeleton.md`, `templates/presentation.skeleton.md`
      (the §2 hierarchy), `templates/deckard.skeleton.json`.
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
      `key: value` metadata block; `**Content**` / `**Media**` /
      `**Speaker notes**` / `**Knowledge**` subsections.
- [ ] Emitter: Content → body; Media images/code kept; Speaker notes → a
      **separate** presenter-note comment; Knowledge dropped; layout keys →
      `_`-prefixed Marp directives; pipeline keys (`media:`) never emitted;
      no unnamespaced key that collides with a Marp directive name (§2.3).
- [ ] `--lint`: every referenced asset resolves on disk; orphaned media in
      `output/`/`assets/` flagged; malformed metadata blocks reported with
      line numbers.
- [ ] Unit tests: metadata edge cases, directive scoping, note-vs-directive
      separation, slides with no media, meta sections ignored.
- [ ] **Golden fixture:** convert this repo's `session-plan.md` into the §2
      `presentation.md` format (one-time, agent-assisted, reviewed), copy the
      result into `deckard/test/fixtures/`, and add a golden-file test:
      transform(fixture) ≡ committed expected `slides.md`. (Snapshot copy —
      the deckard repo must not depend on this repo's paths.)

**Done when:** the golden test passes and `--lint` on the fixture reports
clean (or exactly the known, documented exceptions).

## M4 — Build & publish (`/deck:build`)

- [ ] `scripts/build.mjs` — run the transform, then Marp
      (`npx @marp-team/marp-cli`) on `.build/slides.md` → `slides.html`,
      using the configured brand kit's `theme.css`.
- [ ] `scripts/embed-fonts.mjs` — port of `embed-fonts.sh`: base64
      `@font-face` between markers in the theme, sourced from the kit's
      `fonts/`.
- [ ] `scripts/publish.mjs` — port of `publish.sh`: literal asset-path →
      data-URI substitution (never a re-parse of rendered output).
- [ ] `skills/build/SKILL.md` — runs lint + build + publish, reports
      human-readably (lint findings, output paths, sizes).
- [ ] Verification on the fixture: built HTML renders the same deck as the
      existing `slides.html` (spot-check slides incl. presenter notes in
      Marp's presenter view; parity of content, not bytes).

**Done when:** `/deck:build` reproduces this repo's deck end-to-end from the
converted fixture.

## M5 — Autobuild hook

Needs M4's build entry point.

- [ ] `scripts/autobuild.mjs` — exit fast when `deckard.json` absent; hash
      `presentation.md` + active theme against `.build/last-build.hash`;
      rebuild (build only, no publish/lint) on change.
- [ ] `hooks/hooks.json` — `Stop` event, `async: true`, sensible timeout.
- [ ] Manual verification: in a deckard project, an edit to
      `presentation.md` is rebuilt by end of turn; in a non-deckard project
      the hook is an instant no-op; a quiet turn triggers no rebuild.

**Done when:** editing a slide and ending the turn refreshes `slides.html`
with no visible latency at the prompt.

## M6 — `/deck:media`

Generalization of this repo's `.claude/skills/next-media/`.

- [ ] `skills/media/SKILL.md` — state-driven per §3 P3: backlog report first
      (from `media:` metadata via the transform's parser — expose a
      `--status` JSON mode rather than re-parsing in prose); then work items
      until told to stop. Args: none = status + proceed, `status` = report
      only, slide title = that slide.
- [ ] Three-way classification (§2.4) with the "code block before screenshot"
      check; explicit `media: done | pending | none` updates; manual-handoff
      emits a precise capture directive into the slide.
- [ ] `skills/media/capture-vhs.md` — the §5.4 VHS lore, linked on demand.
- [ ] `scripts/regenerate-media.mjs` — glob `blueprints/**/*.tape` (fix 5.6),
      run each; no manual list.
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
      re-run = reconcile, report the diff.
- [ ] Dry-run verification: toy `data/` folder (a survey CSV + a notes file),
      run ideate → plan → build end-to-end on a 5-slide throwaway deck.

**Done when:** the toy project goes from `data/` to rendered HTML using only
`/deck:*` commands.

## M8 — Brand kits

- [ ] `brand-kits/default/` — neutral `theme.css` (+ minimal `kit.md`);
      referenced by the skeleton `deckard.json`.
- [ ] Extract the **WTTJ kit** from this repo (`themes/`, `style.css`, fonts)
      into a private directory following the contract; point this repo's
      config at it; rebuild the fixture with it.
- [ ] Kit resolution in the scripts: path from `deckard.json`, fallback to
      the bundled default; clear error when a kit lacks `theme.css`.
- [ ] Theme verification habit (§8): export representative slide PNGs and
      review; grep compiled HTML for cascade conflicts with Marp defaults.

**Done when:** switching kits is a one-line config change and the fixture
builds correctly under both.

## M9 — Open-source prep

(The repo split already happened — deckard was born as its own repo at
`~/src/deckard`.)

- [ ] This repo switches from `--plugin-dir` to a normal plugin install and
      keeps only its project files (`presentation.md`, `deckard.json`, media,
      built outputs).
- [ ] README (install, quickstart, the four phases), license, marketplace
      metadata; `utils/transcript.py` ships as the standalone retrospective
      tool.
- [ ] CI: `node --test` + `claude plugin validate`.
- [ ] Final dogfood: a genuinely fresh deck built start-to-finish on the
      published plugin.

**Done when:** a colleague can install Deckard from the repo and reach a
rendered deck without touching this training repo.

---

## Iteration protocol

- One milestone per session is a good default; M3 may take two.
- Land each milestone with its tests green and `plugin validate` clean before
  starting the next.
- Deviations from `framework.md` discovered during implementation get folded
  back into it (with reasoning) in the same session — the two docs must not
  drift.
