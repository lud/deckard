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

test('the hook speaks to the user only — waking the model is the loop class', () => {
  const dir = project({
    deck: ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n'),
  })

  const output = autobuild(dir)
  assert.ok(output)
  assert.match(output.systemMessage, /^deckard: presentation\.md:10 missing-asset/)

  // Anything that reaches the model makes it end another turn, which fires
  // this hook again — convergence would then rest on a fingerprint of files
  // anything on disk can touch. `systemMessage` is the only field emitted, so
  // the loop class is gone by construction, not bounded by an argument.
  assert.deepEqual(Object.keys(output), ['systemMessage'], 'no model-facing field exists')
})

test('a broken deck reports once per change, not once per turn', () => {
  const dir = project({
    deck: ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n'),
  })

  assert.ok(autobuild(dir), 'the user hears about it once')

  // The fingerprint marks the attempt, so the same broken deck stays quiet —
  // one line per change is a notification; one per turn is a nag.
  assert.equal(autobuild(dir), null, 'an unchanged deck is silent')
})

test('a failed attempt still lets a later fix rebuild', () => {
  const dir = project({
    deck: ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n'),
  })
  autobuild(dir)

  writeFileSync(
    join(dir, 'presentation.md'),
    ['# D', '', '## Slides', '', '### One', '<!--', 'media: none', '-->', '', 'Fixed.'].join('\n'),
  )

  // Recording the attempt must not make a corrected deck look unchanged.
  const after = fingerprint(dir, DEFAULTS)
  assert.ok(after)
  assert.notEqual(
    after,
    readFileSync(join(dir, DEFAULTS.outDir, 'last-build.hash'), 'utf8').trim(),
    'the fix is a new fingerprint, so the next turn attempts it',
  )
})

test('the hook manifest uses the shape the CLI actually honours', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../plugin/hooks/hooks.json', import.meta.url), 'utf8'),
  )
  const [group] = manifest.hooks.Stop
  // Configuration is three levels — event, matcher group, handler — and a
  // Stop group simply omits the matcher. Flattening it away is accepted and
  // then silently never fires (measured 2026-07-26).
  assert.ok(Array.isArray(group.hooks), 'the handler sits inside a matcher group')
  const [entry] = group.hooks

  assert.equal(entry.type, 'command')
  // Exec form: the path is an argument, so a plugin root containing spaces
  // cannot be re-tokenized by a shell.
  assert.equal(entry.command, 'node')
  assert.deepEqual(entry.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/autobuild.mjs'])
  assert.equal(entry.async, false, 'async hooks are killed when a headless session exits')
  assert.ok(entry.timeout > 0)
})
