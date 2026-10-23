/** Writing-system helpers shared by the lyric parser (main) and the text renderer. */

export type Script =
  | 'latin'
  | 'devanagari'
  | 'bengali'
  | 'gurmukhi'
  | 'gujarati'
  | 'oriya'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'arabic'
  | 'other'

const RANGES: [Script, number, number][] = [
  ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff],
  ['gurmukhi', 0x0a00, 0x0a7f],
  ['gujarati', 0x0a80, 0x0aff],
  ['oriya', 0x0b00, 0x0b7f],
  ['tamil', 0x0b80, 0x0bff],
  ['telugu', 0x0c00, 0x0c7f],
  ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f],
  ['arabic', 0x0600, 0x06ff],
  ['arabic', 0x0750, 0x077f],
  ['arabic', 0xfb50, 0xfdff],
  ['arabic', 0xfe70, 0xfeff],
  ['devanagari', 0xa8e0, 0xa8ff]
]

export function scriptOf(cp: number): Script | null {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) return 'latin'
  for (const [s, lo, hi] of RANGES) if (cp >= lo && cp <= hi) return s
  return null
}

/** The dominant script of a piece of text (by letter count). */
export function detectScript(text: string): Script {
  const counts = new Map<Script, number>()
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!)
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  let best: Script = 'latin'
  let n = 0
  counts.forEach((c, s) => {
    if (c > n) [best, n] = [s, c]
  })
  return n ? best : 'other'
}

export const isIndic = (s: Script) => s !== 'latin' && s !== 'arabic' && s !== 'other'
export const isRtl = (s: Script) => s === 'arabic'

/** Viramas (halant / pulli) of the Indic scripts: a grapheme ending in one joins the next. */
const VIRAMAS = new Set([0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d4d])
const ZWJ = 0x200d
const ZWNJ = 0x200c

let graphemer: Intl.Segmenter | null = null
function graphemes(text: string): string[] {
  graphemer ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(graphemer.segment(text), (s) => s.segment)
}

/**
 * Split a word into visual units that can be animated independently without
 * breaking shaping: aksharas for Indic scripts (conjuncts stay together),
 * graphemes for Latin, and the whole word for cursive Arabic script.
 */
export function segment(word: string): string[] {
  const script = detectScript(word)
  if (script === 'arabic') return [word]
  const gs = graphemes(word)
  if (!isIndic(script)) return gs
  const out: string[] = []
  let joinNext = false
  for (const g of gs) {
    if (joinNext && out.length) out[out.length - 1] += g
    else out.push(g)
    const last = g.codePointAt(g.length - 1)!
    // Tamil pulli usually shows as a visible dot rather than a conjunct, except in க்ஷ / ஸ்ரீ
    const viramaJoin = VIRAMAS.has(last) && !(last === 0x0bcd && !/[கஸ]்$/.test(g))
    joinNext = viramaJoin || last === ZWJ
    if (last === ZWNJ) joinNext = false
  }
  // A trailing virama with nothing after it stays attached to its consonant (already is)
  return out
}

/** Syllable estimate used to spread a line's duration over its words. */
export function syllableCount(word: string): number {
  const script = detectScript(word)
  if (script === 'latin' || script === 'other') {
    const w = word.toLowerCase().replace(/[^a-z]/g, '')
    if (!w) return 1
    const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
    return Math.max(1, groups ? groups.length : 1)
  }
  if (script === 'arabic') {
    // Rough: Urdu syllables ~ letters / 2
    const letters = word.replace(/[^؀-ۿݐ-ݿ]/g, '').length
    return Math.max(1, Math.round(letters / 2))
  }
  // Indic: each akshara is about one sung syllable; a dead consonant (pulli/halant at the end) is not
  return Math.max(1, segment(word).filter((a) => !VIRAMAS.has(a.codePointAt(a.length - 1)!)).length)
}
