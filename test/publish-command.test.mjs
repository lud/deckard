// @ts-check
// The zero-turn /deck:publish: whatever happens, the answer is a block with
// a reason the user can read — the command was handled here, and nothing
// must fall through to a model turn on exit 0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishCommand } from '../plugin/scripts/publish-command.mjs'

const CLEAN = ['# D', '', '## Slides', '', '### One', '<!--', 'media: none', '-->', '', 'Body.'].join('\n')
const BROKEN = ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n')

/** A fake Marp that answers --version and writes the --output file. */
/** @param {string} dir */
function stubMarp(dir) {
  const path = join(dir, 'marp-stub')
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "@marp-team/marp-cli v4.5.0"; exit 0; fi',
      'out=""; prev=""',
      'for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done',
      'echo "<html>ok</html>" > "$out"',
    ].join('\n'),
  )
  chmodSync(path, 0o755)
  return path
}

/** @param {string} deck */
function project(deck) {
  const dir = mkdtempSync(join(tmpdir(), 'deckard-pub-'))
  writeFileSync(join(dir, 'presentation.md'), deck)
  writeFileSync(join(dir, 'deckard.json'), JSON.stringify({ marpCommand: stubMarp(dir) }))
  return dir
}

test('arguments stand the hook aside — the user wants the model', () => {
  const dir = project(CLEAN)
  assert.equal(
    publishCommand(dir, 'check it stays under 500kb'),
    null,
    'the expansion proceeds; the skill bang publishes and the model answers',
  )
  assert.ok(!existsSync(join(dir, 'slides-embedded.html')), 'nothing published twice')
})

test('outside a project, the block points at /deck:ideate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deckard-pub-'))
  const out = publishCommand(dir)
  assert.ok(out)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /\/deck:ideate/)
})

test('a deck with errors blocks with the findings and publishes nothing', () => {
  const dir = project(BROKEN)
  const out = publishCommand(dir)
  assert.ok(out)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /nothing published/)
  assert.match(out.reason, /missing-asset/)
  assert.ok(!existsSync(join(dir, 'slides-embedded.html')))
})

test('a clean deck publishes and the report is the reason', () => {
  const dir = project(CLEAN)
  const out = publishCommand(dir)
  assert.ok(out)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /published slides-embedded\.html/)
  assert.ok(existsSync(join(dir, 'slides.html')), 'the render lands at the root')
  assert.ok(existsSync(join(dir, 'slides-embedded.html')))
})
