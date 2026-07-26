// @ts-check
// The single parser for the §2 source format. `--lint` and `--status` are
// consumers of this output, never second implementations. Parsing is
// line-based on purpose: the format is designed to need no markdown parser,
// and heading detection skips fenced-code interiors (§2.1).

/** Media resolution states (§2.3). A missing key means "not yet classified". */
export const MEDIA_STATES = new Set(['done', 'pending', 'handoff', 'none'])

/** Metadata keys the transform understands. `marp` repeats (§2.3). */
export const METADATA_KEYS = new Set(['media', 'media-type', 'layout', 'marp'])

/** `deck:` section names, matched case-insensitively (§2.2). */
export const SECTION_NAMES = new Set(['media', 'notes', 'knowledge'])

/**
 * Marp directive names. A note line opening with one of these would be
 * swallowed as a directive instead of read as a note (§2.3 collision caveat).
 */
export const MARP_DIRECTIVES = new Set([
  'marp',
  'theme',
  'style',
  'class',
  'color',
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'paginate',
  'header',
  'footer',
  'lang',
  'headingDivider',
  'transition',
  'size',
  'title',
  'description',
  'author',
  'keywords',
  'url',
  'image',
])

const ANCHOR = 'slides'
const IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/g

/**
 * @typedef {{ text: string, line: number, fenced: boolean }} Line
 * @typedef {{ name: string, canonical: string, line: number, lines: Line[] }} Section
 * @typedef {{ key: string, value: string, line: number }} MetaEntry
 * @typedef {{ code: string, line: number, message: string }} Finding
 * @typedef {{ text: string, line: number, index: number }} Cursor
 * @typedef {{
 *   title: string, line: number, metadata: MetaEntry[], body: Line[],
 *   sections: Section[], stranded: Line[]
 * }} Slide
 */

/**
 * @param {string} source
 * @returns {{ title: string | null, slides: Slide[], findings: Finding[] }}
 */
