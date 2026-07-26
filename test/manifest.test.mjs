// @ts-check
// Scope: what `claude plugin validate --strict` cannot see. The CLI already
// owns YAML validity and `description` presence (verified empirically,
// 2026-07-26); it passes silently on a missing skill directory, a `name` that
// disagrees with its directory, and a misspelled key such as
// `disable-model-invokation` — which would leave the invocation gate dead.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/** The shipped subtree. Everything outside it is development-only. */
const pluginRoot = fileURLToPath(new URL('../plugin', import.meta.url))

/** Skills carrying a phase of the pipeline (framework.md §1). */
const SKILLS = ['build', 'ideate', 'init', 'media', 'plan']

/** Frontmatter keys this repo deliberately uses; anything else is a typo. */
const KNOWN_KEYS = new Set([
  'name',
  'description',
  'disable-model-invocation',
  'allowed-tools',
  'argument-hint',
])

/** @param {string} skill */
function readSkill(skill) {
  const source = readFileSync(join(pluginRoot, 'skills', skill, 'SKILL.md'), 'utf8')
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(match, `${skill}: SKILL.md opens with a frontmatter block`)
  return { frontmatter: parse(match[1]), body: match[2] }
}

test('manifest parses and carries the branding contract', () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'))
  assert.equal(manifest.name, 'deck', 'the manifest name is the /deck: command prefix')
  assert.equal(manifest.displayName, 'Deckard')
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.ok(manifest.description.length > 0)
})

test('every pipeline phase has a skill directory', () => {
  const found = readdirSync(join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(found, SKILLS)
})

test('skill frontmatter is well-formed', () => {
  for (const skill of SKILLS) {
    const { frontmatter, body } = readSkill(skill)

    assert.equal(frontmatter.name, skill, `${skill}: frontmatter name matches the directory`)
    assert.equal(typeof frontmatter.description, 'string', `${skill}: has a description`)
    assert.ok(frontmatter.description.trim().length > 0, `${skill}: description is not blank`)
    assert.equal(
      frontmatter['disable-model-invocation'],
      true,
      `${skill}: the phases are user-triggered gates (a boolean true, not a string)`,
    )
    assert.ok(body.trim().length > 0, `${skill}: has a body`)

    for (const key of Object.keys(frontmatter)) {
      assert.ok(KNOWN_KEYS.has(key), `${skill}: unrecognized frontmatter key "${key}"`)
    }
  }
})
