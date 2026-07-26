// @ts-check
// The explicit build path behind /deck:build: lint, render, publish, report.
// Marp runs at a pinned version — floating on latest contradicts
// reproducibility (§3 Phase 4).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { readConfig } from './lib/config.mjs'
import { countErrors, formatFindings, lintDeck } from './lib/deck-lint.mjs'
import { parseDeck } from './lib/deck-parse.mjs'
import { emitMarp } from './lib/deck-emit.mjs'
import { isEntryPoint, requireNode } from './lib/entry.mjs'
import { findMarp, missingMarpMessage, versionNote } from './lib/marp.mjs'
import { embedFonts } from './embed-fonts.mjs'
import { resolveKit } from './lib/kit.mjs'
import { publish } from './publish.mjs'

// The renderer is located, never downloaded — see lib/marp.mjs for why.
export { PINNED_MARP } from './lib/marp.mjs'

/**
 * @param {{ project: string, skipPublish?: boolean, skipLint?: boolean }} options
 */
export function build({ project, skipPublish = false, skipLint = false }) {
  const config = readConfig(project)
  const sourcePath = join(project, config.source)
  if (!existsSync(sourcePath)) {
    throw new Error(`${config.source} not found in ${project}. Run /deck:init to scaffold a project.`)
  }

  const outDir = join(project, config.outDir)
  mkdirSync(outDir, { recursive: true })

  const deck = parseDeck(readFileSync(sourcePath, 'utf8'))
  const findings = skipLint ? [] : lintDeck(deck, { projectDir: project })
  const errors = countErrors(findings)
  const report = [formatFindings(findings, config.source).trimEnd()]

  // A deck with errors names something the format cannot express, so rendering
  // it would produce output nobody should trust.
  if (errors > 0) {
    return { ok: false, errors, findings, report: report.join('\n') }
  }

  const slides = join(outDir, 'slides.md')
  writeFileSync(slides, emitMarp(deck, { source: config.source }))

  const kit = resolveKit(config.brandKit, project)
  const theme = join(outDir, 'theme.css')
  const fonts = embedFonts(readFileSync(kit.theme, 'utf8'), kit.dir)
  writeFileSync(theme, fonts.css)

  const renderer = findMarp({ project, marpCommand: config.marpCommand })
  if (!renderer) {
    return { ok: false, errors: 0, findings, report: missingMarpMessage().trimEnd() }
  }
  const note = versionNote(renderer.version)
  if (note) report.push(note)

  const html = join(outDir, 'slides.html')
  const marp = spawnSync(
    renderer.command,
    [slides, '--theme', theme, '--html', '--output', html],
    { cwd: project, encoding: 'utf8' },
  )

  if (marp.status !== 0) {
    throw new Error(`marp exited ${marp.status}:\n${marp.stderr ?? ''}`)
  }

  report.push(
    `rendered ${relative(project, html)} — ${deck.slides.length} slides, ${Math.round(statSync(html).size / 1024)} kB`,
  )
  if (fonts.embedded.length > 0) {
    report.push(`embedded ${fonts.embedded.length} font file(s) into the theme`)
  }

  let published
  if (!skipPublish) {
    published = publish({ project, input: html })
    report.push(
      `published ${relative(project, published.to)} — ${Math.round(published.bytes / 1024)} kB, ${published.inlined.length} asset(s) inlined`,
    )
  }

  return { ok: true, errors: 0, findings, published, html, report: report.join('\n') }
}

if (isEntryPoint(import.meta.url)) {
  requireNode()
  const args = process.argv.slice(2)
  const project = resolve(args.find((arg) => !arg.startsWith('-')) ?? process.cwd())
  const result = build({
    project,
    skipPublish: args.includes('--no-publish'),
    skipLint: args.includes('--no-lint'),
  })
  process.stdout.write(`${result.report}\n`)
  if (!result.ok) {
    process.stderr.write('build stopped: fix the errors above, or re-run with --no-lint\n')
  }
  process.exit(result.ok ? 0 : 1)
}
