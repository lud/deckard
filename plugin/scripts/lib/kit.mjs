// @ts-check
// Brand kits are directories with a fixed contract (§8): theme.css is
// required, fonts/ and kit.md are optional.
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Kits shipped with the plugin. */
const BUNDLED = fileURLToPath(new URL('../../brand-kits/', import.meta.url))

/**
 * Resolve a `brandKit` value to a directory. A bare name selects a bundled kit;
 * anything path-shaped resolves against the project (§8).
 * @param {string} brandKit
 * @param {string} projectDir
 */
export function kitDir(brandKit, projectDir) {
  const pathShaped = brandKit.includes('/') || brandKit.includes(sep) || brandKit.startsWith('.')
  return pathShaped && !isAbsolute(brandKit)
    ? resolve(projectDir, brandKit)
    : isAbsolute(brandKit)
      ? brandKit
      : join(BUNDLED, brandKit)
}

/**
 * The kit's directory and theme, with a message naming what to fix when the
 * contract is not met.
 * @param {string} brandKit
 * @param {string} projectDir
 */
export function resolveKit(brandKit, projectDir) {
  const dir = kitDir(brandKit, projectDir)
  if (!existsSync(dir)) {
    throw new Error(
      `brand kit "${brandKit}" not found at ${dir}. Set "brandKit" in deckard.json to a bundled kit name or a path inside the project.`,
    )
  }
  const theme = join(dir, 'theme.css')
  if (!existsSync(theme)) {
    throw new Error(`brand kit "${brandKit}" has no theme.css (${theme}). Every kit needs one.`)
  }
  return { dir, theme, fonts: join(dir, 'fonts'), notes: join(dir, 'kit.md') }
}
