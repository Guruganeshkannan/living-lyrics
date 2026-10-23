/** Estimate tempo from detected beat times (ms). Returns bpm folded into 70..180. */
export function estimateTempo(beatTimes: number[]): { bpm: number; confidence: number } {
  const intervals: number[] = []
  for (let i = 1; i < beatTimes.length; i++) {
    const d = beatTimes[i] - beatTimes[i - 1]
    if (d > 250 && d < 1500) intervals.push(d)
  }
  if (intervals.length < 4) return { bpm: 0, confidence: 0 }
  const recent = intervals.slice(-16).sort((a, b) => a - b)
  const median = recent[Math.floor(recent.length / 2)]
  let bpm = 60000 / median
  while (bpm < 70) bpm *= 2
  while (bpm > 180) bpm /= 2
  // Intervals that are ~1x or ~2x the median both support this tempo
  const fits = recent.filter((d) => {
    const r = d / median
    return Math.abs(r - 1) < 0.1 || Math.abs(r - 2) < 0.15 || Math.abs(r - 0.5) < 0.08
  }).length
  return { bpm: Math.round(bpm), confidence: fits / recent.length }
}
