import type { LyricLine, SectionType } from '@shared/types'

export interface RawSection {
  type: SectionType
  startMs: number
  endMs: number
  lineStart: number
  lineEnd: number
}

const INSTRUMENTAL_GAP_MS = 8000

export function normalizeLine(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // ad-libs in brackets
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similar(a: string, b: string): boolean {
  if (a === b) return true
  const ta = new Set(a.split(' '))
  const tb = new Set(b.split(' '))
  if (ta.size < 2 || tb.size < 2) return false
  let inter = 0
  ta.forEach((t) => tb.has(t) && inter++)
  return inter / (ta.size + tb.size - inter) >= 0.7
}

/** How many times each line (fuzzily) appears in the song. */
export function repeatCounts(lines: LyricLine[]): number[] {
  const norm = lines.map((l) => normalizeLine(l.text))
  return norm.map((n, i) => (n ? norm.reduce((c, m, j) => c + (j !== i && m && similar(n, m) ? 1 : 0), 1) : 1))
}

export function detectSections(lines: LyricLine[], durationMs: number): RawSection[] {
  if (!lines.length) {
    return [{ type: 'instrumental', startMs: 0, endMs: durationMs || Infinity, lineStart: 0, lineEnd: 0 }]
  }
  const counts = repeatCounts(lines)
  const songEnd = durationMs > 0 ? durationMs : lines[lines.length - 1].endMs
  const lastThird = songEnd * (2 / 3)

  const labels: SectionType[] = lines.map((l, i) => {
    if (counts[i] >= 2) return 'chorus'
    if (l.startMs >= lastThird) return 'bridge'
    return 'verse'
  })

  // A lone "chorus" line surrounded by verse lines is usually a repeated hook inside a verse
  labels.forEach((lab, i) => {
    if (lab !== 'chorus') return
    const prev = labels[i - 1]
    const next = labels[i + 1]
    if (prev && next && prev !== 'chorus' && next !== 'chorus') labels[i] = prev
  })
  // Bridges only make sense if a chorus exists somewhere; otherwise it's just another verse
  if (!labels.includes('chorus')) labels.forEach((l, i) => l === 'bridge' && (labels[i] = 'verse'))

  const sections: RawSection[] = []
  const push = (s: RawSection) => sections.push(s)
  if (lines[0].startMs > 4000) push({ type: 'intro', startMs: 0, endMs: lines[0].startMs, lineStart: 0, lineEnd: 0 })

  let cur: RawSection | null = null
  lines.forEach((l, i) => {
    const prev = lines[i - 1]
    const gap = prev ? l.startMs - prev.startMs : 0
    if (prev && gap > INSTRUMENTAL_GAP_MS && cur) {
      // Close the running section at the end of the previous line's sung part
      const sungEnd = prev.words.length ? prev.words[prev.words.length - 1].endMs + 1500 : prev.startMs + 4000
      cur.endMs = Math.min(sungEnd, l.startMs)
      push(cur)
      push({ type: 'instrumental', startMs: cur.endMs, endMs: l.startMs, lineStart: i, lineEnd: i })
      cur = null
    }
    const newBlock = !cur || cur.type !== labels[i] || (l.stanzaBreak && labels[i] === 'verse')
    if (newBlock) {
      if (cur) {
        cur.endMs = l.startMs
        push(cur)
      }
      cur = { type: labels[i], startMs: l.startMs, endMs: l.endMs, lineStart: i, lineEnd: i + 1 }
    } else if (cur) {
      cur.lineEnd = i + 1
      cur.endMs = l.endMs
    }
  })
  if (cur) push(cur)

  const last = lines[lines.length - 1]
  if (songEnd - last.endMs > 6000) push({ type: 'outro', startMs: last.endMs, endMs: songEnd, lineStart: lines.length, lineEnd: lines.length })
  return sections
}
