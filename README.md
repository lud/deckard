# Deckard

A Claude Code plugin for building presentations: from raw source material to a
self-contained, shareable Marp deck, through four deliberate phases —
`/deck:ideate`, `/deck:plan`, `/deck:media`, `/deck:publish`. The first
command you run scaffolds the project, and a hook re-renders the deck as you
edit it. One markdown file is the source of truth; everything else is
generated.

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

## Workflow

A deck goes through four commands. Each one opens a phase: you run it once to
enter that phase, then work in conversation with Claude until you are happy
with the result.

| Step | Command | You bring | You get |
|------|---------|-----------|---------|
| 1 | `/deck:ideate` | source material in `data/` | `notes.md` — the vision for the talk |
| 2 | `/deck:plan` | the settled notes | `presentation.md` — narrative and slides |
| 3 | `/deck:media` | the slides | a visual, or a capture directive, per slide |
| 4 | `/deck:publish` | the finished deck | `slides-embedded.html` — one file to share |

### 1. Ideate — settle what the talk is

Create an empty directory, start Claude in it, and run `/deck:ideate`. The
first run scaffolds the project: a `data/` directory, `notes.md`,
`presentation.md` and `deckard.json`. Drop your source material into `data/`
— survey exports, documents, spreadsheets, rough notes, in any format.

Claude reads everything in `data/`, then discusses the talk with you: its
objective, its audience, the one takeaway, and the topics the material
supports. The discussion is recorded in `notes.md` as it goes, with the
evidence behind each topic and the gaps where evidence is missing. This phase
ends with a vision; slides come in the next one.

### 2. Plan — turn the vision into slides

Run `/deck:plan`. Claude first proposes a narrative — the arc, the ordering
and what gets left out — and refines it with you. Once the narrative holds,
it writes the whole slide set into `presentation.md` in one pass, then you
walk through it together and adjust one slide at a time.

`presentation.md` is the source of truth from here on. Edit it by hand
whenever you like, or ask Claude to make a change.

### 3. Media — decide what each slide shows

Run `/deck:media`. Claude reports which slides still need a visual and works
through them with you one or two at a time, proposing for each a code block,
a diagram or recording, a screenshot for you to capture, or nothing at all.
Each decision is recorded on the slide, so the backlog is always accurate.

- `/deck:media status` prints the backlog and stops there.
- `/deck:media <slide title>` works on a single slide.

Captures only you can make — a real screenshot, a photograph — are written
down as precise directives. Capture the file, add it to the project, and
tell Claude: it places the image on the slide and closes it.

### 4. Publish — produce the shareable file

Run `/deck:publish`. It checks the deck, renders it, and embeds every image
and font into `slides-embedded.html`, a single file you can email or host
anywhere. Add a request after the command to have Claude look at the result:
`/deck:publish check it stays under 5 MB`.

### While you work

- **The preview is always current.** Whenever a turn changes the deck or its
  theme, Deckard re-renders `slides.html` at the project root and says so in
  one line. Keep it open in a browser and refresh. Media files are loaded
  from disk, so replacing an image or recording shows up on refresh too.
- **Problems are reported as they appear.** When an edit breaks the deck,
  you get a one-line notice at the end of the turn, and Claude receives the
  full detail with your next message — asking it to fix the deck is enough.
- **Ask for a health check any time.** "Is the deck sound?" has Claude lint
  the source and report every finding, including warnings such as media
  files that no slide references.
- **Phases loop back.** A change of direction after planning is normal: run
  `/deck:ideate` again to rework the vision, then `/deck:plan` to reconcile
  the slides with it. Existing slides are revised in place, and Claude tells
  you which ones changed.
- **Start where your material is.** With notes already written, begin at
  `/deck:plan`; it scaffolds the project the same way.

## Running Deckard alongside your other projects

It is fine to keep Deckard enabled everywhere. The plugin registers two hooks
(a `Stop` hook that keeps the rendered deck current, and a `UserPromptSubmit`
hook that briefs the agent when an automatic build failed), and hooks run in
every project where a plugin is enabled — but both are gated on the presence
of a **`deckard.json`** file at the project root, the marker `/deck:ideate`
scaffolds. In any project without it, each hook is a silent no-op costing
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
