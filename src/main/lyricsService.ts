import type { LyricLine } from '@shared/types'
import { lrclib } from './providers/lrclib'
import { lyricsOvh } from './providers/lyricsOvh'
import { similarity } from './providers/match'
import { musixmatch } from './providers/musixmatch'
import { netease } from './providers/netease'
import { ProviderNetworkError } from './providers/http'
import type { Candidate, LyricsProvider, Query } from './providers/types'
import { parseLrc, spreadPlainLyrics } from './lrcParser'

export interface LyricsResult {
  lines: LyricLine[]
  synced: boolean
  instrumental: boolean
  /** Which lookup step found it (debug overlay) */
  source: string
}

/** Thrown when no lyrics source could be reached at all (as opposed to "no lyrics exist"). */
export class LyricsNetworkError extends Error {}

// Record labels / channels that upload songs but aren't the artist
const LABEL_CHANNEL =
  /t-series|tseries|sony music|saregama|think music|lahari|aditya music|zee music|tips (official|music)|divo|sun ?tv|venus|eros now|yrf|speed records|white hill|desi melodies|muzik ?247|manorama music|junglee|mango music|times music|u1 records|trend music|wonderbar|sony music south|vevo|records|official|music$/i

const DECORATIONS = [
  /\s*[([]\s*from\s+["“”'].*?["“”']\s*[)\]]/gi, // (From "Beast")
  /\s*-\s*from\s+["“”'].*?["“”']/gi, // - From "Beast"
  /\s*[([](official|lyric|lyrics|lyrical|audio|video|music video|visualizer|hd|4k|mv|live|remaster(ed)?|full (song|video)|video song|audio song)[^)\]]*[)\]]/gi,
  /\s*[([](feat|ft|with)\.?[^)\]]*[)\]]/gi,
  /\b(full\s+)?(video|audio|lyric(al)?|lyrics?)\s+songs?\b/gi,
  /\b(official|hd|4k|1080p|720p|new|latest)\s+(music\s+)?(video|song|audio)s?\b/gi,
  /\b(tamil|telugu|hindi|malayalam|kannada|bengali|punjabi|marathi|gujarati)\s+(video\s+)?songs?\b/gi,
  /\blyric(al)?\s+video\b/gi,
  /\s+-\s+(\d{4}\s+)?remaster(ed)?.*$/i,
  /\s+-\s+(single|radio) (version|edit).*$/i,
  /\s*#\S+/g // hashtags
]

function stripDecorations(t: string): string {
  let s = t
  for (const re of DECORATIONS) s = s.replace(re, ' ')
  return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim()
}

/**
 * Turn whatever the player reports into candidate (title, artist) pairs, best first.
 * YouTube gives "Artist - Song (Official Video) | Movie | Label" with the channel as artist;
 * Spotify gives clean fields but Indian film songs carry "(From "Movie")".
 */
export function trackVariants(title: string, artist: string): Query[] {
  const out: Query[] = []
  const add = (t: string, a: string) => {
    const tt = stripDecorations(t)
    const aa = a.trim()
    if (tt && !out.some((o) => o.title.toLowerCase() === tt.toLowerCase() && o.artist.toLowerCase() === aa.toLowerCase())) out.push({ title: tt, artist: aa })
  }
  let a = artist.replace(/\s*-\s*Topic$/i, '').trim()
  if (LABEL_CHANNEL.test(a)) a = ''
  a = a.split(/\s*(,|&|\bfeat\.?|\bft\.?|\bx\b|\band\b)\s*/i)[0].trim()

  // "Song | Movie | Actor" → the first segment is the song
  const segments = title.split(/\s*[|｜]\s*/).filter(Boolean)
  const head = segments[0] ?? title
  // A real artist means the title field is trustworthy (Spotify, Apple Music): try it as-is first
  if (a) add(head, a)
  const dash = head.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const [, left, right] = dash
    const leftClean = stripDecorations(left)
    const rightClean = stripDecorations(right)
    if (rightClean) add(rightClean, leftClean) // "Artist - Song"
    if (leftClean) add(leftClean, a || rightClean) // "Song - Movie"
  }
  add(head, a)
  if (segments.length > 1 || a) add(head, '')
  return out
}

export { similarity }

/* ---------- scoring ---------- */

const PROVIDER_BONUS: Record<string, number> = { musixmatch: 3, lrclib: 2, netease: 0, 'lyrics.ovh': -5 }

function lastTimestamp(lrc: string): number {
  let last = 0
  for (const m of lrc.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) last = Math.max(last, Number(m[1]) * 60 + Number(m[2]))
  return last
}

