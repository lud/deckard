// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emitMarp } from '../plugin/scripts/lib/deck-emit.mjs'
import { metaValue, parseDeck } from '../plugin/scripts/lib/deck-parse.mjs'

/** @param {string} source */
const parse = (source) => parseDeck(source)

/** @param {string} source */
function emit(source) {
  return emitMarp(parseDeck(source), { source: 'presentation.md' })
}

/**
 * Everything after the generated frontmatter.
 * @param {string} output
 */
function slidesOf(output) {
  const parts = output.split(/^---$/m)
  return parts.slice(2).join('---')
}

const MINIMAL = ['# Deck', '', '## Slides', '', '### One', '', 'Body.', ''].join('\n')

test('meta sections above the anchor never become slides', () => {
  const deck = parse(
    [
      '# Deck',
      '',
      '## Overview',
      '',
      'Prose for humans.',
      '',
      '### A heading inside a meta section',
      '',
      '## Slides',
      '',
      '### Real slide',
      '',
      'Body.',
    ].join('\n'),
  )

  assert.equal(deck.title, 'Deck')
  assert.deepEqual(
    deck.slides.map((slide) => slide.title),
    ['Real slide'],
  )
  assert.deepEqual(deck.findings, [])
})

test('a slide needs no metadata block at all', () => {
  const deck = parse(MINIMAL)
  assert.equal(deck.slides.length, 1)
  assert.deepEqual(deck.slides[0].metadata, [])
  assert.equal(metaValue(deck.slides[0], 'media'), null, 'an absent key is unclassified')
  assert.deepEqual(deck.findings, [])
})

test('metadata reads in single-line and multi-line form', () => {
  const single = parse(['# D', '', '## Slides', '', '### One', '<!-- media: done -->', '', 'B.'].join('\n'))
  assert.equal(metaValue(single.slides[0], 'media'), 'done')

  const multi = parse(
    ['# D', '', '## Slides', '', '### One', '<!--', 'media: done', 'layout: lead', '-->', '', 'B.'].join('\n'),
  )
  assert.equal(metaValue(multi.slides[0], 'media'), 'done')
  assert.equal(metaValue(multi.slides[0], 'layout'), 'lead')
  assert.deepEqual(multi.findings, [])
})

test('a value keeps every colon after the first', () => {
  const deck = parse(
    ['# D', '', '## Slides', '', '### One', '<!--', 'marp: transition: fade', '-->', '', 'B.'].join('\n'),
  )
  assert.equal(metaValue(deck.slides[0], 'marp'), 'transition: fade')
})

test('an indented line continues the previous value', () => {
  const deck = parse(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### One',
      '<!--',
      'media-type: a long value',
      '  continued here',
      '-->',
      '',
      'B.',
    ].join('\n'),
  )
  assert.equal(metaValue(deck.slides[0], 'media-type'), 'a long value continued here')
  assert.deepEqual(deck.findings, [])
})

test('an unterminated metadata comment is reported, not guessed at', () => {
  const deck = parse(['# D', '', '## Slides', '', '### One', '<!--', 'media: done', '', 'B.'].join('\n'))
  assert.deepEqual(
    deck.findings.map((finding) => finding.code),
    ['unterminated-metadata'],
  )
})

