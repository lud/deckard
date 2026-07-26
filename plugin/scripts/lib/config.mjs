// @ts-check
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every `deckard.json` field, with the default applied when it is absent. */
export const DEFAULTS = {
  brandKit: 'default',
  source: 'presentation.md',
  captureTool: 'vhs',
  outDir: '.build',
  publish: 'slides.html',
  marpVersion: '4.5.0',
}

export const CONFIG_FILE = 'deckard.json'

/**
 * Read a project's config, filling in defaults. The file's presence is what
 * marks a directory as a Deckard project, so an absent file yields defaults
 * and `present: false` rather than an error.
 * @param {string} projectDir
 */
export function readConfig(projectDir) {
  const path = join(projectDir, CONFIG_FILE)
  if (!existsSync(path)) return { ...DEFAULTS, present: false }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${/** @type {Error} */ (error).message}`)
  }

  const unknown = Object.keys(parsed).filter((key) => !(key in DEFAULTS))
  return { ...DEFAULTS, ...parsed, present: true, unknownKeys: unknown }
}
