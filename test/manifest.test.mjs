// @ts-check
// Scope: what `claude plugin validate --strict` cannot see. The CLI already
// owns YAML validity and `description` presence (verified empirically,
// 2026-07-26); it passes silently on a missing skill directory, a `name` that
// disagrees with its directory, and a misspelled key such as
// `disable-model-invokation` — which would leave the invocation gate dead.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/** The shipped subtree. Everything outside it is development-only. */
const pluginRoot = fileURLToPath(new URL('../plugin', import.meta.url))

/** Skills carrying a phase of the pipeline (framework.md §1). */
const PHASE_SKILLS = ['ideate', 'media', 'plan', 'publish']

/** Shared background that every phase skill points at, whichever runs first. */
const SHARED_SKILL = 'pipeline'

const SKILLS = [...PHASE_SKILLS, SHARED_SKILL].sort()

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

test('every phase skill loads the shared background first', () => {
  for (const skill of PHASE_SKILLS) {
    const { body } = readSkill(skill)
    assert.match(
      body,
      new RegExp(`\`deck:${SHARED_SKILL}\``),
      `${skill}: asks for the deck:${SHARED_SKILL} skill, so whichever phase runs first loads it`,
    )
  }
})

test('the shared skill is model-invocable, unlike the phase gates', () => {
  const { frontmatter } = readSkill(SHARED_SKILL)
  assert.notEqual(
    frontmatter['disable-model-invocation'],
    true,
    'the phases are deliberate gates; shared knowledge is something the model may reach for',
  )
})

test('the shared skill explains what a phase skill would otherwise restate', () => {
  const { body } = readSkill(SHARED_SKILL)
  /** @type {[string, RegExp][]} */
  const topics = [
    ['the four phases', /\/deck:ideate/],
    ['the ## Slides anchor', /## Slides/],
    ['the heading budget', /H4 → H2/],
    ['the deck: sections', /deck: Media/],
    ['--lint severities', /warnings exit 0/],
    ['--status and its buckets', /buckets/],
    ['every media state', /handoff/],
    ['handoff being explicit', /never inferred/],
  ]
  for (const [topic, pattern] of topics) {
    assert.match(body, pattern, `the shared skill covers ${topic}`)
  }
})

test('every plugin path a skill mentions resolves in the shipped subtree', () => {
  for (const skill of SKILLS) {
    const source = readFileSync(join(pluginRoot, 'skills', skill, 'SKILL.md'), 'utf8')
    for (const [, path] of source.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s`"')]+)/g)) {
      assert.ok(
        existsSync(join(pluginRoot, path)),
        `${skill}: points at ${path}, which does not ship`,
      )
    }
  }
})

test('skill frontmatter is well-formed', () => {
  for (const skill of SKILLS) {
    const { frontmatter, body } = readSkill(skill)

    assert.equal(frontmatter.name, skill, `${skill}: frontmatter name matches the directory`)
    assert.equal(typeof frontmatter.description, 'string', `${skill}: has a description`)
    assert.ok(frontmatter.description.trim().length > 0, `${skill}: description is not blank`)
    if (PHASE_SKILLS.includes(skill)) {
      assert.equal(
        frontmatter['disable-model-invocation'],
        true,
        `${skill}: the phases are user-triggered gates (a boolean true, not a string)`,
      )
    }
    assert.ok(body.trim().length > 0, `${skill}: has a body`)

    for (const key of Object.keys(frontmatter)) {
      assert.ok(KNOWN_KEYS.has(key), `${skill}: unrecognized frontmatter key "${key}"`)
    }
  }
})
