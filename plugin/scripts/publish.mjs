// @ts-check
// Publish = build output → one self-contained file. The substitution is
// literal: each asset path the source references is replaced wherever it
// appears in the rendered HTML. Running a document converter over already
// rendered Marp output re-parses and mangles the player (§3 Phase 4), so this
// never parses the HTML at all.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { RENDER_FILE, readConfig } from './lib/config.mjs'
import { parseDeck, slideAssets } from './lib/deck-parse.mjs'
import { isEntryPoint, requireNode } from './lib/entry.mjs'

/** @type {Record<string, string>} */
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function dataUri(path) {
  const extension = path.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME[extension]
  if (!mime) return null
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

/**
 * Replace every occurrence of each asset path with its data URI. The render
 * sits at the project root, so the HTML carries the paths exactly as the
 * source wrote them.
 * @param {string} html
 * @param {string[]} assets project-relative paths, as written in the source
 * @param {string} projectDir
 */
export function inlineAssets(html, assets, projectDir) {
  /** @type {string[]} */
  const inlined = []
  /** @type {string[]} */
  const skipped = []
  let out = html

  // Longest first, so "output/demo.gif" is never partly matched by a path that
  // is a prefix of it.
  for (const asset of [...new Set(assets)].sort((a, b) => b.length - a.length)) {
    const file = join(projectDir, asset)
    if (!existsSync(file)) {
      skipped.push(asset)
      continue
    }
    const uri = dataUri(file)
    if (!uri) {
      skipped.push(asset)
      continue
    }
    if (!out.includes(asset)) {
      skipped.push(asset)
      continue
    }
    out = out.split(asset).join(uri)
    inlined.push(asset)
  }

  return { html: out, inlined, skipped }
}

/**
 * @param {{ project: string, input?: string, output?: string }} options
 */
export function publish({ project, input, output }) {
  const config = readConfig(project)
  const source = join(project, config.source)
  const from = input ?? join(project, RENDER_FILE)
  const to = output ?? join(project, config.publish)

  if (!existsSync(from)) {
    throw new Error(`${from} not found. Run the build first.`)
  }

  const deck = parseDeck(readFileSync(source, 'utf8'))
  const assets = deck.slides.flatMap((slide) => slideAssets(slide).map((asset) => asset.path))
  const result = inlineAssets(readFileSync(from, 'utf8'), assets, project)

  writeFileSync(to, result.html)
  return { ...result, to, bytes: statSync(to).size }
}

if (isEntryPoint(import.meta.url)) {
  requireNode()
  const result = publish({ project: resolve(process.argv[2] ?? process.cwd()) })
  const kb = Math.round(result.bytes / 1024)
  process.stdout.write(
    `wrote ${result.to} — ${kb} kB, ${result.inlined.length} asset${result.inlined.length === 1 ? '' : 's'} inlined\n`,
  )
  if (result.skipped.length > 0) {
    process.stderr.write(`not inlined: ${result.skipped.join(', ')}\n`)
  }
}
