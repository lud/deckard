// @ts-check
// The kitchen-sink fixture is the format's worked example: it covers the
// edge-case matrix and carries one slide per brand-kit slide class, so it also
// serves M8's theme exports.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TRANSFORM = fileURLToPath(new URL('../plugin/scripts/plan-to-slides.mjs', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixtures/kitchen-sink', import.meta.url))

/**
 * @param {string[]} args
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function transform(args) {
  const result = execFileSync(process.execPath, [TRANSFORM, '--project', FIXTURE, ...args], {
    encoding: 'utf8',
    // --lint exits non-zero on findings, which is a result here, not a crash.
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: 0, stdout: result, stderr: '' }
}

test('transforming the kitchen sink matches the committed golden file', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'deckard-golden-')), 'slides.md')
  transform(['--out', out])

  assert.equal(
    readFileSync(out, 'utf8'),
    readFileSync(join(FIXTURE, 'expected/slides.md'), 'utf8'),
    'regenerate with --out and review the diff before updating the golden file',
  )
})

test('the kitchen sink lints clean', () => {
  const { stdout } = transform(['--lint'])
  assert.match(stdout, /lints clean/)
})

test('--status buckets every slide by media state', () => {
  const status = JSON.parse(transform(['--status']).stdout)

  assert.equal(status.source, 'presentation.md')
  assert.equal(status.slides.length, 9)
  assert.deepEqual(status.buckets.missing, ['What the format gives you'])
  assert.deepEqual(status.buckets.pending, ['Terminal capture pending'])
  assert.deepEqual(status.buckets.handoff, ['Waiting on a human'])
  assert.deepEqual(status.buckets.done, ['Screenshot as an aside', 'The finished capture'])
  assert.equal(status.buckets.none.length, 4)
  assert.equal(
    Object.values(status.buckets).flat().length,
    status.slides.length,
    'every slide lands in exactly one bucket',
  )

  const aside = status.slides.find((slide) => slide.title === 'Screenshot as an aside')
  assert.deepEqual(aside.assets, ['assets/screenshot.png'])
  assert.equal(aside.mediaSection, false)
})

test('every media state and deck: section appears in the fixture', () => {
  const source = readFileSync(join(FIXTURE, 'presentation.md'), 'utf8')
  for (const state of ['done', 'pending', 'handoff', 'none']) {
    assert.match(source, new RegExp(`^media: ${state}$`, 'm'), `covers media: ${state}`)
  }
  for (const section of ['Media', 'Notes', 'Knowledge']) {
    assert.match(source, new RegExp(`#### deck: ${section}`, 'i'), `covers deck: ${section}`)
  }
  assert.match(source, /^marp: /m, 'covers the marp: passthrough')
  assert.match(source, /^layout: /m, 'covers a layout key')
  assert.match(source, /^###### /m, 'covers the deepest content heading')
  assert.match(source, /^```/m, 'covers fenced code')
})
