export interface TrackInfo {
  title: string
  artist: string
  album: string
  sourceApp: string
  durationMs: number
  positionMs: number
  /** Unix ms at which positionMs was sampled by the OS */
  updatedAt: number
  isPlaying: boolean
}

export type MediaUpdate =
  | ({ type: 'track' } & TrackInfo)
  | { type: 'none' }
  | { type: 'error'; message: string }

export interface LyricWord {
  text: string
  startMs: number
  endMs: number
}

export interface LyricLine {
  index: number
  startMs: number
  endMs: number
  text: string
  words: LyricWord[]
  /** True when a blank LRC line (stanza break) came right before this one */
  stanzaBreak: boolean
}

export type SectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'instrumental' | 'outro'

export interface Section {
  type: SectionType
  startMs: number
  endMs: number
  /** Inclusive start / exclusive end indices into the lyric lines */
  lineStart: number
  lineEnd: number
  valence: number
  arousal: number
}

export type MoodId =
  | 'romance'
  | 'calm'
  | 'nostalgic'
  | 'hype'
  | 'triumphant'
  | 'playful'
  | 'heartbreak'
  | 'revenge'
  | 'dark'

export type KeywordEffect = 'burn' | 'heartbeat' | 'drip' | 'shatter' | 'glow' | 'shake' | 'float'

export interface Keyword {
  wordIndex: number
  word: string
  effect: KeywordEffect
}

export interface MoodPoint {
  /** -1 (negative) .. 1 (positive) */
  valence: number
  /** -1 (still) .. 1 (intense) */
  arousal: number
}

export interface LineAnalysis extends MoodPoint {
  /** How much emotional evidence the line carries (0 = none) */
  strength: number
  weights: Partial<Record<MoodId, number>>
  keywords: Keyword[]
}

export interface LyricAnalysis {
  lines: LineAnalysis[]
  sections: Section[]
  overall: MoodPoint & { dominant: MoodId; strength: number; weights: Partial<Record<MoodId, number>> }
}

export interface SongPayload {
  key: string
  track: TrackInfo
  lyrics: LyricLine[] | null
  /** false when lyrics were plain text and timing is estimated */
  synced: boolean
  analysis: LyricAnalysis | null
  offsetMs: number
}
