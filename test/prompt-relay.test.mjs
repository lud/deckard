// @ts-check
// The prompt-time relay is loop-proof by construction — it fires on user
// prompts, which nothing it emits can cause — so what these tests pin down is
// the rest of the contract: the two silent fast paths, consume-on-delivery,
// and that every report reflects the deck *now* rather than last turn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { autobuild } from '../plugin/scripts/autobuild.mjs'
import { DEFAULTS } from '../plugin/scripts/lib/config.mjs'
import { FLAG_FILE } from '../plugin/scripts/lib/hooks.mjs'
import { promptRelay } from '../plugin/scripts/prompt-relay.mjs'

const CLEAN = ['# D', '', '## Slides', '', '### One', '<!--', 'media: none', '-->', '', 'Body.'].join('\n')
const BROKEN = ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '-->', '', '![x](output/gone.gif)'].join('\n')

/** @param {{ deck?: string, config?: object | null }} [options] */
function project({ deck = CLEAN, config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deckard-relay-'))
  writeFileSync(join(dir, 'presentation.md'), deck)
  if (config) writeFileSync(join(dir, 'deckard.json'), JSON.stringify(config))
  return dir
}

/** @param {string} dir @param {string} [content] */
function plantFlag(dir, content = '') {
  mkdirSync(join(dir, DEFAULTS.outDir), { recursive: true })
  writeFileSync(join(dir, DEFAULTS.outDir, FLAG_FILE), content)
}

/** @param {string} dir */
const flagExists = (dir) => existsSync(join(dir, DEFAULTS.outDir, FLAG_FILE))

/**
 * A fake Marp: answers --version, and "renders" by writing the --output file.
 * Keeps renderer resolution deterministic whatever the machine's PATH holds.
 * @param {string} dir
 */
function stubMarp(dir) {
  const path = join(dir, 'marp-stub')
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "@marp-team/marp-cli v4.5.0"; exit 0; fi',
      'out=""; prev=""',
      'for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done',
      'echo html > "$out"',
    ].join('\n'),
  )
  chmodSync(path, 0o755)
  return path
}

/** Run with PATH pointing nowhere, so a machine-installed marp cannot leak in. */
/** @param {() => any} body */
function withoutPath(body) {
  const saved = process.env.PATH
  process.env.PATH = join(tmpdir(), 'deckard-empty-bin')
  try {
    return body()
  } finally {
    process.env.PATH = saved
  }
}

test('a project without deckard.json is silent', () => {
  const dir = project({ config: null })
  assert.equal(promptRelay(dir), null)
})

test('no flag means nothing to say — the everyday fast path', () => {
  const dir = project()
  assert.equal(promptRelay(dir), null)
})

test('a flagged broken deck reaches the model with a fresh lint, once', () => {
  const dir = project({ deck: BROKEN })
  plantFlag(dir)

  const output = promptRelay(dir)
  assert.ok(output)
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(output.hookSpecificOutput.additionalContext, /missing-asset/)
  assert.match(output.hookSpecificOutput.additionalContext, /--lint/)

  // The relay briefs the model and does nothing else: no `decision` that
  // could block the prompt, no user-facing line — the Stop hook already
  // gave the user theirs at the moment of breakage.
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput'])

  assert.ok(!flagExists(dir), 'consumed on delivery')
  assert.equal(promptRelay(dir), null, 'a briefing happens once per breakage')
})

test('a deck fixed between turns produces silence, not a stale alarm', () => {
  const dir = project({ config: null })
  writeFileSync(join(dir, 'deckard.json'), JSON.stringify({ marpCommand: stubMarp(dir) }))
  plantFlag(dir)

  assert.equal(promptRelay(dir), null, 'everything re-checks clean now')
  assert.ok(!flagExists(dir), 'the flag is still consumed')
})

test('a missing renderer is reported even though lint is clean', () => {
  const dir = project()
  plantFlag(dir)

  const output = withoutPath(() => promptRelay(dir))
  assert.ok(output)
  assert.match(output.hookSpecificOutput.additionalContext, /No Marp CLI found/)
  assert.match(output.hookSpecificOutput.additionalContext, /marpCommand/)
})

test('an unresolvable kit is re-checked fresh, not replayed', () => {
  const dir = project({ config: { brandKit: './absent' } })
  plantFlag(dir)

  const output = promptRelay(dir)
  assert.ok(output)
  assert.match(output.hookSpecificOutput.additionalContext, /kit/)
})

test('a recorded failure is relayed when everything cheap re-checks clean', () => {
  const dir = project({ config: null })
  writeFileSync(join(dir, 'deckard.json'), JSON.stringify({ marpCommand: stubMarp(dir) }))
  plantFlag(dir, 'marp exited 1:\nsomething about chromium\n')

  const output = promptRelay(dir)
  assert.ok(output)
  assert.match(output.hookSpecificOutput.additionalContext, /marp exited 1/)
  assert.match(output.hookSpecificOutput.additionalContext, /lints clean/)
})

test('autobuild leaves the flag on a failed attempt and clears it on success', () => {
  const dir = project({ deck: BROKEN, config: null })
  writeFileSync(join(dir, 'deckard.json'), JSON.stringify({ marpCommand: stubMarp(dir) }))

  assert.ok(autobuild(dir), 'the user hears about the breakage')
  assert.ok(flagExists(dir), 'the relay has something to pick up')

  writeFileSync(join(dir, 'presentation.md'), CLEAN)
  const output = autobuild(dir)
  assert.ok(output)
  assert.match(output.systemMessage, /rebuilt/)
  assert.ok(!flagExists(dir), 'a successful build retracts the pending report')
})
