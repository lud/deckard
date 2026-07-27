// @ts-check
// Fix 5.5, on the same parse tree the transform emits from. Findings carry a
// line number so a hand edit that the format cannot express is reported where
// it was made, never quietly dropped (§5.1).
import { existsSync, readdirSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { MARP_DIRECTIVES, findSection, metaValue, slideAssets } from './deck-parse.mjs'

/** Directories scanned for produced media that no slide references. */
export const MEDIA_DIRS = ['output', 'assets']

/**
 * Findings that report on the deck's surroundings rather than on something the
 * transform cannot express. They are worth surfacing and never worth failing a
 * build over: producing media leaves alternates behind — a GIF and a still of
 * the same moment, three takes of one capture — and only the author knows which
 * ones still matter. Everything else is an error.
 */
export const WARNINGS = new Set(['orphaned-asset'])

/** @param {string} code */
export function severityOf(code) {
  return WARNINGS.has(code) ? 'warning' : 'error'
}

/** @param {{ code: string }[]} findings */
export function countErrors(findings) {
  return findings.filter((finding) => severityOf(finding.code) === 'error').length
}

/**
 * @param {string} dir
 * @param {string} projectDir
 * @returns {string[]} project-relative paths, in posix form
 */
function filesUnder(dir, projectDir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(projectDir, join(entry.parentPath ?? dir, entry.name)).split(sep).join(posix.sep))
}

/**
 * @param {{ title: string | null, slides: import('./deck-parse.mjs').Slide[], findings: import('./deck-parse.mjs').Finding[] }} deck
 * @param {{ projectDir: string, warnings?: boolean }} options
 */
export function lintDeck(deck, { projectDir, warnings = true }) {
  const findings = [...deck.findings]
  /** @type {Set<string>} */
  const referenced = new Set()

  /**
   * @param {string} code
   * @param {number} line
   * @param {string} message
   */
  const flag = (code, line, message) => findings.push({ code, line, message })

  for (const slide of deck.slides) {
    const state = metaValue(slide, 'media')
    const media = findSection(slide, 'media')

    for (const asset of slideAssets(slide)) {
      referenced.add(asset.path)
      if (!existsSync(join(projectDir, asset.path))) {
        flag('missing-asset', asset.line, `"${asset.path}" is referenced but not on disk`)
      }
    }

    // §5.5 coherence: intent and state have to agree, in both directions.
    if (media && (state === 'done' || state === 'none')) {
      flag(
        'stale-media-section',
        media.line,
        `"deck: Media" remains on a slide marked media: ${state} — its intent is spent`,
      )
    }
    if (!media && (state === 'pending' || state === 'handoff')) {
      flag(
        'missing-media-directive',
        slide.line,
        `media: ${state} without a "deck: Media" section — nothing says what to produce`,
      )
    }

    const notes = findSection(slide, 'notes')
    for (const entry of notes?.lines ?? []) {
      const key = entry.text.match(/^([A-Za-z][\w-]*):\s/)
      if (key && MARP_DIRECTIVES.has(key[1])) {
        flag(
          'note-directive-collision',
          entry.line,
          `the note opens with "${key[1]}:", which Marp reads as a directive rather than a note — reword it`,
        )
      }
    }
  }

  // Skipping warnings also skips the only filesystem walk in here, which is
  // what lets the autobuild hook run on every turn for free.
  for (const dir of warnings ? MEDIA_DIRS : []) {
    for (const path of filesUnder(join(projectDir, dir), projectDir)) {
      if (!referenced.has(path)) {
        flag('orphaned-asset', 0, `"${path}" is on disk but no slide references it`)
      }
    }
  }

  findings.sort((a, b) => a.line - b.line)
  return findings
}

/**
 * @param {import('./deck-parse.mjs').Finding[]} findings
 * @param {string} source
 */
export function formatFindings(findings, source) {
  if (findings.length === 0) return `${source}: lints clean\n`

  const errors = countErrors(findings)
  const warnings = findings.length - errors
  const summary = [
    errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : null,
    warnings > 0 ? `${warnings} warning${warnings === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const lines = findings.map(
    ({ line, code, message }) =>
      `  ${source}:${line || '-'}  ${severityOf(code).padEnd(7)}  ${code}  ${message}`,
  )
  return `${summary}:\n${lines.join('\n')}\n`
}
