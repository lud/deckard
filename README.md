# Deckard

A Claude Code plugin for building presentations: from raw source material to a
self-contained, shareable Marp deck, through four deliberate phases —
`/deck:ideate`, `/deck:plan`, `/deck:media`, `/deck:build` (plus `/deck:init`
to scaffold a project). One markdown file is the source of truth; everything
else is generated.

> Status: under development. Installation and quickstart docs land with the
> first release; until then, load it with
> `claude --plugin-dir /path/to/deckard/plugin`.

## Requirements

- **Node ≥ 22** — the plugin's scripts are zero-dependency `.mjs`; nothing is
  installed into your project.
- **A Marp CLI** (`@marp-team/marp-cli`, verified against 4.5.0) for
  rendering. Deckard locates an installed one — via `marpCommand` in
  `deckard.json`, your `PATH`, or the project's `node_modules/.bin` — and
  never downloads anything itself.

## Running Deckard alongside your other projects

It is fine to keep Deckard enabled everywhere. The plugin registers two hooks
(a `Stop` hook that keeps the rendered deck current, and a `UserPromptSubmit`
hook that briefs the agent when an automatic build failed), and hooks run in
every project where a plugin is enabled — but both are gated on the presence
of a **`deckard.json`** file at the project root, the marker `/deck:init`
creates. In any project without it, each hook is a silent no-op costing
around 30 ms; it reads nothing, writes nothing, and prints nothing.

### Enabling and disabling the plugin on the fly

If you'd rather not have the hooks fire at all outside presentation work, you
can toggle the plugin without uninstalling it:

- **In a session:** run `/plugin`, open the **Installed** tab, select the
  plugin, and use **Enable** / **Disable**. Run `/reload-plugins` afterwards
  to apply the change to the running session.
- **From the shell:**

  ```sh
  claude plugin disable deck
  claude plugin enable deck
  ```

  Both accept `--scope user|project|local`, so you can, for example, disable
  it user-wide and re-enable it only in the projects that use it (the
  `project` scope writes `.claude/settings.json`, which you can commit; the
  `local` scope stays out of version control).
- **In settings files:** enablement is recorded under the `enabledPlugins`
  key of your user, project, or local settings — see the
  [Claude Code settings documentation](https://code.claude.com/docs/en/settings)
  for the precise shape. Settings changes take effect without restarting.
