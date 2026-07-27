// @ts-check
// The UserPromptSubmit hook: the model-facing half of autobuild's reporting.
//
// The Stop hook speaks to the user only — anything it told the model would end
// a turn, fire the Stop hook again, and rest convergence on a fingerprint of
// files anything on disk can touch (a symlink from the source into the build
// output would change it every turn). This hook runs when the user submits a
// prompt, which nothing here can cause, so its bound is structural: at most
// one injection per user prompt, whatever happens on disk.
//
// It fires on every prompt in every project, so the fast path is two stat
// calls — no deckard.json, or no flag from the Stop hook — and it exits
// silently. When the flag is present it is consumed *first* (a crash below
// cannot repeat the report), then everything cheap is re-checked: lint, kit,
// renderer. A deck fixed between turns therefore produces silence, not a stale
// alarm. Only a failure that cannot be re-derived without rendering (a Marp
// crash) is relayed verbatim from the flag's recorded message.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILE, readConfig } from './lib/config.mjs'
import { countErrors, formatFindings, lintDeck } from './lib/deck-lint.mjs'
import { parseDeck } from './lib/deck-parse.mjs'
import { isEntryPoint } from './lib/entry.mjs'
import { FLAG_FILE, cwdFromStdin } from './lib/hooks.mjs'
import { resolveKit } from './lib/kit.mjs'
import { findMarp, missingMarpMessage } from './lib/marp.mjs'

/** @typedef {{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: string } }} RelayOutput */

/**
 * The only field this hook ever emits. No `decision`, no `systemMessage`: the
 * relay briefs the model, it never blocks a prompt or addresses the user —
 * the Stop hook already gave them their one line at the moment of breakage.
 * @param {string[]} lines
 * @returns {RelayOutput}
 */
const relay = (lines) => ({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
})

const LINT_CLI = fileURLToPath(new URL('./plan-to-slides.mjs', import.meta.url))

/**
 * Decide what the model should hear as its turn starts. Null means nothing.
 * @param {string} cwd
 * @returns {RelayOutput | null}
 */
export function promptRelay(cwd) {
  const project = resolve(cwd)
  if (!existsSync(join(project, CONFIG_FILE))) return null

  let config
  try {
    config = readConfig(project)
  } catch {
    // A config the build rejects reaches the user through the Stop hook; it
    // is the user's file to fix, not something to brief the model on.
    return null
  }

  const flag = join(project, config.outDir, FLAG_FILE)
  if (!existsSync(flag)) return null
  const recorded = readFileSync(flag, 'utf8').trim()
  rmSync(flag, { force: true })

  const sourcePath = join(project, config.source)
  if (!existsSync(sourcePath)) return null

  const findings = lintDeck(parseDeck(readFileSync(sourcePath, 'utf8')), {
    projectDir: project,
    warnings: false,
  })
  if (countErrors(findings) > 0) {
    return relay([
      `The Deckard autobuild hook could not rebuild the deck last turn. A fresh lint of ${config.source} reports:`,
      '',
      formatFindings(findings, config.source).trimEnd(),
      '',
      'The deck will not render until these are fixed. After editing, re-check with:',
      `  node "${LINT_CLI}" --lint`,
    ])
  }

  try {
    resolveKit(config.brandKit, project)
  } catch (error) {
    return relay([
      'The Deckard autobuild hook could not rebuild the deck last turn, and the brand kit still does not resolve:',
      '',
      /** @type {Error} */ (error).message,
    ])
  }

  if (!findMarp({ project, marpCommand: config.marpCommand })) {
    return relay([
      'The Deckard autobuild hook could not re-render the deck last turn: no renderer was found.',
      '',
      missingMarpMessage().trimEnd(),
    ])
  }

  if (recorded) {
    return relay([
      'The Deckard autobuild hook failed last turn:',
      '',
      recorded,
      '',
      `${config.source} lints clean and a renderer is available now, so if the cause above has been addressed, the next edit rebuilds normally.`,
    ])
  }

  // Whatever failed last turn re-checks clean now: say nothing.
  return null
}

if (isEntryPoint(import.meta.url)) {
  // No requireNode() guard, same reason as autobuild: an old runtime should
  // leave the session alone rather than complain once per prompt.
  let output = null
  try {
    output = promptRelay(cwdFromStdin())
  } catch {
    // A broken relay must never get between the user and their prompt.
  }
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
  process.exit(0)
}
