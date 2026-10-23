import type { KeywordEffect, MoodId, SectionType } from '@shared/types'
import { ExitStyle, type Theme } from '../themes/themes'
import type { InPreset, OutPreset } from './presets'

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

interface Profile {
  /** 0 = gentle .. 1 = violent */
  energy: number
  /** Seconds the move needs to read well (at pace 1) */
  needs: number
  moods: Partial<Record<MoodId, number>>
  /** Letter-by-letter moves get messy on very long lines */
  maxChars?: number
  /** Extra pull at the first line of a chorus */
  chorus?: number
  /** Lyrics that ask for this move ("break" → shatter, "tears" → fall) */
  keywords?: Partial<Record<KeywordEffect, number>>
  /** Only makes sense with Latin letters (scramble) */
  latinOnly?: boolean
  /** Needs real word timing (word-synced pops) */
  needsTiming?: boolean
}

export const IN_PROFILES: Record<InPreset, Profile> = {
  'word-pop': { energy: 0.6, needs: 0.3, needsTiming: true, moods: { playful: 0.9, hype: 0.8, romance: 0.5, triumphant: 0.5, revenge: 0.4 } },
  odometer: { energy: 0.5, needs: 0.6, moods: { nostalgic: 0.8, triumphant: 0.6, calm: 0.5, dark: 0.5, hype: 0.4 } },
  interleave: { energy: 0.6, needs: 0.6, moods: { hype: 0.7, dark: 0.6, triumphant: 0.6, revenge: 0.5, calm: 0.3 } },
  'bar-wipe': { energy: 0.55, needs: 0.6, moods: { triumphant: 0.8, revenge: 0.6, dark: 0.6, hype: 0.6, nostalgic: 0.4 } },
  scramble: { energy: 0.65, needs: 0.6, latinOnly: true, maxChars: 40, moods: { dark: 0.9, hype: 0.6, revenge: 0.6 } },
  'light-burst': { energy: 0.6, needs: 0.8, chorus: 0.9, moods: { romance: 0.9, calm: 0.7, heartbreak: 0.6, triumphant: 0.7 }, keywords: { glow: 0.9 } },
  'rise-soft': { energy: 0.3, needs: 0.8, moods: { romance: 0.9, calm: 0.9, heartbreak: 0.8, nostalgic: 0.6, triumphant: 0.4 } },
  wave: { energy: 0.5, needs: 0.8, moods: { romance: 0.6, playful: 0.6, hype: 0.4, heartbreak: 0.4 }, keywords: { float: 0.6 } },
  'scatter-in': { energy: 0.85, needs: 0.8, moods: { hype: 0.8, playful: 0.7, revenge: 0.3 }, keywords: { shatter: 0.5 } },
  slam: { energy: 1, needs: 0.6, chorus: 0.6, moods: { hype: 1, revenge: 0.9, triumphant: 0.6 }, keywords: { shake: 0.8 } },
  'zoom-through': { energy: 0.75, needs: 0.7, moods: { triumphant: 0.8, hype: 0.7, dark: 0.3 } },
  'glitch-slice': { energy: 0.85, needs: 0.5, moods: { dark: 1, revenge: 1, hype: 0.3 } },
  unfold: { energy: 0.45, needs: 1.0, moods: { triumphant: 0.9, nostalgic: 0.5, romance: 0.4 } },
  'flip-up': { energy: 0.45, needs: 0.8, moods: { nostalgic: 0.8, playful: 0.5, calm: 0.4, triumphant: 0.4 } },
  'mask-wipe': { energy: 0.4, needs: 0.7, moods: { nostalgic: 0.7, dark: 0.7, calm: 0.5, triumphant: 0.5, heartbreak: 0.4 } },
  'split-reveal': { energy: 0.6, needs: 0.6, moods: { triumphant: 0.8, hype: 0.6, heartbreak: 0.4, nostalgic: 0.4 } },
  'letter-rain': { energy: 0.7, needs: 1.0, maxChars: 34, moods: { playful: 0.9, heartbreak: 0.5, revenge: 0.3 }, keywords: { drip: 0.8 } },
  'spiral-in': { energy: 0.7, needs: 1.0, maxChars: 40, moods: { playful: 0.8, romance: 0.6, hype: 0.5 }, keywords: { float: 0.5 } },
  stamp: { energy: 0.95, needs: 0.45, chorus: 0.5, moods: { revenge: 1, hype: 0.9, triumphant: 0.8 }, keywords: { shake: 0.6 } },
  'elastic-stretch': { energy: 0.6, needs: 0.9, moods: { playful: 0.9, romance: 0.5 } },
  'neon-flicker': { energy: 0.6, needs: 0.6, moods: { dark: 0.9, hype: 0.6, revenge: 0.6, nostalgic: 0.3 }, keywords: { glow: 0.5, burn: 0.4 } },
  'cube-turn': { energy: 0.55, needs: 0.8, moods: { nostalgic: 0.7, dark: 0.6, triumphant: 0.6, hype: 0.4 } },
  'slide-words': { energy: 0.85, needs: 0.55, moods: { hype: 0.9, revenge: 0.8, playful: 0.5 } },
  ripple: { energy: 0.55, needs: 0.8, moods: { romance: 0.7, playful: 0.7, calm: 0.5 }, keywords: { heartbeat: 0.6 } },
  'depth-fly': { energy: 0.7, needs: 1.0, chorus: 0.5, moods: { triumphant: 0.7, romance: 0.6, calm: 0.5, hype: 0.5, dark: 0.5, heartbreak: 0.4 }, keywords: { float: 0.4 } },
  swing: { energy: 0.45, needs: 1.1, moods: { heartbreak: 0.7, romance: 0.6, calm: 0.5, nostalgic: 0.5, playful: 0.4 } }
}

