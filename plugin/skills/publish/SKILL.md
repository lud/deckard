---
name: publish
description: Produce the self-contained, shareable deck — lint, render, and embed every asset into a single HTML file. Deterministic; the script does everything.
disable-model-invocation: true
argument-hint: "[optional request about the published deck]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs" --publish)
---

# /deck:publish

Make sure the `deck:pipeline` knowledge skill is loaded.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs" --publish`

The publish has run and its report is above: lint, render, then every asset
embedded into the configured output (default `slides-embedded.html`) as a
single self-contained file ready to share. The script made every decision.

If the command carried arguments, they are the user's request about the
published deck — checking its size, comparing outputs, verifying something
in it. Relay the report in one line, then address that request.

With no arguments, relay the report — findings, output path, size — and
stop there.

If lint errors stopped it, nothing was published: show each finding with its
line and offer to fix them, then point the user back at `/deck:publish`.

Should the report instead read `[shell command execution disabled by policy]`,
this session runs with `disableSkillShellExecution` set. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs" --publish` with Bash and
relay that output — the publish is idempotent, so running it is safe either
way.
