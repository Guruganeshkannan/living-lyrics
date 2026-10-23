/** One lyrics result from any source, normalized for scoring. */
export interface Candidate {
  provider: string
  /** How this provider found it, e.g. "exact" or "search" */
  via: string
  trackName: string
  artistName: string
  /** Seconds; 0 when unknown */
  duration: number
  /** LRC text (may contain enhanced <mm:ss.xx> word tags) */
  synced?: string
  plain?: string
  instrumental?: boolean
  /** Word-level timing available (enhanced LRC) */
  wordLevel?: boolean
}

export interface Query {
  title: string
  artist: string
}

export interface ProviderContext {
  /** Cleaned title/artist variants, best first */
  variants: Query[]
  durationMs: number
  album: string
  signal: AbortSignal
  /** Report candidates as soon as they're found (the orchestrator may stop early) */
  emit: (c: Candidate) => void
}

export interface LyricsProvider {
  name: string
  search(ctx: ProviderContext): Promise<void>
}
