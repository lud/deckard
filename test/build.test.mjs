// @ts-check
// The Marp render itself is not exercised here: it drives a browser, which
// would make the suite slow. These cover everything around it — locating the
// renderer, kit resolution, font embedding, the literal publish substitution,
// and the lint gate that decides whether a render happens at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from '../plugin/scripts/build.mjs'
import { PINNED_MARP, findMarp, missingMarpMessage } from '../plugin/scripts/lib/marp.mjs'
import { embedFonts } from '../plugin/scripts/embed-fonts.mjs'
import { inlineAssets } from '../plugin/scripts/publish.mjs'
import { kitDir, resolveKit } from '../plugin/scripts/lib/kit.mjs'

function project() {
  return mkdtempSync(join(tmpdir(), 'deckard-build-'))
}

test('the bundled default kit satisfies the directory contract', () => {
  const kit = resolveKit('default', project())
  assert.ok(existsSync(kit.theme), 'theme.css is present')
  assert.match(readFileSync(kit.theme, 'utf8'), /^\/\* @theme /, 'Marp needs the @theme header')
})

test('a bare kit name is bundled, a path-shaped one is the project\'s', () => {
  const dir = project()
  assert.match(kitDir('default', dir), /brand-kits\/default$/)
  assert.equal(kitDir('./kits/house', dir), join(dir, 'kits/house'))
  assert.equal(kitDir('kits/house', dir), join(dir, 'kits/house'))
})

test('a kit without theme.css names what is missing', () => {
  const dir = project()
  mkdirSync(join(dir, 'kits/bare'), { recursive: true })
  assert.throws(() => resolveKit('./kits/bare', dir), /has no theme\.css/)
  assert.throws(() => resolveKit('./kits/absent', dir), /not found/)
})

test('font references become data URIs, remote ones are left alone', () => {
  const dir = project()
  mkdirSync(join(dir, 'fonts'))
  writeFileSync(join(dir, 'fonts/Body.woff2'), 'not really a font, but bytes are bytes')

  const result = embedFonts(
    [
      '@font-face { font-family: Body; src: url("fonts/Body.woff2") format("woff2"); }',
      '@font-face { font-family: Remote; src: url(https://example.com/x.woff2); }',
      '@font-face { font-family: Gone; src: url(fonts/Absent.woff2); }',
    ].join('\n'),
    dir,
  )

  assert.match(result.css, /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/)
  assert.match(result.css, /url\(https:\/\/example\.com\/x\.woff2\)/, 'remote stays a reference')
  assert.match(result.css, /url\(fonts\/Absent\.woff2\)/, 'a missing file is left untouched')
  assert.deepEqual(result.embedded, ['fonts/Body.woff2'])
  assert.deepEqual(result.missing, ['fonts/Absent.woff2'])
})

test('publish substitutes asset paths literally', () => {
  const dir = project()
  mkdirSync(join(dir, 'output'))
  writeFileSync(join(dir, 'output/demo.gif'), 'GIF89a-ish')

  const result = inlineAssets(
    '<img src="output/demo.gif"><p>output/demo.gif appears in prose too</p>',
    ['output/demo.gif'],
    dir,
  )

  assert.doesNotMatch(result.html, /output\/demo\.gif/, 'every occurrence is replaced')
  assert.equal(result.html.match(/data:image\/gif;base64,/g)?.length, 2)
  assert.deepEqual(result.inlined, ['output/demo.gif'])
})

