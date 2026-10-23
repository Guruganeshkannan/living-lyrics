import { clamp } from '@shared/moods'
import type { MoodPoint } from '@shared/types'
import type { AudioState } from '../audio/audioEngine'
import { KeyDetector } from './keyDetector'
import { estimateTempo } from './tempoTracker'

export type EnergyEvent = 'surge' | 'drop' | null

/**
 * Places the music itself on the valence/arousal plane, from key mode,
 * tempo, loudness and brightness. Also spots big energy changes (drops, chorus hits).
 */
export class AudioMood {
  readonly key = new KeyDetector()
  bpm = 0
  tempoConfidence = 0
  point: MoodPoint = { valence: 0, arousal: 0 }
  /** 0..1 how much the estimate can be trusted yet */
  confidence = 0
  private shortE = 0
  private longE = 0
  private surgeTime = 0
  private dropTime = 0
  private cooldown = 0

  reset(): void {
    this.key.reset()
    this.confidence = 0
    this.surgeTime = this.dropTime = 0
    this.longE = this.shortE
  }

  update(a: AudioState, dt: number): EnergyEvent {
    const k = this.key.update(a.chroma, dt, a.silent)
    const t = estimateTempo(a.beatTimes)
    if (t.bpm) {
      this.bpm = t.bpm
      this.tempoConfidence = t.confidence
    }

    const tempoN = this.bpm ? clamp((this.bpm - 115) / 50) : 0
    const valenceRaw = 0.7 * k.modeScore * Math.min(1, k.confidence * 1.5) + 0.3 * (a.centroid - 0.45) * 2
    const arousalRaw = 0.4 * tempoN * this.tempoConfidence + 0.45 * (a.energy * 2 - 0.9) + 0.25 * (a.flux * 2 - 0.6)
    // Slow follow (~5s) so the mood doesn't jitter with every bar
    const f = 1 - Math.exp(-dt / 5)
    this.point = {
      valence: this.point.valence + (clamp(valenceRaw) - this.point.valence) * f,
      arousal: this.point.arousal + (clamp(arousalRaw) - this.point.arousal) * f
    }
    this.confidence = Math.min(1, this.key.seconds / 15) * (a.silent ? 0.5 : 1)

    return this.detectEnergyEvent(a.rms, dt)
  }

  private detectEnergyEvent(rms: number, dt: number): EnergyEvent {
    this.shortE += (rms - this.shortE) * (1 - Math.exp(-dt / 1.2))
    this.longE += (rms - this.longE) * (1 - Math.exp(-dt / 10))
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.longE < 0.003 || this.cooldown > 0) return null
    const ratio = this.shortE / this.longE
    // Must hold for ~2 bars to count, which filters single loud hits
    const twoBars = this.bpm ? (8 * 60) / this.bpm : 4
    this.surgeTime = ratio > 1.4 ? this.surgeTime + dt : 0
    this.dropTime = ratio < 0.6 ? this.dropTime + dt : 0
    if (this.surgeTime > twoBars * 0.5) {
      this.surgeTime = 0
      this.cooldown = twoBars
      return 'surge'
    }
    if (this.dropTime > twoBars * 0.5) {
      this.dropTime = 0
      this.cooldown = twoBars
      return 'drop'
    }
    return null
  }
}