export const OUT_PROFILES: Record<OutPreset, Profile> = {
  'lift-out': { energy: 0.35, needs: 0.3, moods: { calm: 0.8, romance: 0.8, triumphant: 0.6, nostalgic: 0.5, playful: 0.4 }, keywords: { float: 0.8, glow: 0.4 } },
  'slice-out': { energy: 0.55, needs: 0.45, moods: { triumphant: 0.7, hype: 0.6, nostalgic: 0.6, dark: 0.5, calm: 0.4 } },
  collapse: { energy: 0.5, needs: 0.35, moods: { dark: 0.7, revenge: 0.5, hype: 0.5, calm: 0.4, heartbreak: 0.4 } },
  'bar-wipe-out': { energy: 0.55, needs: 0.5, moods: { triumphant: 0.7, revenge: 0.6, dark: 0.6, hype: 0.5 } },
  'drift-down': { energy: 0.35, needs: 1.2, moods: { heartbreak: 1, nostalgic: 0.5 }, keywords: { drip: 1.2 } },
  shatter: { energy: 0.95, needs: 0.65, moods: { revenge: 0.9, hype: 0.7, dark: 0.5 }, keywords: { shatter: 1.5, shake: 0.6 } },
  'slam-out': { energy: 0.9, needs: 0.25, moods: { hype: 0.9, revenge: 0.7 } },
  'zoom-past': { energy: 0.8, needs: 0.45, moods: { triumphant: 0.9, hype: 0.8 }, keywords: { float: 0.4 } },
  'glitch-out': { energy: 0.8, needs: 0.35, moods: { dark: 1, revenge: 0.9 } },
  'pop-out': { energy: 0.6, needs: 0.35, moods: { playful: 1, hype: 0.4 } },
  'flip-out': { energy: 0.45, needs: 0.45, moods: { nostalgic: 0.8, playful: 0.5, triumphant: 0.4, calm: 0.4 } },
  'wipe-out': { energy: 0.4, needs: 0.5, moods: { nostalgic: 0.7, dark: 0.6, calm: 0.5 } },
  'fall-apart': { energy: 0.7, needs: 0.9, moods: { heartbreak: 0.7, playful: 0.5, revenge: 0.5 }, keywords: { drip: 0.8, shatter: 0.6 } },
  'slide-out': { energy: 0.85, needs: 0.4, moods: { hype: 0.9, revenge: 0.7, playful: 0.5 } },
  'spin-out': { energy: 0.7, needs: 0.55, moods: { playful: 0.8, hype: 0.5, romance: 0.4 } },
  sink: { energy: 0.4, needs: 0.6, moods: { heartbreak: 0.9, dark: 0.6, calm: 0.4 }, keywords: { drip: 0.6 } },
  'stretch-out': { energy: 0.75, needs: 0.4, moods: { hype: 0.7, dark: 0.5, revenge: 0.5 } }
}

/** Lyrics that name an element decide how the line falls apart into particles. */
const KEYWORD_EXIT: Partial<Record<KeywordEffect, ExitStyle>> = {
  burn: ExitStyle.Ash,
  shatter: ExitStyle.Explode,
  drip: ExitStyle.Droplets,
  glow: ExitStyle.Sparks,
  float: ExitStyle.Dust,
  heartbeat: ExitStyle.Petals
}

