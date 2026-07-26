// @ts-check
// presentation.md → .build/slides.md (§4), plus the two read-only modes that
// share the same parse: --lint (fix 5.5) and --status (media state for /media).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readConfig } from './lib/config.mjs'
import { emitMarp } from './lib/deck-emit.mjs'
import { countErrors, formatFindings, lintDeck } from './lib/deck-lint.mjs'
import { findSection, metaValue, parseDeck, slideAssets } from './lib/deck-parse.mjs'
import { isEntryPoint, requireNode } from './lib/entry.mjs'

/**
 * Per-slide media state for `/deck:media`, bucketed here so the skill reads
 * the numbers instead of re-deriving them from prose (§3 P3).
 * @param {{ slides: import('./lib/deck-parse.mjs').Slide[] }} deck
 * @param {string} source
 */
export function statusReport(deck, source) {
  /** @type {Record<string, string[]>} */
  const buckets = { missing: [], pending: [], handoff: [], none: [], done: [] }
  const slides = deck.slides.map((slide) => {
    const mediaState = metaValue(slide, 'media')
    buckets[mediaState ?? 'missing'].push(slide.title)
    return {
      title: slide.title,
      line: slide.line,
      mediaState,
      mediaSection: Boolean(findSection(slide, 'media')),
      assets: slideAssets(slide).map((asset) => asset.path),
    }
  })
  return { source, slides, buckets }
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const options = {
    /** @type {'transform' | 'lint' | 'status'} */
    mode: 'transform',
    project: process.cwd(),
    /** @type {string | null} */
    source: null,
    /** @type {string | null} */
    out: null,
  }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--lint') options.mode = 'lint'
    else if (arg === '--status') options.mode = 'status'
    else if (arg === '--project') options.project = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (!arg.startsWith('-')) options.source = arg
    else throw new Error(`unknown option "${arg}"`)
  }
  return options
}

/** @param {ReturnType<typeof parseArgs>} options */
export function run(options) {
  const project = resolve(options.project)
  const config = readConfig(project)
  const source = options.source ?? config.source
  const sourcePath = join(project, source)

  if (!existsSync(sourcePath)) {
    return {
      code: 1,
      stderr: `${source} not found in ${project}. Run /deck:init to scaffold a project.\n`,
    }
  }

  const deck = parseDeck(readFileSync(sourcePath, 'utf8'))

  if (options.mode === 'status') {
    return { code: 0, stdout: `${JSON.stringify(statusReport(deck, source), null, 2)}\n` }
  }

  if (options.mode === 'lint') {
    const findings = lintDeck(deck, { projectDir: project })
    // Warnings report on the deck's surroundings, so they never fail the run.
    return {
      code: countErrors(findings) > 0 ? 1 : 0,
      stdout: formatFindings(findings, source),
    }
  }

  const out = options.out ?? join(project, config.outDir, 'slides.md')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, emitMarp(deck, { source }))

  const slides = deck.slides.length
  const report = `wrote ${out} — ${slides} slide${slides === 1 ? '' : 's'}\n`
  // Parse findings surface even here: the transform reports what it could not
  // express rather than dropping it quietly (§5.1). --lint is the full check.
  const unexpressed = deck.findings.length
  return {
    code: 0,
    stdout: report,
    stderr:
      unexpressed > 0
        ? `${unexpressed} parse finding${unexpressed === 1 ? '' : 's'} — run with --lint for detail\n`
        : undefined,
  }
}

if (isEntryPoint(import.meta.url)) {
  requireNode()
  const result = run(parseArgs(process.argv.slice(2)))
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.code)
}
