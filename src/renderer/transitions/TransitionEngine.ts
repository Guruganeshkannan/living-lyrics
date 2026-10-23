import type { SectionType } from '@shared/types'
import type { Theme } from '../themes/themes'
import type { InPreset, OutPreset } from './presets'

export interface TransitionChoiceInput {
  theme: Theme
  sectionType: SectionType
  isSectionStart: boolean
  intensity: number
  energy: number
  lineIndex: number
  previousIn: InPreset | null
}

/** Deterministic per-line randomness, so replaying a song gets the same choreography. */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

export function chooseTransition(i: TransitionChoiceInput): { in: InPreset; out: OutPreset } {
  const rand = seeded(i.lineIndex + 1)
  const t = i.theme.transitions
  const heat = i.intensity * (0.5 + i.energy)
  let pool: InPreset[]
  if (i.isSectionStart && i.sectionType === 'chorus') pool = t.chorus
  else pool = heat > 0.85 ? t.intense : t.calm
  // Avoid running the same entrance twice in a row when there's a choice
  const options = pool.length > 1 ? pool.filter((p) => p !== i.previousIn) : pool
  const outPool = heat > 0.95 ? t.outIntense : t.out
  return {
    in: options[Math.floor(rand() * options.length)],
    out: outPool[Math.floor(rand() * outPool.length)]
  }
}