test('a path that prefixes another is not partly replaced', () => {
  const dir = project()
  mkdirSync(join(dir, 'output'))
  writeFileSync(join(dir, 'output/demo.gif'), 'one')
  writeFileSync(join(dir, 'output/demo.gif.png'), 'two')

  const result = inlineAssets(
    '<img src="output/demo.gif"><img src="output/demo.gif.png">',
    ['output/demo.gif', 'output/demo.gif.png'],
    dir,
  )

  assert.doesNotMatch(result.html, /output\/demo/, 'neither path survives')
  assert.match(result.html, /data:image\/gif;base64,[^"]*"><img src="data:image\/png/)
})

test('an asset missing from disk is reported, not inlined', () => {
  const dir = project()
  const result = inlineAssets('<img src="output/gone.gif">', ['output/gone.gif'], dir)
  assert.match(result.html, /output\/gone\.gif/)
  assert.deepEqual(result.skipped, ['output/gone.gif'])
})

test('lint errors stop the build before anything is rendered', () => {
  const dir = project()
  writeFileSync(
    join(dir, 'presentation.md'),
    ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n'),
  )

  const result = build({ project: dir })

  assert.equal(result.ok, false)
  assert.equal(result.errors, 1)
  assert.match(result.report, /missing-asset/)
  assert.equal(
    existsSync(join(dir, '.build/slides.md')),
    false,
    'a deck with errors is never rendered',
  )
})

test('a source that does not exist points at /deck:init', () => {
  assert.throws(() => build({ project: project() }), /Run \/deck:init/)
})

/**
 * A stand-in Marp that answers --version, so resolution is testable without
 * installing one.
 * @param {string} dir
 * @param {string} version
 */
function fakeMarp(dir, version) {
  const path = join(dir, 'fake-marp')
  writeFileSync(path, `#!/bin/sh\necho "@marp-team/marp-cli v${version}"\n`, { mode: 0o755 })
  return path
}

test('the configured command wins over PATH', () => {
  const dir = project()
  const found = findMarp({ project: dir, marpCommand: fakeMarp(dir, '4.5.0') })
  assert.ok(found)
  assert.equal(found.version, '4.5.0')
  assert.equal(found.source, 'deckard.json marpCommand')
})

/**
 * Run `fn` with nothing on PATH, so resolution cannot depend on whether this
 * machine happens to have a Marp installed. Three tests here originally passed
 * only because none was installed, which made them silent liars the moment one
 * was.
 * @param {() => void} fn
 */
function withoutMarpOnPath(fn) {
  const original = process.env.PATH
  process.env.PATH = mkdtempSync(join(tmpdir(), 'deckard-empty-path-'))
  try {
    fn()
  } finally {
    process.env.PATH = original
  }
}

test('a configured command that does not run falls through, never trusted', () => {
  const dir = project()

  const found = findMarp({ project: dir, marpCommand: join(dir, 'does-not-exist') })
  assert.notEqual(found?.command, join(dir, 'does-not-exist'), 'the dead command is not used')

  withoutMarpOnPath(() => {
    assert.equal(
      findMarp({ project: dir, marpCommand: join(dir, 'does-not-exist') }),
      null,
      'with nothing else to fall back to, resolution reports nothing found',
    )
  })
})

test('a project-local install outranks one on PATH', () => {
  const dir = project()
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules/.bin/marp'), '#!/bin/sh\necho "v9.9.9"\n', { mode: 0o755 })

  const found = findMarp({ project: dir })
  assert.equal(found?.source, 'project node_modules', 'the version the project pinned wins')
  assert.equal(found?.version, '9.9.9')
})

test('the missing-renderer message asks the user, and never installs silently', () => {
  const message = missingMarpMessage()
  assert.match(message, /Ask the user to install it/)
  assert.match(message, /Do not run an install yourself unless/)
  assert.match(message, /marpCommand/, 'says where to record the path')
  assert.match(message, new RegExp(`@marp-team\\/marp-cli@${PINNED_MARP}`))
  assert.doesNotMatch(message, /npx/, 'fetching is not on the menu')

  assert.match(missingMarpMessage({ hook: true }), /autobuild hook/, 'the hook gets its own tail')
})

test('a build with no renderer reports how to get one, and renders nothing', () => {
  const dir = project()
  writeFileSync(
    join(dir, 'presentation.md'),
    ['# D', '', '## Slides', '', '### One', '<!--', 'media: none', '-->', '', 'Body.'].join('\n'),
  )

  withoutMarpOnPath(() => {
    const result = build({ project: dir })

    assert.equal(result.ok, false)
    assert.equal(result.errors, 0, 'the deck itself is fine')
    assert.match(result.report, /Ask the user to install it/)
    assert.equal(existsSync(join(dir, 'slides.html')), false, 'nothing was published')
  })
})

test('the Marp version stays pinned', () => {
  assert.match(PINNED_MARP, /^\d+\.\d+\.\d+$/, 'the version Deckard is verified against')
})