export interface TransitionChoiceInput {
  theme: Theme
  /** Current mood blend (weights sum to 1) */
  blend: { id: MoodId; weight: number }[]
  sectionType: SectionType
  isSectionStart: boolean
  isSectionEnd: boolean
  intensity: number
  /** Live loudness 0..1 */
  energy: number
  bpm: number
  lineIndex: number
  lineDurationMs: number
  lineChars: number
  /** The line's own emotion (-1..1) */
  lineArousal: number
  keywords: KeywordEffect[]
  /** Most recent first */
  recentIn: InPreset[]
  recentOut: OutPreset[]
  pace: number
  /** Line is in Latin script (romanized or English) */
  latin: boolean
  /** Lyrics carry real timing (synced LRC) */
  synced: boolean
}

export interface TransitionChoice {
  in: InPreset
  out: OutPreset
  /** Leave by disintegrating into particles instead of a DOM exit */
  particleExit: boolean
  exitStyle: ExitStyle
  /** How hard this line should hit, 0..1 (for debugging / tuning) */
  targetEnergy: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function moodFit(p: Profile, blend: TransitionChoiceInput['blend']): number {
  return blend.reduce((s, b) => s + b.weight * (p.moods[b.id] ?? 0), 0)
}

function keywordFit(p: Profile, keywords: KeywordEffect[]): number {
  return keywords.reduce((s, k) => s + (p.keywords?.[k] ?? 0), 0)
}

/**
 * Pick the line's entrance and exit from the song itself: its mood blend, how
 * hard this moment hits (section, live energy, tempo, the line's own emotion),
 * how much time the line gives us, its length and its words.
 */
export function chooseTransition(i: TransitionChoiceInput): TransitionChoice {
  const rand = seeded(i.lineIndex + 1)
  const tempoN = clamp01(((i.bpm || 110) - 70) / 110)
  const targetEnergy = clamp01(0.3 * clamp01(i.intensity / 1.4) + 0.3 * i.energy + 0.25 * (i.lineArousal * 0.5 + 0.5) + 0.15 * tempoN + (i.isSectionStart && i.sectionType === 'chorus' ? 0.15 : 0))
  const secs = i.lineDurationMs / 1000
  const signature = new Set<string>([...i.theme.transitions.calm, ...i.theme.transitions.intense, ...i.theme.transitions.chorus])
  const outSignature = new Set<string>([...i.theme.transitions.out, ...i.theme.transitions.outIntense])

  const score = (name: string, p: Profile, recent: string[], sig: Set<string>, available: number) => {
    let s = 2.2 * moodFit(p, i.blend) + 1.6 * (1 - Math.abs(p.energy - targetEnergy) * 1.6) + 1.2 * keywordFit(p, i.keywords)
    if (sig.has(name)) s += 0.4
    const need = p.needs * i.pace
    if (need > available) s -= (need - available) * 2
    if (p.maxChars && i.lineChars > p.maxChars) s -= 2
    if (p.latinOnly && !i.latin) s -= 10
    if (p.needsTiming && !i.synced) s -= 10
    if (i.isSectionStart && i.sectionType === 'chorus') s += p.chorus ?? 0
    const r = recent.indexOf(name)
    if (r === 0) s -= 2.5
    else if (r === 1) s -= 1.2
    else if (r === 2) s -= 0.5
    return s + rand() * 0.35
  }

  const best = <T extends string>(profiles: Record<T, Profile>, recent: T[], sig: Set<string>, available: number): T => {
    let top: T = Object.keys(profiles)[0] as T
    let topScore = -Infinity
    for (const name of Object.keys(profiles) as T[]) {
      const s = score(name, profiles[name], recent, sig, available)
      if (s > topScore) [top, topScore] = [name, s]
    }
    return top
  }

  // Entrances may use ~60% of the line; exits happen while the next line arrives
  const chosenIn = best(IN_PROFILES, i.recentIn, signature, Math.max(0.35, secs * 0.6))
  const chosenOut = best(OUT_PROFILES, i.recentOut, outSignature, 0.9)

  // Particle disintegration is a punctuation mark, not the default
  const kwExit = i.keywords.map((k) => KEYWORD_EXIT[k]).find((x) => x !== undefined)
  const particleExit = i.isSectionEnd || kwExit !== undefined || (targetEnergy > 0.75 && rand() < 0.35) || rand() < 0.12
  return { in: chosenIn, out: chosenOut, particleExit, exitStyle: kwExit ?? i.theme.exit, targetEnergy }
}
