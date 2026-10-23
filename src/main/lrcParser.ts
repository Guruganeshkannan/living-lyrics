import type { LyricLine, LyricWord } from '@shared/types'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]/i

function toMs(min: string, sec: string): number {
  return Math.round((parseInt(min, 10) * 60 + parseFloat(sec.replace(':', '.'))) * 1000)
}

/** Rough syllable count, used to spread a line's duration over its words. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 1
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Estimate word timings when the LRC only has line timestamps. */
export function estimateWords(text: string, startMs: number, endMs: number): LyricWord[] {
  const parts = text.split(/\s+/).filter(Boolean)
  if (!parts.length) return []
  const counts = parts.map(syllables)
  const total = counts.reduce((a, b) => a + b, 0)
  // Singers rarely stretch a line across a long gap; cap the sung window
  const window = Math.min(endMs - startMs, total * 320 + 500)
  let t = startMs
  return parts.map((p, i) => {
    const d = (window * counts[i]) / total
    const word = { text: p, startMs: Math.round(t), endMs: Math.round(t + d) }
    t += d
    return word
  })
}

interface RawEntry {
  time: number
  text: string
  words: LyricWord[] | null
}

function parseEnhanced(body: string, lineStart: number): { text: string; words: LyricWord[] | null } {
  if (!WORD_TAG.test(body)) return { text: body.trim(), words: null }
  WORD_TAG.lastIndex = 0
  const marks: { time: number; idx: number; len: number }[] = []
  let m: RegExpExecArray | null
  while ((m = WORD_TAG.exec(body))) marks.push({ time: toMs(m[1], m[2]), idx: m.index, len: m[0].length })
  const words: LyricWord[] = []
  // Text before the first tag belongs to the line start
  const lead = body.slice(0, marks[0].idx).trim()
  if (lead) words.push({ text: lead, startMs: lineStart, endMs: marks[0].time })
  marks.forEach((mk, i) => {
    const next = marks[i + 1]
    const chunk = body.slice(mk.idx + mk.len, next ? next.idx : undefined).trim()
    if (!chunk) return
    const end = next ? next.time : mk.time + 600
    // A tag can precede several words; split its span between them
    const sub = chunk.split(/\s+/)
    const step = (end - mk.time) / sub.length
    sub.forEach((s, j) => words.push({ text: s, startMs: Math.round(mk.time + step * j), endMs: Math.round(mk.time + step * (j + 1)) }))
  })
  return { text: words.map((w) => w.text).join(' '), words }
}

export function parseLrc(lrc: string, durationMs = 0): LyricLine[] {
  let offset = 0
  const entries: RawEntry[] = []
  for (const rawLine of lrc.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const off = OFFSET_TAG.exec(line)
    if (off) {
      offset = parseInt(off[1], 10)
      continue
    }
    TIME_TAG.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    let lastEnd = 0
    while ((m = TIME_TAG.exec(line)) && m.index === lastEnd) {
      times.push(toMs(m[1], m[2]))
      lastEnd = m.index + m[0].length
    }
    if (!times.length) continue
    const body = line.slice(lastEnd)
    for (const t of times) {
      const { text, words } = parseEnhanced(body, t)
      entries.push({ time: t, text, words })
    }
  }
  // LRC offset: positive means lyrics should appear earlier
  entries.forEach((e) => {
    e.time -= offset
    e.words?.forEach((w) => {
      w.startMs -= offset
      w.endMs -= offset
    })
  })
  entries.sort((a, b) => a.time - b.time)

  const lines: LyricLine[] = []
  let pendingBreak = false
  entries.forEach((e, i) => {
    if (!e.text) {
      pendingBreak = lines.length > 0
      return
    }
    const next = entries[i + 1]
    const fallbackEnd = durationMs > e.time ? Math.min(durationMs, e.time + 6000) : e.time + 4000
    const endMs = next ? next.time : fallbackEnd
    lines.push({
      index: lines.length,
      startMs: Math.max(0, e.time),
      endMs,
      text: e.text,
      words: e.words ?? estimateWords(e.text, Math.max(0, e.time), endMs),
      stanzaBreak: pendingBreak
    })
    pendingBreak = false
  })
  return lines
}

/** Plain lyrics with no timing: spread lines across the song as a best effort. */
export function spreadPlainLyrics(plain: string, durationMs: number): LyricLine[] {
  const raw = plain.split(/\r?\n/).map((l) => l.trim())
  const textLines = raw.filter(Boolean)
  if (!textLines.length || durationMs <= 0) return []
  const start = durationMs * 0.08
  const span = durationMs * 0.85
  const step = span / textLines.length
  const lines: LyricLine[] = []
  let pendingBreak = false
  for (const l of raw) {
    if (!l) {
      pendingBreak = lines.length > 0
      continue
    }
    const s = Math.round(start + step * lines.length)
    const e = Math.round(s + step)
    lines.push({ index: lines.length, startMs: s, endMs: e, text: l, words: estimateWords(l, s, e), stanzaBreak: pendingBreak })
    pendingBreak = false
  }
  return lines
}
