export interface QualityLevel {
  name: string
  pixelRatio: number
  /** Fraction of ambient particles drawn */
  particles: number
  /** fbm octaves in the background shader */
  octaves: number
  /** Text-particle budget per line */
  textParticles: number
}

export const QUALITY: QualityLevel[] = [
  { name: 'ultra', pixelRatio: 1.5, particles: 1, octaves: 5, textParticles: 7000 },
  { name: 'high', pixelRatio: 1.25, particles: 0.75, octaves: 5, textParticles: 5000 },
  { name: 'medium', pixelRatio: 1, particles: 0.5, octaves: 4, textParticles: 3500 },
  { name: 'low', pixelRatio: 0.8, particles: 0.35, octaves: 3, textParticles: 2000 }
]

/**
 * Watches frame times and steps quality down when frames stay slow (>20 ms for 2 s),
 * and back up after a long stretch of fast frames, so the show never stutters.
 */
export class QualityGovernor {
  level = 0
  fps = 60
  frameMs = 16.7
  private slowFor = 0
  private fastFor = 0
  private cooldown = 0

  constructor(private onChange: (q: QualityLevel) => void) {
    onChange(QUALITY[0])
  }

  get current(): QualityLevel {
    return QUALITY[this.level]
  }

  tick(dt: number): void {
    const ms = dt * 1000
    this.frameMs += (ms - this.frameMs) * 0.05
    this.fps = 1000 / this.frameMs
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.cooldown > 0) return
    if (this.frameMs > 20) {
      this.slowFor += dt
      this.fastFor = 0
    } else if (this.frameMs < 17.5) {
      this.fastFor += dt
      this.slowFor = 0
    } else {
      this.slowFor = Math.max(0, this.slowFor - dt)
      this.fastFor = Math.max(0, this.fastFor - dt)
    }
    if (this.slowFor > 2 && this.level < QUALITY.length - 1) this.set(this.level + 1)
    else if (this.fastFor > 15 && this.level > 0) this.set(this.level - 1)
  }

  private set(level: number): void {
    this.level = level
    this.slowFor = this.fastFor = 0
    this.cooldown = 3
    this.onChange(QUALITY[level])
  }
}
