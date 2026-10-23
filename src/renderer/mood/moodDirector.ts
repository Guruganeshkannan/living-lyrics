import { MOOD_COORDS, MOOD_IDS, clamp, nearestMoods } from '@shared/moods'
import type { LineAnalysis, LyricAnalysis, MoodId, MoodPoint, Section, SectionType } from '@shared/types'
import type { AudioState } from '../audio/audioEngine'
import type { AudioMood, EnergyEvent } from './audioMood'

export interface MoodState {
  point: MoodPoint
  blend: { id: MoodId; weight: number }[]
  sectionType: SectionType
  /** 0..~1.6 how hard everything should hit right now */
  intensity: number
  override: MoodId | null
}

const SECTION_INTENSITY: Record<SectionType, number> = {
  intro: 0.6,
  verse: 0.85,
  chorus: 1.25,
  bridge: 1.0,
  instrumental: 0.9,
  outro: 0.6
}

/** Critically-damped spring toward a target; gives mood changes weight and follow-through. */
class Spring2 {
  pos: MoodPoint = { valence: 0, arousal: 0 }
  private vel = { valence: 0, arousal: 0 }
  constructor(private omega: number) {}
  snap(p: MoodPoint): void {
    this.pos = { ...p }
    this.vel = { valence: 0, arousal: 0 }
  }
  step(target: MoodPoint, dt: number): void {
    for (const k of ['valence', 'arousal'] as const) {
      const x = this.pos[k] - target[k]
      const a = -this.omega * this.omega * x - 2 * this.omega * this.vel[k]
      this.vel[k] += a * dt
      this.pos[k] += this.vel[k] * dt
    }
  }
}

export class MoodDirector {
  private spring = new Spring2(1.6)
  private surge = 0
  private songTime = 0
  override: MoodId | null = null
  state: MoodState = { point: { valence: 0, arousal: 0 }, blend: [{ id: 'nostalgic', weight: 1 }], sectionType: 'intro', intensity: 0.8, override: null }

  constructor(private audioMood: AudioMood) {}

  /** New song: jump straight to the lyric mood so the first frame already fits. */
  reset(analysis: LyricAnalysis | null): void {
    this.songTime = 0
    this.surge = 0
    this.spring.snap(analysis ? { valence: analysis.overall.valence, arousal: analysis.overall.arousal } : { valence: 0, arousal: 0 })
  }

  cycleOverride(): MoodId | null {
    const i = this.override ? MOOD_IDS.indexOf(this.override) : -1
    this.override = i + 1 < MOOD_IDS.length ? MOOD_IDS[i + 1] : null
    return this.override
  }

  update(dt: number, audio: AudioState, analysis: LyricAnalysis | null, section: Section | null, line: LineAnalysis | null, event: EnergyEvent): MoodState {
    this.songTime += dt
    let target: MoodPoint

    if (this.override) {
      target = MOOD_COORDS[this.override]
    } else {
      let lyric: MoodPoint | null = null
      if (analysis) {
        const o = analysis.overall
        const s = section ?? { valence: o.valence, arousal: o.arousal }
        lyric = { valence: 0.5 * o.valence + 0.5 * s.valence, arousal: 0.5 * o.arousal + 0.5 * s.arousal }
        // Emotionally loaded lines tug the mood briefly
        if (line && line.strength > 1) {
          const k = Math.min(0.35, line.strength * 0.08)
          lyric = { valence: lyric.valence + (line.valence - lyric.valence) * k, arousal: lyric.arousal + (line.arousal - lyric.arousal) * k }
        }
      }
      const am = this.audioMood
      // Audio earns trust over the first ~15s as key/tempo estimates settle
      const ramp = Math.min(1, this.songTime / 15)
      const audioW = lyric ? 0.4 * ramp * am.confidence : 1
      const base = lyric ?? { valence: 0, arousal: 0 }
      target = {
        valence: base.valence * (1 - audioW) + am.point.valence * audioW,
        arousal: base.arousal * (1 - audioW) + am.point.arousal * audioW
      }
    }

    if (event === 'surge') this.surge = 1
    if (event === 'drop') this.surge = -0.6
    this.surge *= Math.exp(-dt / 6)
    // Surges push arousal up for a while, like a chorus kicking in
    target = { valence: target.valence, arousal: clamp(target.arousal + this.surge * 0.25) }

    this.spring.step(target, dt)
    const point = { valence: clamp(this.spring.pos.valence), arousal: clamp(this.spring.pos.arousal) }
    const sectionType = section?.type ?? 'verse'
    const liveEnergy = audio.silent ? 0.3 : audio.energy
    const intensity = Math.max(0.2, SECTION_INTENSITY[sectionType] * (0.55 + 0.45 * liveEnergy) * (1 + 0.25 * Math.max(0, this.surge)) * (0.85 + 0.3 * (point.arousal * 0.5 + 0.5)))

    this.state = { point, blend: nearestMoods(point, 2), sectionType, intensity, override: this.override }
    return this.state
  }
}
