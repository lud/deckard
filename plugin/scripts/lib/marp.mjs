// @ts-check
// Finding the renderer, never fetching it. `npx @marp-team/marp-cli` would
// download and execute ~160 third-party packages behind a permission grant that
// reads as "run one script", with npm's own confirmation suppressed — the same
// supply-chain objection §8 raised against shipping binaries. So Deckard looks
// for a Marp the user already trusts, and explains how to provide one otherwise.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The version Deckard is verified against (§3 Phase 4). */
export const PINNED_MARP = '4.5.0'

/** Where a project-local install puts the binary. */
const LOCAL_BIN = join('node_modules', '.bin', 'marp')

/**
 * @param {string} command
 * @param {string} cwd
 * @returns {string | null} the reported version, or null when unusable
 */
function probe(command, cwd) {
  const result = spawnSync(command, ['--version'], { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) return null
  const match = `${result.stdout ?? ''}`.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : 'unknown'
}

/**
 * Locate a Marp CLI: the configured command, then PATH, then a project-local
 * install.
 * @param {{ project: string, marpCommand?: string | null }} options
 * @returns {{ command: string, version: string, source: string } | null}
 */
export function findMarp({ project, marpCommand }) {
  // Most specific first: an explicit setting, then the version this project
  // pinned for itself, then whatever the machine happens to have. A project
  // that added Marp as a devDependency meant that one.
  /** @type {[string, string][]} */
  const candidates = []
  if (marpCommand) candidates.push([marpCommand, 'deckard.json marpCommand'])
  const local = join(project, LOCAL_BIN)
  if (existsSync(local)) candidates.push([local, 'project node_modules'])
  candidates.push(['marp', 'PATH'])

  for (const [command, source] of candidates) {
    const version = probe(command, project)
    if (version) return { command, version, source }
  }
  return null
}

/**
 * What to tell the model when no renderer is available. Installing software is
 * the user's decision, so the wording asks for it rather than instructing the
 * agent to go ahead.
 * @param {{ hook?: boolean }} [options]
 */
export function missingMarpMessage({ hook = false } = {}) {
  const lines = [
    `No Marp CLI found. Deckard renders with @marp-team/marp-cli (verified against ${PINNED_MARP}).`,
    '',
    'Ask the user to install it, either way round:',
    `  npm i -g @marp-team/marp-cli@${PINNED_MARP}      # available everywhere`,
    `  npm i -D @marp-team/marp-cli@${PINNED_MARP}      # just this project`,
    '',
    'Installing software is the user\'s call. Do not run an install yourself unless',
    'the user has already endorsed installing tooling in this session — if in doubt,',
    'ask first and say what will be installed.',
    '',
    'If the binary is not on PATH once installed, locate it and record the path in',
    'deckard.json so every later build and the autobuild hook can find it:',
    '  { "marpCommand": "/path/to/marp" }',
  ]
  if (hook) {
    lines.push(
      '',
      'This came from the autobuild hook, so the deck was not re-rendered. Nothing',
      'else is wrong with it: resolve the renderer and the next edit rebuilds.',
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * A note when the found version differs from the pin. Informational on purpose:
 * Marp is stable across patch and minor releases, and refusing to render over a
 * version string would be stricter than the risk warrants.
 * @param {string} version
 */
export function versionNote(version) {
  if (version === PINNED_MARP) return null
  return `using marp ${version} (verified against ${PINNED_MARP})`
}