test('headings promote two levels, and a plain H4 is content', () => {
  const output = emit(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '',
      '#### Four',
      '',
      '##### Five',
      '',
      '###### Six',
      '',
    ].join('\n'),
  )

  assert.match(output, /^# Title$/m)
  assert.match(output, /^## Four$/m)
  assert.match(output, /^### Five$/m)
  assert.match(output, /^#### Six$/m)
})

test('a deck: section is a section, and its name is case-insensitive', () => {
  const deck = parse(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '',
      'Body.',
      '',
      '#### DECK: notes',
      '',
      '- Spoken.',
    ].join('\n'),
  )

  assert.deepEqual(
    deck.slides[0].sections.map((section) => section.canonical),
    ['notes'],
  )
  assert.deepEqual(deck.findings, [])
  assert.deepEqual(
    deck.slides[0].body.map((entry) => entry.text).filter((text) => text !== ''),
    ['Body.'],
  )
})

test('a plain H4 after a deck: section never reaches the slide', () => {
  const source = [
    '# D',
    '',
    '## Slides',
    '',
    '### Title',
    '',
    'Body.',
    '',
    '#### deck: Knowledge',
    '',
    'Research trail.',
    '',
    '#### Buried heading',
    '',
    'Stranded prose.',
  ].join('\n')

  const deck = parse(source)

  // §2.2's ordering rule: body content lives strictly above the sections, so
  // this heading is unreachable as slide content wherever it lands.
  assert.deepEqual(
    deck.findings.map((finding) => finding.code),
    ['unreachable-heading'],
  )
  assert.equal(deck.findings[0].line, 13, 'the finding points at the heading itself')
  assert.deepEqual(
    deck.slides[0].body.map((entry) => entry.text).filter(Boolean),
    ['Body.'],
    'the slide body stops at the first deck: section',
  )

  const output = emit(source)
  assert.doesNotMatch(output, /## Buried heading/, 'it is never promoted into the slide')
  assert.doesNotMatch(output, /Stranded prose/, 'nor is the prose beneath it')
})

test('a stranded heading stays out of the presenter note', () => {
  const source = [
    '# D',
    '',
    '## Slides',
    '',
    '### Title',
    '',
    'Body.',
    '',
    '#### deck: Notes',
    '',
    '- Spoken.',
    '',
    '#### Buried heading',
    '',
    'Stranded prose.',
  ].join('\n')

  const note = (emit(source).match(/<!--[\s\S]*?-->/g) ?? [])[0]
  assert.ok(note, 'the slide emits a presenter note')
  assert.match(note, /- Spoken\./)
  assert.doesNotMatch(note, /Buried heading/, 'the note carries spoken words only')
  assert.doesNotMatch(note, /Stranded prose\./)

  // Held apart rather than discarded: the finding is the signal, and the text
  // is still there for a report to quote.
  const deck = parse(source)
  assert.deepEqual(
    deck.slides[0].stranded.map((entry) => entry.text).filter(Boolean),
    ['#### Buried heading', 'Stranded prose.'],
  )
  assert.deepEqual(
    deck.slides[0].sections[0].lines.map((entry) => entry.text).filter(Boolean),
    ['- Spoken.'],
  )
})

test('a deck: section after a stranded block collects normally again', () => {
  const deck = parse(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '<!--',
      'media: pending',
      '-->',
      '',
      'Body.',
      '',
      '#### deck: Notes',
      '',
      '- Spoken.',
      '',
      '#### Buried heading',
      '',
      'Stranded prose.',
      '',
      '#### deck: Media',
      '',
      'Record the terminal.',
    ].join('\n'),
  )

  assert.deepEqual(
    deck.findings.map((finding) => finding.code),
    ['unreachable-heading'],
  )
  const media = deck.slides[0].sections.find((section) => section.canonical === 'media')
  assert.ok(media, 'the Media section is parsed')
  assert.deepEqual(
    media.lines.map((entry) => entry.text).filter(Boolean),
    ['Record the terminal.'],
    'the stranded block ends where the next deck: section begins',
  )
})

test('a hash inside fenced code is never a heading', () => {
  const source = [
    '# D',
    '',
    '## Slides',
    '',
    '### Title',
    '',
    '```bash',
    '# a shell comment',
    '### deck: not a section',
    '```',
    '',
    'After the fence.',
  ].join('\n')

  const deck = parse(source)
  assert.equal(deck.slides.length, 1, 'the fenced ### did not open a slide')
  assert.deepEqual(deck.slides[0].sections, [])

  const output = emit(source)
  assert.match(output, /^# a shell comment$/m, 'fenced hashes keep their level')
  assert.match(output, /^### deck: not a section$/m)
})

test('layout and marp keys become spot directives above the title', () => {
  const output = emit(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '<!--',
      'media: none',
      'layout: lead',
      'marp: transition: fade',
      '-->',
      '',
      'Body.',
    ].join('\n'),
  )

  const slides = slidesOf(output)
  assert.match(slides, /<!--\n_class: lead\n_transition: fade\n-->\n\n# Title/)
  assert.doesNotMatch(slides, /^class:/m, 'never an unprefixed directive that inherits forward')
  assert.doesNotMatch(slides, /^transition:/m)
})

test('asset paths pass through exactly as written', () => {
  // The render is written at the project root, where source-relative
  // references resolve — so the emitter never touches a path, and there is
  // no rewrite to corrupt inline code, HTML images, or anything else.
  const source = [
    '# Deck',
    '',
    '## Slides',
    '',
    '### One',
    '',
    '![bg right:40% fit](assets/shot.png)',
    'An example in prose: `![x](assets/inline.png)`.',
    '',
  ].join('\n')

  const out = emit(source)
  assert.match(out, /!\[bg right:40% fit\]\(assets\/shot\.png\)/)
  assert.match(out, /`!\[x\]\(assets\/inline\.png\)`/)
})

test('pipeline metadata never reaches the generated file', () => {
  const output = emit(
    ['# D', '', '## Slides', '', '### Title', '<!--', 'media: pending', 'media-type: terminal', '-->', '', 'B.'].join(
      '\n',
    ),
  )
  assert.doesNotMatch(slidesOf(output), /media/, 'media state is the pipeline\'s business alone')
})

test('notes emit as their own comment, apart from the directive comment', () => {
  const output = emit(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '<!--',
      'layout: lead',
      '-->',
      '',
      'Body.',
      '',
      '#### deck: Notes',
      '',
      '- Spoken words.',
    ].join('\n'),
  )

  const comments = slidesOf(output).match(/<!--[\s\S]*?-->/g) ?? []
  assert.equal(comments.length, 2, 'a directive comment and a note comment, never merged')
  assert.match(comments[0], /_class: lead/)
  assert.match(comments[1], /- Spoken words\./)
  assert.doesNotMatch(comments[1], /_class/)
})

test('Media and Knowledge sections stay out of the deck', () => {
  const output = emit(
    [
      '# D',
      '',
      '## Slides',
      '',
      '### Title',
      '<!--',
      'media: pending',
      '-->',
      '',
      'Body.',
      '',
      '#### deck: Media',
      '',
      'Record the terminal.',
      '',
      '#### deck: Knowledge',
      '',
      'Cited at owner/repo#1.',
    ].join('\n'),
  )

  assert.doesNotMatch(output, /Record the terminal/)
  assert.doesNotMatch(output, /owner\/repo#1/)
  assert.match(output, /Body\./)
})

test('the do-not-edit banner is a YAML comment inside the frontmatter', () => {
  const output = emit(MINIMAL)
  const frontmatter = output.split(/^---$/m)[1]
  assert.match(frontmatter, /^# Generated by Deckard/m)
  assert.doesNotMatch(frontmatter, /<!--/, 'an HTML comment here would become slide 1\'s note')
  assert.match(frontmatter, /^marp: true$/m)
})

test('slides are separated by a Marp rule', () => {
  const output = emit(['# D', '', '## Slides', '', '### One', '', 'A.', '', '### Two', '', 'B.'].join('\n'))
  assert.match(output, /# One\n\nA\.\n\n---\n\n# Two/)
})
