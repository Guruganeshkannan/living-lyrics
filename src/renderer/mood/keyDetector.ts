// Krumhansl–Kessler key profiles, index 0 = tonic
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function pearson(a: ArrayLike<number>, b: ArrayLike<number>, rot: number): number {
  let ma = 0,
    mb = 0
  for (let i = 0; i < 12; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= 12
  mb /= 12
  let num = 0,
    da = 0,
    db = 0
  for (let i = 0; i < 12; i++) {
    const x = a[(i + rot) % 12] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0
}

export interface KeyEstimate {
  tonic: number
  mode: 'major' | 'minor'
  name: string
  /** -1 (clearly minor) .. 1 (clearly major) */
  modeScore: number
  /** 0..1 how well the best key fits */
  confidence: number
}

export function estimateKey(chroma: ArrayLike<number>): KeyEstimate {
  let bestMaj = -2,
    bestMajT = 0,
    bestMin = -2,
    bestMinT = 0
  for (let t = 0; t < 12; t++) {
    const cMaj = pearson(chroma, MAJOR, t)
    const cMin = pearson(chroma, MINOR, t)
    if (cMaj > bestMaj) [bestMaj, bestMajT] = [cMaj, t]
    if (cMin > bestMin) [bestMin, bestMinT] = [cMin, t]
  }
  const major = bestMaj >= bestMin
  const tonic = major ? bestMajT : bestMinT
  return {
    tonic,
    mode: major ? 'major' : 'minor',
    name: `${NAMES[tonic]} ${major ? 'major' : 'minor'}`,
    // Relative major/minor share notes, so differences are small; scale them up
    modeScore: Math.max(-1, Math.min(1, (bestMaj - bestMin) * 6)),
    confidence: Math.max(0, Math.max(bestMaj, bestMin))
  }
}

/** Accumulates chroma over a long window (~20s) so the key estimate is stable. */
export class KeyDetector {
  private acc = new Float32Array(12)
  private weight = 0
  estimate: KeyEstimate = { tonic: 0, mode: 'major', name: '?', modeScore: 0, confidence: 0 }

  reset(): void {
    this.acc.fill(0)
    this.weight = 0
    this.estimate = { tonic: 0, mode: 'major', name: '?', modeScore: 0, confidence: 0 }
  }

  /** Seconds of musical audio that went into the estimate */
  get seconds(): number {
    return this.weight
  }

  update(chroma: Float32Array, dt: number, silent: boolean): KeyEstimate {
    if (silent) return this.estimate
    const decay = Math.exp(-dt / 20)
    for (let i = 0; i < 12; i++) this.acc[i] = this.acc[i] * decay + chroma[i] * dt
    this.weight = Math.min(30, this.weight + dt)
    this.estimate = estimateKey(this.acc)
    return this.estimate
  }
}
