// @ts-check
// The scaffold's contract is that a second run is a no-op: /deck:init is safe
// to re-run at any point in a project's life, so every test here works by
// running it twice and comparing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const INIT = fileURLToPath(new URL('../plugin/scripts/init.mjs', import.meta.url))

/** Keys `deckard.json` accepts (framework.md §8). */
const CONFIG_KEYS = new Set(['brandKit', 'source', 'captureTool', 'outDir', 'publish', 'marpCommand'])

function emptyProject() {
  return mkdtempSync(join(tmpdir(), 'deckard-init-'))
}

/** @param {string} cwd */
function runInit(cwd) {
  return execFileSync(process.execPath, [INIT], { cwd, encoding: 'utf8' })
}

/**
 * Every file under `dir`, as path → contents, for byte-exact comparison.
 * @param {string} dir
 * @param {string} [root]
 * @returns {Record<string, string>}
 */
function snapshot(dir, root = dir) {
  /** @type {Record<string, string>} */
  const files = {}
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) Object.assign(files, snapshot(full, root))
    else files[relative(root, full)] = readFileSync(full, 'utf8')
  }
  return files
}

test('scaffolds the project layout', () => {
  const project = emptyProject()
  const report = runInit(project)

  for (const path of ['notes.md', 'presentation.md', 'deckard.json']) {
    assert.ok(readFileSync(join(project, path), 'utf8').length > 0, `${path} has content`)
    assert.match(report, new RegExp(`created\\s+${path.replace('.', '\\.')}`))
  }
  assert.ok(statSync(join(project, 'data')).isDirectory(), 'data/ is a directory')
  assert.match(readFileSync(join(project, '.gitignore'), 'utf8'), /^\.build\/$/m)
})

test('a second run changes nothing on disk', () => {
  const project = emptyProject()
  runInit(project)
  const before = snapshot(project)

  const report = runInit(project)

  assert.deepEqual(snapshot(project), before, 'every file is byte-identical')
  assert.doesNotMatch(report, /created/, 'nothing is reported as created')
  assert.match(report, /skipped\s+presentation\.md/)
})

test('a hand-edited file survives byte-identical', () => {
  const project = emptyProject()
  const mine = '# My deck\n\n## Slides\n\n### Only slide\n'
  writeFileSync(join(project, 'presentation.md'), mine)

  const report = runInit(project)

  assert.equal(readFileSync(join(project, 'presentation.md'), 'utf8'), mine)
  assert.match(report, /skipped\s+presentation\.md/)
  assert.match(report, /created\s+notes\.md/, 'the other files are still scaffolded')
})

test('an existing .gitignore keeps its entries and gains .build/ once', () => {
  const project = emptyProject()
  writeFileSync(join(project, '.gitignore'), 'node_modules\n')

  runInit(project)
  assert.equal(readFileSync(join(project, '.gitignore'), 'utf8'), 'node_modules\n.build/\n')

  runInit(project)
  assert.equal(
    readFileSync(join(project, '.gitignore'), 'utf8'),
    'node_modules\n.build/\n',
    're-running does not duplicate the entry',
  )
})

test('a .gitignore lacking a trailing newline is appended to cleanly', () => {
  const project = emptyProject()
  writeFileSync(join(project, '.gitignore'), 'node_modules')

  runInit(project)

  assert.equal(readFileSync(join(project, '.gitignore'), 'utf8'), 'node_modules\n.build/\n')
})

test('.build already ignored without a trailing slash is recognized', () => {
  const project = emptyProject()
  writeFileSync(join(project, '.gitignore'), '.build\n')

  runInit(project)

  assert.equal(readFileSync(join(project, '.gitignore'), 'utf8'), '.build\n')
})

test('deckard.json is valid JSON within the documented schema', () => {
  const project = emptyProject()
  runInit(project)

  const config = JSON.parse(readFileSync(join(project, 'deckard.json'), 'utf8'))
  assert.equal(typeof config, 'object')
  for (const key of Object.keys(config)) {
    assert.ok(CONFIG_KEYS.has(key), `deckard.json key "${key}" is part of the schema`)
  }
  assert.equal(config.source, 'presentation.md')
})
