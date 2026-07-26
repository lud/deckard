# Deckard development rules

## Tests & Checks

Anything that can be tested, formatted or statically verified should be so by a recipe in the `justfile` and that recipe alias added to the bottome `check` recipe. `just check` become the local CI pipeline.

## Plugin Development

Changes to the plugin lifecycle (ideation, planning, etc) must be reflected in the `plugin/skills/pipeline/SKILL.md` skill.