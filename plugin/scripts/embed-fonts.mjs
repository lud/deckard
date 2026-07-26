// @ts-check
// Fonts embed at the theme layer (§4): Marp inlines the theme verbatim, so a
// theme whose url() references are data URIs makes the published deck
// self-contained with no change to the publish step.
//
// Substitution targets the url() references a kit author already wrote, rather
// than synthesising @font-face rules from filenames — the kit keeps full
// control of family names, weights and unicode-range, and no naming convention
// has to be invented or remembered.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readConfig } from './lib/config.mjs'
import { isEntryPoint, requireNode } from './lib/entry.mjs'
import { resolveKit } from './lib/kit.mjs'

/** @type {Record<string, string>} */
const MIME = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  svg: 'image/svg+xml',
}

const URL_REF = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g

/**
 * Inline every local `url()` reference in a stylesheet as a data URI.
 * @param {string} css
 * @param {string} baseDir directory the references are relative to
 * @returns {{ css: string, embedded: string[], missing: string[] }}
 */
export function embedFonts(css, baseDir) {
  /** @type {string[]} */
  const embedded = []
  /** @type {string[]} */
  const missing = []

  const out = css.replace(URL_REF, (match, _quote, reference) => {
    if (/^(https?:|data:|#)/.test(reference)) return match

    const [path] = reference.split(/[?#]/)
    const file = resolve(baseDir, path)
    if (!existsSync(file)) {
      missing.push(path)
      return match
    }

    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[extension]
    if (!mime) {
      missing.push(path)
      return match
    }

    embedded.push(path)
    return `url(data:${mime};base64,${readFileSync(file).toString('base64')})`
  })

  return { css: out, embedded, missing }
}

if (isEntryPoint(import.meta.url)) {
  requireNode()
  const project = resolve(process.argv[2] ?? process.cwd())
  const config = readConfig(project)
  const kit = resolveKit(config.brandKit, project)

  const result = embedFonts(readFileSync(kit.theme, 'utf8'), dirname(kit.theme))
  const out = join(project, config.outDir, 'theme.css')
  writeFileSync(out, result.css)

  process.stdout.write(
    `wrote ${out} — ${result.embedded.length} font${result.embedded.length === 1 ? '' : 's'} embedded\n`,
  )
  if (result.missing.length > 0) {
    process.stderr.write(`left as-is (not found or unknown type): ${result.missing.join(', ')}\n`)
  }
}
