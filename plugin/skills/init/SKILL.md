---
name: init
description: Scaffold a Deckard presentation project — creates data/, notes.md, presentation.md and deckard.json, leaving any file that already exists untouched.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs")
---

# /deck:init

Make sure the `deck:pipeline` knowledge skill is loaded.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"`

The scaffold has run and its report is above. Relay it: which paths were
created, which were left as they were, and the next step it suggests. The
script makes every decision here, so report what it did and stop there.

Should the report instead read `[shell command execution disabled by policy]`,
this session runs with `disableSkillShellExecution` set. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"` with Bash and relay that
output — the scaffold is idempotent, so running it is safe either way.
