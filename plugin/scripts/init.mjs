// @ts-check
// Phase 0 — the deterministic scaffold behind /deck:init. Every existing file
// is left byte-identical, so the command is safe to re-run at any point in a
// project's life.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEntryPoint, requireNode } from './lib/entry.mjs'

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url))

/** Project files laid down from a template, as `[destination, template]`. */
const SCAFFOLD = [
  ['notes.md', 'notes.skeleton.md'],
  ['presentation.md', 'presentation.skeleton.md'],
  ['deckard.json', 'deckard.skeleton.json'],
]

/** The generated Marp intermediary lives here and stays out of git. */
const BUILD_DIR = '.build/'

/**
 * @typedef {'created' | 'skipped' | 'updated'} Action
 * @typedef {{ action: Action, path: string, note?: string }} Entry
 */

/**
 * Lay down the project layout under `target` and report what each path did.
 * @param {string} target
 * @returns {Entry[]}
 */
export function scaffold(target) {
  /** @type {Entry[]} */
  const report = []

  const data = join(target, 'data')
  if (existsSync(data)) {
    report.push({ action: 'skipped', path: 'data/' })
  } else {
    mkdirSync(data, { recursive: true })
    report.push({ action: 'created', path: 'data/', note: 'put your source material here' })
  }

  for (const [name, template] of SCAFFOLD) {
    try {
      // `wx` makes "never overwrite" a property of the syscall rather than of
      // a preceding existence check, which a concurrent writer could outrun.
      writeFileSync(join(target, name), readFileSync(join(TEMPLATES, template), 'utf8'), {
        flag: 'wx',
      })
      report.push({ action: 'created', path: name })
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
      report.push({ action: 'skipped', path: name })
    }
  }

  report.push(ignoreBuildDir(target))
  return report
}

/**
 * Add the build directory to the project's `.gitignore`, keeping whatever is
 * already there.
 * @param {string} target
 * @returns {Entry}
 */
function ignoreBuildDir(target) {
  const dest = join(target, '.gitignore')
  if (!existsSync(dest)) {
    writeFileSync(dest, `${BUILD_DIR}\n`)
    return { action: 'created', path: '.gitignore', note: `+ ${BUILD_DIR}` }
  }

  const current = readFileSync(dest, 'utf8')
  const ignored = current
    .split('\n')
    .some((line) => line.trim().replace(/\/$/, '') === BUILD_DIR.replace(/\/$/, ''))
  if (ignored) return { action: 'skipped', path: '.gitignore' }

  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(dest, `${current}${separator}${BUILD_DIR}\n`)
  return { action: 'updated', path: '.gitignore', note: `+ ${BUILD_DIR}` }
}

/**
 * @param {Entry[]} report
 * @param {string} target
 */
export function format(report, target) {
  const lines = [`Deckard scaffold — ${target}`, '']
  for (const { action, path, note } of report) {
    lines.push(`  ${action.padEnd(8)} ${path}${note ? `  (${note})` : ''}`)
  }
  lines.push('', 'Next: /deck:ideate reads data/ and writes notes.md.')
  return `${lines.join('\n')}\n`
}

if (isEntryPoint(import.meta.url)) {
  requireNode()
  const target = resolve(process.argv[2] ?? process.cwd())
  process.stdout.write(format(scaffold(target), target))
}
