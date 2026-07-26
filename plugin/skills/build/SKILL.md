---
name: build
description: Phase 4 — lint the source deck, render it with Marp, and publish a self-contained HTML file.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs":*)
---

# /deck:build

Make sure the `deck:pipeline` knowledge skill is loaded.

Run the build from the project root:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs"`

It lints, renders `.build/slides.html` through Marp at the pinned version, and
publishes a self-contained deck to the configured output. The first run
downloads the Marp CLI, so allow it time.

Run it once and report what it printed: the findings with their severities, the
output paths and their sizes. The script inspects the project itself, so listing
directories or reading the config first adds nothing.

The autobuild hook keeps the local render current as the deck is edited, which
makes this command the deliberate publish-and-verify step rather than something
to repeat during authoring.

**When errors stop the build**, the deck holds something the format cannot
express, so nothing was rendered. Show each finding with its line and message,
and offer to fix them — a missing asset usually means `/deck:media` has work
outstanding, while malformed metadata or an unreachable heading is a source
edit. Re-run afterwards.

**Warnings are reported and change nothing.** An orphaned asset is a file no
slide references, which is ordinary while media is being produced: mention it
once and leave the decision to the user.

To render a deck that still has errors, to see work in progress, pass
`--no-lint`. Add `--no-publish` to stop after the local render.
