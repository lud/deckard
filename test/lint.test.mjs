// @ts-check
// One deliberately-broken deck per finding. Each must produce exactly its own
// code: a linter that reports three things for one mistake trains people to
// ignore it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { severityOf } from '../plugin/scripts/lib/deck-lint.mjs'

const TRANSFORM = fileURLToPath(new URL('../plugin/scripts/plan-to-slides.mjs', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./fixtures/lint', import.meta.url))

/** Each fixture directory is named after the single finding it provokes. */
const CASES = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/** @param {string} project */
function lint(project) {
  const result = spawnSync(process.execPath, [TRANSFORM, '--project', project, '--lint'], {
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout }
}

test('the fixture set covers every finding the build plan calls for', () => {
  for (const required of [
    'missing-asset',
    'orphaned-asset',
    'malformed-metadata',
    'unknown-section',
    'unreachable-heading',
    'stale-media-section',
    'missing-media-directive',
  ]) {
    assert.ok(CASES.includes(required), `a fixture exists for ${required}`)
  }
})

for (const name of CASES) {
  test(`${name} is reported, and nothing else is`, () => {
    const { status, stdout } = lint(join(FIXTURES, name))

    const codes = new Set(
      stdout
        .split('\n')
        .slice(1)
        .filter((line) => line.trim() !== '')
        .map((line) => line.trim().split(/\s+/)[2]),
    )
    assert.deepEqual([...codes], [name])
    assert.equal(
      status,
      severityOf(name) === 'error' ? 1 : 0,
      'only errors fail the run',
    )
  })
}

test('an orphaned asset warns without failing', () => {
  const { status, stdout } = lint(join(FIXTURES, 'orphaned-asset'))

  assert.equal(status, 0, 'leftover captures are the author\'s to judge, not a build failure')
  assert.match(stdout, /^1 warning:/)
  assert.match(stdout, /warning\s+orphaned-asset\s+"assets\/unused\.png"/)
})

test('a warning alongside an error still fails', () => {
  const project = mkdtempSync(join(tmpdir(), 'deckard-mixed-'))
  mkdirSync(join(project, 'assets'))
  writeFileSync(join(project, 'assets/unused.png'), 'stub\n')
  writeFileSync(
    join(project, 'presentation.md'),
    ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n'),
  )

  const { status, stdout } = lint(project)

  assert.equal(status, 1)
  assert.match(stdout, /^1 error, 1 warning:/)
})

test('a clean deck exits zero', () => {
  const { status, stdout } = lint(fileURLToPath(new URL('./fixtures/kitchen-sink', import.meta.url)))
  assert.equal(status, 0)
  assert.match(stdout, /lints clean/)
})

test('findings carry the line they were made on', () => {
  const { stdout } = lint(join(FIXTURES, 'unreachable-heading'))
  assert.match(stdout, /presentation\.md:13\s+error\s+unreachable-heading/)
})
