import { syllableCount } from '@shared/script'
import type { LyricLine, LyricWord } from '@shared/types'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]/i

function toMs(min: string, sec: string): number {
  return Math.round((parseInt(min, 10) * 60 + parseFloat(sec.replace(':', '.'))) * 1000)
}

/** Unicode-aware syllable estimate (aksharas for Indic scripts, vowel groups for Latin). */
export const syllables = syllableCount

/** Lay words out inside a sung window, weighted by syllables. */
function layoutWords(parts: string[], startMs: number, windowMs: number): LyricWord[] {
  const counts = parts.map(syllables)
  const total = counts.reduce((a, b) => a + b, 0)
  let t = startMs
  return parts.map((p, i) => {
    const d = (windowMs * counts[i]) / total
    const word = { text: p, startMs: Math.round(t), endMs: Math.round(t + d) }
    t += d
    return word
  })
}

/** Default per-syllable rate (ms) when we know nothing about the song yet. */
const DEFAULT_SYLLABLE_MS = 300

/** Estimate word timings when the LRC only has line timestamps. */
export function estimateWords(text: string, startMs: number, endMs: number, syllableMs = DEFAULT_SYLLABLE_MS): LyricWord[] {
  const parts = text.split(/\s+/).filter(Boolean)
  if (!parts.length) return []
  const total = parts.map(syllables).reduce((a, b) => a + b, 0)
  const duration = Math.max(200, endMs - startMs)
  // Singers rarely stretch a line across a long gap; cap the sung window at the song's own pace
  const window = Math.min(duration * 0.95, Math.max(total * syllableMs * 0.9 + 250, duration * 0.35))
  return layoutWords(parts, startMs, window)
}

/**
 * Learn how fast this particular song is sung (ms per syllable) from its
 * tightly packed lines, then re-estimate every line that has no word tags.
 */
export function retimeWords(lines: LyricLine[]): number {
  const rates: number[] = []
  for (const l of lines) {
    const dur = l.endMs - l.startMs
    const syl = l.text.split(/\s+/).filter(Boolean).map(syllables).reduce((a, b) => a + b, 0)
    if (syl >= 3 && dur > 600 && dur < 8000) rates.push(dur / syl)
  }
  rates.sort((a, b) => a - b)
  // Lower quartile ≈ lines sung with no trailing gap, which is the true singing rate
  const rate = rates.length >= 4 ? rates[Math.floor(rates.length * 0.3)] : DEFAULT_SYLLABLE_MS
  const clamped = Math.min(650, Math.max(140, rate))
  for (const l of lines) if (l.wordsEstimated) l.words = estimateWords(l.text, l.startMs, l.endMs, clamped)
  return clamped
}

interface RawEntry {
  time: number
  text: string
  words: LyricWord[] | null
}

function parseEnhanced(body: string, lineStart: number): { text: string; words: LyricWord[] | null } {
  WORD_TAG.lastIndex = 0
  if (!WORD_TAG.test(body)) return { text: body.trim(), words: null }
  WORD_TAG.lastIndex = 0
  const marks: { time: number; idx: number; len: number }[] = []
  let m: RegExpExecArray | null
  while ((m = WORD_TAG.exec(body))) marks.push({ time: toMs(m[1], m[2]), idx: m.index, len: m[0].length })
  const words: LyricWord[] = []
  const lead = body.slice(0, marks[0].idx).trim()
  if (lead) words.push({ text: lead, startMs: lineStart, endMs: marks[0].time })
  marks.forEach((mk, i) => {
    const next = marks[i + 1]
    const chunk = body.slice(mk.idx + mk.len, next ? next.idx : undefined).trim()
    if (!chunk) return
    const end = next ? next.time : mk.time + 600
    const sub = chunk.split(/\s+/)
    const step = (end - mk.time) / sub.length
    sub.forEach((s, j) => words.push({ text: s, startMs: Math.round(mk.time + step * j), endMs: Math.round(mk.time + step * (j + 1)) }))
  })
  return { text: words.map((w) => w.text).join(' '), words }
}

export function parseLrc(lrc: string, durationMs = 0): LyricLine[] {
  let offset = 0
  const entries: RawEntry[] = []
  for (const rawLine of lrc.replace(/^﻿/, '').split(/\r?\n/)) {
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
    // Lines of only symbols (♪, ...) are instrumental markers, not lyrics
    if (!e.text || !/[\p{L}\p{N}]/u.test(e.text)) {
      pendingBreak = lines.length > 0
      return
    }
    const next = entries[i + 1]
    const fallbackEnd = durationMs > e.time ? Math.min(durationMs, e.time + 6000) : e.time + 4000
    const endMs = next ? next.time : fallbackEnd
    const start = Math.max(0, e.time)
    lines.push({
      index: lines.length,
      startMs: start,
      endMs,
      text: e.text,
      words: e.words ?? estimateWords(e.text, start, endMs),
      stanzaBreak: pendingBreak,
      wordsEstimated: !e.words
    })
    pendingBreak = false
  })
  retimeWords(lines)
  return lines
}

/** Plain lyrics with no timing: spread lines across the song as a best effort. */
export function spreadPlainLyrics(plain: string, durationMs: number): LyricLine[] {
  const raw = plain.split(/\r?\n/).map((l) => l.trim())
  const textLines = raw.filter(Boolean)
  if (!textLines.length || durationMs <= 0) return []
  // Weight each line by its syllables so long lines get more time
  const weights = textLines.map((l) => Math.max(2, l.split(/\s+/).map(syllables).reduce((a, b) => a + b, 0)))
  const totalW = weights.reduce((a, b) => a + b, 0)
  const start = durationMs * 0.08
  const span = durationMs * 0.85
  const lines: LyricLine[] = []
  let pendingBreak = false
  let t = start
  let k = 0
  for (const l of raw) {
    if (!l) {
      pendingBreak = lines.length > 0
      continue
    }
    const d = (span * weights[k++]) / totalW
    const s = Math.round(t)
    const e = Math.round(t + d)
    t += d
    lines.push({ index: lines.length, startMs: s, endMs: e, text: l, words: estimateWords(l, s, e), stanzaBreak: pendingBreak, wordsEstimated: true })
    pendingBreak = false
  }
  return lines
}
