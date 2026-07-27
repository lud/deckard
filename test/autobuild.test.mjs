// @ts-check
// The hook runs at the end of every turn in every project, so what matters most
// is the two paths that must cost nothing and say nothing. The rebuild path
// itself renders through Marp and is verified end-to-end, not here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { autobuild, fingerprint } from '../plugin/scripts/autobuild.mjs'
import { DEFAULTS } from '../plugin/scripts/lib/config.mjs'

const DECK = ['# D', '', '## Slides', '', '### One', '<!--', 'media: none', '-->', '', 'Body.'].join('\n')

/** @param {{ deck?: string, config?: object | null }} [options] */
function project({ deck = DECK, config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deckard-hook-'))
  writeFileSync(join(dir, 'presentation.md'), deck)
  if (config) writeFileSync(join(dir, 'deckard.json'), JSON.stringify(config))
  return dir
}

test('a project without deckard.json is left entirely alone', () => {
  const dir = project({ config: null })
  assert.equal(autobuild(dir), null, 'the marker file is what makes a project ours')
})

test('a project whose deck has not changed rebuilds nothing', () => {
  const dir = project()
  const current = fingerprint(dir, DEFAULTS)
  assert.ok(current)
  mkdirSync(join(dir, DEFAULTS.outDir), { recursive: true })
  writeFileSync(join(dir, DEFAULTS.outDir, 'last-build.hash'), `${current}\n`)

  assert.equal(autobuild(dir), null, 'a quiet turn costs nothing and says nothing')
})

test('the fingerprint follows the source', () => {
  const dir = project()
  const before = fingerprint(dir, DEFAULTS)
  writeFileSync(join(dir, 'presentation.md'), `${DECK}\n\n### Two\n\nMore.\n`)
  assert.notEqual(fingerprint(dir, DEFAULTS), before, 'an edited deck is a reason to rebuild')
})

test('the fingerprint follows the theme too', () => {
  const dir = project({ config: { brandKit: './kit' } })
  mkdirSync(join(dir, 'kit'))
  const theme = join(dir, 'kit/theme.css')
  writeFileSync(theme, '/* @theme x */\nsection { color: red }\n')

  const before = fingerprint(dir, { ...DEFAULTS, brandKit: './kit' })
  writeFileSync(theme, '/* @theme x */\nsection { color: blue }\n')

  assert.notEqual(
    fingerprint(dir, { ...DEFAULTS, brandKit: './kit' }),
    before,
    'restyling the kit changes the rendered deck, so it counts as a change',
  )
})

test('a missing source is not the hook\'s problem to report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deckard-hook-'))
  writeFileSync(join(dir, 'deckard.json'), '{}')
  assert.equal(fingerprint(dir, DEFAULTS), null)
  assert.equal(autobuild(dir), null, 'scaffolding is /deck:init\'s job, not a per-turn nag')
})

test('an unresolvable kit still yields a fingerprint', () => {
  const dir = project({ config: { brandKit: './absent' } })
  assert.ok(
    fingerprint(dir, { ...DEFAULTS, brandKit: './absent' }),
    'the build reports a broken kit; the hash just needs to be stable',
  )
})

test('the hook manifest uses the shape the CLI actually honours', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../plugin/hooks/hooks.json', import.meta.url), 'utf8'),
  )
  const [group] = manifest.hooks.Stop
  // Measured 2026-07-26: a flat entry array is accepted and silently never
  // fires; the nested { hooks: [...] } group is what runs.
  assert.ok(Array.isArray(group.hooks), 'Stop entries are wrapped in a group')
  const [entry] = group.hooks
  assert.equal(entry.type, 'command')
  assert.match(entry.command, /autobuild\.mjs/)
  assert.equal(entry.async, false, 'async hooks are killed when a headless session exits')
  assert.ok(entry.timeout > 0)
})
