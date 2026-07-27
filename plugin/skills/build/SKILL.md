---
name: build
description: Phase 4 — lint the source deck and render it with Marp to the project root; the authoritative check on a deck's health.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs":*)
---

# /deck:build

Make sure the `deck:pipeline` knowledge skill is loaded.

Run the build from the project root:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs"`

It lints, then renders `slides.html` at the project root through the Marp CLI
it locates (`marpCommand` → `PATH` → project `node_modules`). Asset
references stay file references there, so the user can overwrite a media
file and refresh the browser. If the script reports that no renderer was
found, relay its message — installing one is the user's decision. The
shareable, self-contained file is `/deck:publish`'s job.

Run it once and report what it printed: the findings with their severities, the
output path and its size. The script inspects the project itself, so listing
directories or reading the config first adds nothing.

The autobuild hook keeps the render current as the deck is edited. The hook
reports each change **once**, and it suppresses warnings, so its line is a
notification rather than a verdict on the deck. This command is the
authoritative check: it re-lints from scratch and reports the warnings the
hook leaves out. Encourage the user to run it whenever they want to know the
deck is sound rather than assume it, and before `/deck:publish`.

**When errors stop the build**, the deck holds something the format cannot
express, so nothing was rendered. Show each finding with its line and message,
and offer to fix them — a missing asset usually means `/deck:media` has work
outstanding, while malformed metadata or an unreachable heading is a source
edit. Re-run afterwards.

**Warnings are reported and change nothing.** An orphaned asset is a file no
slide references, which is ordinary while media is being produced: mention it
once and leave the decision to the user.

To render a deck that still has errors, to see work in progress, pass
`--no-lint`.
