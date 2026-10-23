import type { MoodId, MoodPoint } from './types'

/** Where each mood lives on the valence/arousal plane (Russell's circumplex). */
export const MOOD_COORDS: Record<MoodId, MoodPoint> = {
  romance: { valence: 0.6, arousal: -0.3 },
  calm: { valence: 0.3, arousal: -0.8 },
  nostalgic: { valence: 0.05, arousal: -0.45 },
  playful: { valence: 0.85, arousal: 0.3 },
  triumphant: { valence: 0.7, arousal: 0.6 },
  hype: { valence: 0.45, arousal: 0.9 },
  heartbreak: { valence: -0.65, arousal: -0.5 },
  dark: { valence: -0.85, arousal: 0.1 },
  revenge: { valence: -0.6, arousal: 0.8 }
}

export const MOOD_IDS = Object.keys(MOOD_COORDS) as MoodId[]

export const clamp = (x: number, lo = -1, hi = 1): number => Math.min(hi, Math.max(lo, x))

/** The k closest moods to a point, with inverse-distance weights summing to 1. */
export function nearestMoods(p: MoodPoint, k = 2): { id: MoodId; weight: number }[] {
  const ranked = MOOD_IDS.map((id) => {
    const c = MOOD_COORDS[id]
    return { id, d: Math.hypot(c.valence - p.valence, c.arousal - p.arousal) }
  }).sort((a, b) => a.d - b.d)
  const top = ranked.slice(0, k)
  // Sharp falloff so a point sitting on a mood is fully that mood
  const inv = top.map((t) => 1 / Math.pow(t.d + 1e-3, 3))
  const sum = inv.reduce((a, b) => a + b, 0)
  return top.map((t, i) => ({ id: t.id, weight: inv[i] / sum }))
}

/**
 * Weighted average of mood coordinates. `sharpen` > 1 lets the dominant moods win,
 * so a song with mixed vocabulary doesn't collapse into the neutral middle.
 */
export function pointFromWeights(weights: Partial<Record<MoodId, number>>, sharpen = 1): MoodPoint & { total: number } {
  let v = 0
  let a = 0
  let total = 0
  for (const id of MOOD_IDS) {
    const w = Math.pow(weights[id] ?? 0, sharpen)
    if (w <= 0) continue
    v += MOOD_COORDS[id].valence * w
    a += MOOD_COORDS[id].arousal * w
    total += w
  }
  return total > 0 ? { valence: v / total, arousal: a / total, total } : { valence: 0, arousal: 0, total: 0 }
}