export function parseDeck(source) {
  const lines = source.split('\n')
  /** @type {Finding[]} */
  const findings = []
  /** @type {Slide[]} */
  const slides = []
  /** @type {string | null} */
  let title = null
  let inSlides = false
  /** @type {string | null} */
  let fence = null
  /** @type {Slide | null} */
  let slide = null
  /** @type {Section | null} */
  let section = null
  /**
   * Set while inside an unreachable plain-H4 block. Its lines are held apart
   * from the section that encloses them: the finding is the signal, and the
   * content stays out of the deck rather than leaking into a presenter note.
   * @type {Line[] | null}
   */
  let stranded = null
  let awaitingMetadata = false

  /**
   * @param {string} code
   * @param {number} line
   * @param {string} message
   */
  const flag = (code, line, message) => findings.push({ code, line, message })

  /** @param {Line} entry */
  const collect = (entry) => {
    if (stranded) stranded.push(entry)
    else if (section) section.lines.push(entry)
    else if (slide) slide.body.push(entry)
    // Anything outside a slide is meta prose for humans and agents (§2.1).
  }

  // Each handler below returns the index the loop resumes from. That is the
  // line it was given, except for a metadata block, which spans several.

  /** Take the line as content, wherever the current context sends it.
   * @param {Cursor} at
   * @returns {number}
   */
  const keep = ({ text, line, index }) => {
    collect({ text, line, fenced: false })
    return index
  }

  /**
   * @param {Cursor} at
   * @param {RegExpMatchArray | null} fenceMark
   * @returns {number}
   */
  const handleFencedLine = ({ text, line, index }, fenceMark) => {
    collect({ text, line, fenced: true })
    if (fence && fenceMark && fenceMark[1][0] === fence[0] && fenceMark[1].length >= fence.length) {
      fence = null
    }
    return index
  }

  /**
   * @param {Cursor} at
   * @param {string} mark
   * @returns {number}
   */
  const handleFenceStart = ({ text, line, index }, mark) => {
    fence = mark
    awaitingMetadata = false
    collect({ text, line, fenced: true })
    return index
  }

  /**
   * The lines between a slide's title and its body may hold the metadata
   * comment (§2.3). Returns null when this line is neither, leaving the caller
   * to treat it as the start of the body.
   * @param {Cursor} at
   * @returns {number | null}
   */
  const handlePendingMetadata = (at) => {
    if (at.text.trim() === '') return keep(at)
    if (at.text.trimStart().startsWith('<!--')) {
      const resume = readMetadata(lines, at.index, /** @type {Slide} */ (slide), flag)
      awaitingMetadata = false
      return resume
    }
    awaitingMetadata = false
    return null
  }

  /**
   * @param {Cursor} at
   * @param {string} label
   * @returns {number}
   */
  const handleH1 = (at, label) => {
    if (title === null && !inSlides) {
      title = label
      return at.index
    }
    flag('unexpected-heading', at.line, `H1 "${label}" belongs at the top of the document only`)
    // Kept in the body regardless: a finding reports it, the transform never
    // quietly loses it (§5.1).
    return keep(at)
  }

  /**
   * @param {Cursor} at
   * @param {string} label
   * @returns {number}
   */
  const handleH2 = (at, label) => {
    if (label.toLowerCase() === ANCHOR) {
      if (inSlides) flag('duplicate-anchor', at.line, 'a second "## Slides" anchor')
      inSlides = true
      slide = null
      section = null
      return at.index
    }
    if (inSlides) {
      flag('heading-after-slides', at.line, `H2 "${label}" appears after the "## Slides" anchor`)
      return keep(at)
    }
    // A meta section above the anchor: prose for humans and agents (§2.1).
    return at.index
  }

  /**
   * @param {Cursor} at
   * @param {string} label
   * @returns {number}
   */
  const handleH3 = (at, label) => {
    if (!inSlides) return keep(at)
    slide = { title: label, line: at.line, metadata: [], body: [], sections: [], stranded: [] }
    slides.push(slide)
    section = null
    stranded = null
    awaitingMetadata = true
    return at.index
  }

  /**
   * @param {Cursor} at
   * @param {string} label
   * @returns {number}
   */
  const handleH4 = (at, label) => {
    const current = slide
    if (!current) {
      flag('stray-content', at.line, `"${label}" sits between the anchor and the first slide`)
      return at.index
    }

    const deck = label.match(/^deck:\s*(.*)$/i)
    if (deck) {
      const name = deck[1].trim()
      const canonical = name.toLowerCase()
      if (!SECTION_NAMES.has(canonical)) {
        flag(
          'unknown-section',
          at.line,
          `unknown section "deck: ${name}" — expected Media, Notes or Knowledge`,
        )
      }
      section = { name, canonical, line: at.line, lines: [] }
      stranded = null
      current.sections.push(section)
      return at.index
    }

    if (current.sections.length > 0) {
      flag(
        'unreachable-heading',
        at.line,
        `content heading "${label}" sits inside a "deck:" section, so it and the content under it are left out of the deck — move them above the sections`,
      )
      stranded = current.stranded
    }
    return keep(at)
  }

  /**
   * @param {number} index
   * @returns {number} the index the loop resumes from
   */
  const handleLine = (index) => {
    const text = lines[index]
    /** @type {Cursor} */
    const at = { text, line: index + 1, index }
    const fenceMark = text.match(/^\s{0,3}(`{3,}|~{3,})/)

    if (fence) return handleFencedLine(at, fenceMark)
    if (fenceMark) return handleFenceStart(at, fenceMark[1])

    const heading = text.match(/^(#{1,6})\s+(.*)$/)

    if (awaitingMetadata && !heading) {
      const resume = handlePendingMetadata(at)
      if (resume !== null) return resume
    }

    if (!heading) return keep(at)

    const label = heading[2].trim()
    switch (heading[1].length) {
      case 1:
        return handleH1(at, label)
      case 2:
        return handleH2(at, label)
      case 3:
        return handleH3(at, label)
      case 4:
        return inSlides ? handleH4(at, label) : keep(at)
      default:
        return keep(at)
    }
  }

  for (let index = 0; index < lines.length; index++) {
    index = handleLine(index)
  }

  if (fence) flag('unterminated-fence', lines.length, 'a fenced code block is never closed')
  if (!inSlides) flag('missing-anchor', 1, 'the document has no "## Slides" anchor, so it holds no slides')

  return { title, slides, findings }
}

/**
 * Read the HTML-comment metadata block that opens a slide (§2.3). Values
 * continue onto indented lines, so a value may itself contain colons.
 * @param {string[]} lines
 * @param {number} start
 * @param {Slide} slide
 * @param {(code: string, line: number, message: string) => void} flag
 * @returns {number} index of the last consumed line
 */
function readMetadata(lines, start, slide, flag) {
  const collected = []
  let index = start
  let closed = false

  for (; index < lines.length; index++) {
    const text = lines[index]
    const stripped = text
      .replace(/^\s*<!--/, '')
      .replace(/-->\s*$/, '')
      .trim()
    if (stripped !== '') collected.push({ text: stripped, line: index + 1, raw: text })
    if (/-->\s*$/.test(text)) {
      closed = true
      break
    }
  }

  if (!closed) {
    flag('unterminated-metadata', start + 1, 'the metadata comment is never closed with "-->"')
    return lines.length
  }

  for (const entry of collected) {
    const at = entry.text.indexOf(':')
    const indented = /^\s/.test(entry.raw) && !/^\s*<!--/.test(entry.raw)
    if (at === -1) {
      if (indented && slide.metadata.length > 0) {
        slide.metadata[slide.metadata.length - 1].value += ` ${entry.text}`
        continue
      }
      flag(
        'malformed-metadata',
        entry.line,
        `metadata line "${entry.text}" is not a "key: value" pair`,
      )
      continue
    }
    const key = entry.text.slice(0, at).trim()
    const value = entry.text.slice(at + 1).trim()
    if (!METADATA_KEYS.has(key)) {
      flag(
        'unknown-metadata-key',
        entry.line,
        `unknown metadata key "${key}" — expected ${[...METADATA_KEYS].join(', ')}`,
      )
      continue
    }
    if (key === 'media' && !MEDIA_STATES.has(value)) {
      flag(
        'invalid-media-state',
        entry.line,
        `media: "${value}" — expected ${[...MEDIA_STATES].join(' | ')}`,
      )
      continue
    }
    slide.metadata.push({ key, value, line: entry.line })
  }

  return index
}

/**
 * The value of a single-valued metadata key.
 * @param {Slide} slide
 * @param {string} key
 */
export function metaValue(slide, key) {
  const entry = slide.metadata.find((item) => item.key === key)
  return entry ? entry.value : null
}

/**
 * Asset paths the slide body references, in inline-image syntax (§2.2).
 * Fenced examples and remote URLs are not references to resolve.
 * @param {Slide} slide
 */
export function slideAssets(slide) {
  /** @type {{ path: string, line: number }[]} */
  const assets = []
  for (const entry of slide.body) {
    if (entry.fenced) continue
    for (const match of entry.text.matchAll(IMAGE)) {
      const path = match[1]
      if (/^(https?:|data:|#)/.test(path)) continue
      assets.push({ path, line: entry.line })
    }
  }
  return assets
}

/**
 * @param {Slide} slide
 * @param {string} canonical
 */
export function findSection(slide, canonical) {
  return slide.sections.find((item) => item.canonical === canonical) ?? null
}
