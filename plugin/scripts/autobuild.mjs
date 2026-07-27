// @ts-check
// The Stop hook (§8). It runs at the end of every turn in every project where
// the plugin is enabled, so the fast path — no deckard.json, or a deck nobody
// touched — has to cost almost nothing and print nothing.
//
// Reporting goes through `systemMessage` in JSON on stdout: a hook's plain
// stdout on exit 0 lands in the debug log and is never shown, so a bare
// console.log here would be invisible.
//
// The hook speaks to the user only. It could reach the model too
// (`hookSpecificOutput.additionalContext` arrives at the start of the next
// turn — measured 2026-07-27), but anything that wakes the model makes it end
// another turn, which fires this hook again, and convergence then rests on a
// fingerprint of files on disk that anything can touch: another hook, a
// formatter, the build's own writes into the out dir. One vanished hash file
// was enough to observe the unbounded form live. Staying user-only removes
// that loop class by construction; the model learns about breakage from the
// `--lint` habit the pipeline skill gives it, at the moment it can act.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { build } from './build.mjs'
import { CONFIG_FILE, readConfig } from './lib/config.mjs'
import { isEntryPoint } from './lib/entry.mjs'
import { severityOf } from './lib/deck-lint.mjs'
import { resolveKit } from './lib/kit.mjs'
import { PINNED_MARP } from './lib/marp.mjs'

const HASH_FILE = 'last-build.hash'

/** @typedef {{ systemMessage: string }} HookOutput */

/**
 * What the rendered deck depends on: the source, and the theme it is rendered
 * with. A change to either is a reason to rebuild; anything else on a turn is
 * not.
 * @param {string} project
 * @param {{ source: string, brandKit: string }} config
 * @returns {string | null} null when the source is missing
 */
export function fingerprint(project, config) {
  const sourcePath = join(project, config.source)
  if (!existsSync(sourcePath)) return null

  const hash = createHash('sha256').update(readFileSync(sourcePath))
  try {
    hash.update(readFileSync(resolveKit(config.brandKit, project).theme))
  } catch {
    // An unresolvable kit is the build's problem to report, not the hash's.
    hash.update('no-theme')
  }
  return hash.digest('hex')
}

/**
 * @param {string} project
 * @param {string} outDir
 * @returns {string | null}
 */
function lastFingerprint(project, outDir) {
  const path = join(project, outDir, HASH_FILE)
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null
}

/**
 * Decide and act. Returns the message to show the user, or null for silence.
 * @param {string} cwd
 * @returns {HookOutput | null}
 */
export function autobuild(cwd) {
  const project = resolve(cwd)

  // Not a Deckard project: the common case in most sessions, and the reason
  // this check comes before anything else.
  if (!existsSync(join(project, CONFIG_FILE))) return null

  const config = readConfig(project)
  const current = fingerprint(project, config)
  if (current === null) return null

  // A turn that left the deck alone rebuilds nothing and says nothing.
  if (current === lastFingerprint(project, config.outDir)) return null

  // Recorded before the outcome is known, so the file marks the last *attempt*
  // rather than the last success. An unchanged broken deck then stays silent —
  // the report fires once per change, never once per turn — and nothing about
  // an unchanged deck deserves a second render anyway.
  mkdirSync(join(project, config.outDir), { recursive: true })
  writeFileSync(join(project, config.outDir, HASH_FILE), `${current}\n`)

  const result = build({ project, skipPublish: true, warnings: false })

  if (result.noRenderer) {
    return {
      systemMessage: `deckard: no Marp CLI found — install @marp-team/marp-cli@${PINNED_MARP}, or set "marpCommand" in ${CONFIG_FILE}`,
    }
  }

  if (!result.ok) {
    // One error names itself; several are worth a look in one place.
    const first = result.findings?.find((finding) => severityOf(finding.code) === 'error')
    const detail =
      result.errors === 1 && first
        ? `${config.source}:${first.line} ${first.code}`
        : `${result.errors} errors in ${config.source}`
    return { systemMessage: `deckard: ${detail} — run /deck:build for detail` }
  }

  const where = relative(project, result.html ?? '')
  return { systemMessage: `deckard: rebuilt ${where} — ${result.slides} slides` }
}

/** Stop hooks receive their JSON on stdin; `cwd` is the project. */
function cwdFromStdin() {
  try {
    const input = readFileSync(0, 'utf8')
    const parsed = JSON.parse(input)
    if (typeof parsed?.cwd === 'string') return parsed.cwd
  } catch {
    // No stdin, or not JSON: the process cwd is the next best answer.
  }
  return process.cwd()
}

if (isEntryPoint(import.meta.url)) {
  // No requireNode() guard here: an old runtime should leave the session alone
  // rather than report a version complaint on every turn. /deck:build is where
  // that gets said.
  let output = null
  try {
    output = autobuild(cwdFromStdin())
  } catch (error) {
    output = {
      systemMessage: `deckard: autobuild failed — ${/** @type {Error} */ (error).message}`,
    }
  }
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
  process.exit(0)
}
