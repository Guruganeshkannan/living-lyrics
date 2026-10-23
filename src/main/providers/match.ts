import { normalizeRoman } from '../lyricMood'

function simKey(s: string): string {
  const base = s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
  // Fold romanization variants so "Kaadhal" ~ "Kadhal"
  return /^[a-z0-9 ]+$/.test(base) ? base.split(' ').map(normalizeRoman).join(' ') : base
}

/** Dice coefficient over character bigrams: 1 = identical. Containment counts as a strong match. */
export function similarity(a: string, b: string): number {
  const x = simKey(a)
  const y = simKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const grams = (s: string) => {
    const cps = Array.from(s.replace(/ /g, ''))
    const m = new Map<string, number>()
    for (let i = 0; i < cps.length - 1; i++) {
      const g = cps[i] + cps[i + 1]
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const gx = grams(x)
  const gy = grams(y)
  let inter = 0
  let total = 0
  gx.forEach((n, g) => {
    inter += Math.min(n, gy.get(g) ?? 0)
    total += n
  })
  gy.forEach((n) => (total += n))
  const contained = x.includes(y) || y.includes(x) ? 0.85 : 0
  return Math.max(contained, total ? (2 * inter) / total : 0)
}

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

/** LRC timestamp text for seconds, e.g. 01:02.34 */
export const lrcTime = fmt