/** The lyrics must plausibly fit the track; otherwise it's a different version/edit. */
function fitsDuration(c: Candidate, durationMs: number): boolean {
  if (durationMs <= 0) return true
  const d = durationMs / 1000
  if (c.duration > 0 && Math.abs(c.duration - d) > 20) return false
  if (c.synced && lastTimestamp(c.synced) > d + 20) return false
  return true
}

interface Scored {
  c: Candidate
  score: number
  title: number
  artist: number
}

function rate(c: Candidate, variants: Query[], durationMs: number): Scored {
  let title = 0
  let artist = 0.5
  for (const v of variants) {
    const t = similarity(c.trackName, v.title)
    if (t > title) {
      title = t
      artist = v.artist ? similarity(c.artistName, v.artist) : 0.5
    }
  }
  const dd = durationMs > 0 && c.duration > 0 ? Math.abs(c.duration - durationMs / 1000) : 10
  const score = title * 60 + artist * 25 + Math.max(0, 1 - dd / 20) * 15 + (c.synced ? 10 : 0) + (c.wordLevel ? 12 : 0) + (PROVIDER_BONUS[c.provider] ?? 0)
  return { c, score, title, artist }
}

function toResult(s: Scored, durationMs: number): LyricsResult | null {
  const { c } = s
  const source = `${c.provider} ${c.via}`
  if (c.instrumental) return { lines: [], synced: false, instrumental: true, source }
  if (c.synced) {
    const lines = parseLrc(c.synced, durationMs)
    if (lines.length) return { lines, synced: true, instrumental: false, source }
  }
  if (c.plain) {
    const lines = spreadPlainLyrics(c.plain, durationMs || c.duration * 1000)
    if (lines.length) return { lines, synced: false, instrumental: false, source }
  }
  return null
}

/* ---------- orchestration ---------- */

export const ALL_PROVIDERS: LyricsProvider[] = [lrclib, musixmatch, netease, lyricsOvh]

export interface FetchOptions {
  /** Provider names to use (default: all) */
  providers?: string[]
  /** Called whenever the set of still-searching providers changes */
  onProgress?: (pending: string[]) => void
  /** Hard limit for the whole search */
  deadlineMs?: number
  /** Override the provider implementations (tests) */
  impls?: LyricsProvider[]
}

/**
 * Search every lyrics source at once. A strong synced match ends the search early
 * (after a short grace period in case a word-timed version is about to arrive);
 * otherwise the best candidate at the deadline wins. Returns null when nothing exists;
 * throws LyricsNetworkError when no source could be reached at all.
 */
export function fetchLyrics(rawTitle: string, rawArtist: string, durationMs: number, album = '', opts: FetchOptions = {}): Promise<LyricsResult | null> {
  const variants = trackVariants(rawTitle, rawArtist)
  const providers = (opts.impls ?? ALL_PROVIDERS).filter((p) => !opts.providers || opts.providers.includes(p.name))
  const ctl = new AbortController()
  const found: Scored[] = []
  const pending = new Set(providers.map((p) => p.name))
  let networkFailures = 0
  let done = false
  let grace: NodeJS.Timeout | undefined

  return new Promise((resolve, reject) => {
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(deadline)
      clearTimeout(grace)
      ctl.abort(new Error('lyrics search finished'))
      const ranked = found.sort((a, b) => b.score - a.score)
      const best = ranked.find((s) => s.c.synced || s.c.instrumental) ?? ranked[0]
      const result = best ? (toResult(best, durationMs) ?? ranked.map((s) => toResult(s, durationMs)).find(Boolean) ?? null) : null
      if (!result && networkFailures === providers.length) reject(new LyricsNetworkError('no lyrics source reachable'))
      else resolve(result)
    }
    const deadline = setTimeout(finish, opts.deadlineMs ?? 12000)
    opts.onProgress?.([...pending])

    const emit = (c: Candidate) => {
      if (done || !(c.synced || c.plain || c.instrumental) || !fitsDuration(c, durationMs)) return
      const s = rate(c, variants, durationMs)
      if (s.title < 0.55) return
      found.push(s)
      const strong = (c.synced || c.instrumental) && s.title >= 0.8 && s.artist >= 0.45
      if (!strong) return
      // Word-level timing is the best there is; otherwise give it a moment to show up
      if (c.wordLevel) finish()
      else grace ??= setTimeout(finish, 1200)
    }

    if (!providers.length) return finish()
    for (const p of providers) {
      p.search({ variants, durationMs, album, signal: ctl.signal, emit })
        .catch((e) => {
          if (e instanceof ProviderNetworkError) networkFailures++
          else if (!ctl.signal.aborted) console.warn(`[lyrics:${p.name}]`, e)
        })
        .finally(() => {
          pending.delete(p.name)
          if (done) return
          opts.onProgress?.([...pending])
          if (!pending.size) finish()
        })
    }
  })
}
