// @ts-check
// /deck:publish without a model turn. A UserPromptExpansion hook intercepts
// the command by name (the payload's command_name is the namespaced
// "deck:publish" — probed 2026-07-27), this script runs the deterministic
// publish, and `decision: "block"` stops the expansion: no skill loads, no
// model runs, and the report reaches the user as the block reason.
//
// Arguments are the escape hatch back to the model: a bare `/deck:publish`
// is fully handled here, while `/deck:publish check it stays under 500kb`
// expands normally — the skill's bang command runs the same build, and the
// model starts its turn with the report in context to answer the request.
//
// Layering: if this hook cannot run (older CLI without the event, hooks
// disabled by policy), the command expands normally and the publish skill's
// bang command performs the identical build — so every path publishes once.
// stdout must carry only the JSON object; exit 0 is what makes it count.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from './build.mjs'
import { CONFIG_FILE } from './lib/config.mjs'
import { isEntryPoint } from './lib/entry.mjs'
import { PINNED_MARP } from './lib/marp.mjs'

/** @param {string} reason @returns {{ decision: 'block', reason: string }} */
const block = (reason) => ({ decision: 'block', reason })

/**
 * Decide between handling the command here (no arguments: publish, block,
 * zero turns) and standing aside (arguments: the user wants the model, and
 * the skill's bang command will publish on the way in).
 * @param {string} cwd
 * @param {string} [commandArgs]
 */
export function publishCommand(cwd, commandArgs = '') {
  if (commandArgs.trim() !== '') return null

  const project = resolve(cwd)
  try {
    const result = build({ project, publish: true })
    if (result.noRenderer) {
      return block(
        `deckard: no Marp CLI found — install @marp-team/marp-cli@${PINNED_MARP}, or set "marpCommand" in ${CONFIG_FILE}`,
      )
    }
    if (!result.ok) {
      return block(`deckard: nothing published — the deck has errors\n\n${result.report}`)
    }
    return block(result.report)
  } catch (error) {
    return block(`deckard: publish failed — ${/** @type {Error} */ (error).message}`)
  }
}

if (isEntryPoint(import.meta.url)) {
  /** @type {{ cwd?: unknown, command_args?: unknown }} */
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    // No stdin, or not JSON: fall back to the process cwd, no arguments.
  }
  const output = publishCommand(
    typeof payload.cwd === 'string' ? payload.cwd : process.cwd(),
    typeof payload.command_args === 'string' ? payload.command_args : '',
  )
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
  process.exit(0)
}
