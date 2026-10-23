import type { LyricLine } from '@shared/types'
import { parseLrc, spreadPlainLyrics } from './lrcParser'
import { normalizeRoman } from './lyricMood'

const API = 'https://lrclib.net/api'
const HEADERS = { 'User-Agent': 'LivingLyrics/0.2 (personal lyric visualizer)' }

interface LrcLibRecord {
  trackName: string
  artistName: string
  albumName?: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface LyricsResult {
  lines: LyricLine[]
  synced: boolean
  instrumental: boolean
  /** Which lookup step found it (debug overlay) */
  source: string
}

/** Thrown when LRCLIB can't be reached at all (as opposed to "no lyrics exist"). */
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
 * Turn whatever the player reports into candidate (title, artist) pairs.
 * YouTube gives "Artist - Song (Official Video) | Movie | Label" with the channel as artist;
 * Spotify gives clean fields but Indian film songs carry "(From "Movie")".
 */
export function trackVariants(title: string, artist: string): { title: string; artist: string }[] {
  const out: { title: string; artist: string }[] = []
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
  const dash = head.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const [, left, right] = dash
    const leftClean = stripDecorations(left)
    const rightClean = stripDecorations(right)
    if (rightClean) add(rightClean, leftClean) // "Artist - Song"
    if (leftClean) add(leftClean, a || rightClean) // "Song - Movie"
  }
  add(head, a)
  if (segments.length > 1) add(head, '')
  if (a) add(title, '')
  return out
}

/* ---------- similarity ---------- */

function simKey(s: string): string {
  const base = s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
  // Fold romanization variants so "Kaadhal" ~ "Kadhal"
  return /^[a-z0-9 ]+$/.test(base) ? base.split(' ').map(normalizeRoman).join(' ') : base
}

/** Dice coefficient over character bigrams: 1 = identical. */
export function similarity(a: string, b: string): number {
  const x = simKey(a)
  const y = simKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const grams = (s: string) => {
    const cps = Array.from(s.replace(/ /g, ''))
    const m = new Map<string, number>()
    for (let i = 0; i < cps.length - 1; i++) {
      const g = cps[i] + cps[i + 1]
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const gx = grams(x)
  const gy = grams(y)
  let inter = 0
  let total = 0
  gx.forEach((n, g) => {
    inter += Math.min(n, gy.get(g) ?? 0)
    total += n
  })
  gy.forEach((n) => (total += n))
  // Containment also counts: "Arabic Kuthu" vs "Arabic Kuthu - Halamithi Habibo"
  const contained = x.includes(y) || y.includes(x) ? 0.85 : 0
  return Math.max(contained, total ? (2 * inter) / total : 0)
}

/* ---------- network ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(url: string): Promise<T | null> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
      if (res.status === 404) return null
      if (res.ok) return (await res.json()) as T
      lastErr = new Error(`HTTP ${res.status}`)
      if (res.status < 500 && res.status !== 429) return null
    } catch (e) {
      lastErr = e
    }
    await sleep(500 * Math.pow(3, attempt))
  }
  throw new LyricsNetworkError(String(lastErr))
}

/* ---------- matching ---------- */

/** The lyrics must plausibly fit the track; otherwise it's a different version/edit. */
function fitsDuration(rec: LrcLibRecord, durationMs: number): boolean {
  if (durationMs <= 0) return true
  const d = durationMs / 1000
  if (Math.abs(rec.duration - d) > 20) return false
  if (rec.syncedLyrics) {
    const times = [...rec.syncedLyrics.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map((m) => Number(m[1]) * 60 + Number(m[2]))
    const last = times.length ? Math.max(...times) : 0
    if (last > d + 20) return false
  }
  return true
}

function score(rec: LrcLibRecord, want: { title: string; artist: string }, durationMs: number): number {
  const t = similarity(rec.trackName, want.title)
  const a = want.artist ? similarity(rec.artistName, want.artist) : 0.5
  const dd = durationMs > 0 ? Math.abs(rec.duration - durationMs / 1000) : 10
  const dScore = Math.max(0, 1 - dd / 20)
  return t * 60 + a * 25 + dScore * 15 + (rec.syncedLyrics ? 10 : 0)
}

function toResult(rec: LrcLibRecord, durationMs: number, source: string): LyricsResult | null {
  if (rec.instrumental) return { lines: [], synced: false, instrumental: true, source }
  if (rec.syncedLyrics) {
    const lines = parseLrc(rec.syncedLyrics, durationMs)
    if (lines.length) return { lines, synced: true, instrumental: false, source }
  }
  if (rec.plainLyrics) return { lines: spreadPlainLyrics(rec.plainLyrics, durationMs || rec.duration * 1000), synced: false, instrumental: false, source }
  return null
}

/**
 * Lookup cascade: exact /get → searches with progressively looser queries,
 * scoring every candidate by title/artist similarity and duration.
 * Returns null when nothing exists; throws LyricsNetworkError when offline.
 */
export async function fetchLyrics(rawTitle: string, rawArtist: string, durationMs: number, album = ''): Promise<LyricsResult | null> {
  const variants = trackVariants(rawTitle, rawArtist)
  let plainFallback: LyricsResult | null = null
  let networkFailures = 0
  let attempts = 0

  const consider = (recs: LrcLibRecord[], want: { title: string; artist: string }, source: string): LyricsResult | null => {
    const ranked = recs
      .filter((r) => (r.syncedLyrics || r.plainLyrics || r.instrumental) && fitsDuration(r, durationMs) && similarity(r.trackName, want.title) >= 0.55)
      .map((r) => ({ r, s: score(r, want, durationMs) }))
      .sort((x, y) => y.s - x.s)
    for (const { r } of ranked) {
      const res = toResult(r, durationMs, source)
      if (!res) continue
      if (res.synced || res.instrumental) return res
      plainFallback ??= res
    }
    return null
  }

  const tryStep = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    attempts++
    try {
      return await fn()
    } catch (e) {
      if (e instanceof LyricsNetworkError) networkFailures++
      return null
    }
  }

  for (const v of variants) {
    if (v.artist) {
      const q = new URLSearchParams({ track_name: v.title, artist_name: v.artist })
      if (album) q.set('album_name', album)
      if (durationMs > 0) q.set('duration', String(Math.round(durationMs / 1000)))
      const exact = await tryStep(() => getJson<LrcLibRecord>(`${API}/get?${q}`))
      const hit = exact && consider([exact], v, 'lrclib exact')
      if (hit) return hit
    }
  }
  const searches: [string, URLSearchParams, { title: string; artist: string }][] = []
  for (const v of variants) {
    if (v.artist) searches.push([`search title+artist`, new URLSearchParams({ track_name: v.title, artist_name: v.artist }), v])
    searches.push([`search title`, new URLSearchParams({ track_name: v.title }), v])
    searches.push([`search text`, new URLSearchParams({ q: `${v.title} ${v.artist}`.trim() }), v])
  }
  for (const [label, q, v] of searches.slice(0, 9)) {
    const recs = await tryStep(() => getJson<LrcLibRecord[]>(`${API}/search?${q}`))
    const hit = recs && consider(recs, v, `lrclib ${label}`)
    if (hit) return hit
  }
  if (plainFallback) return plainFallback
  if (attempts > 0 && networkFailures === attempts) throw new LyricsNetworkError('LRCLIB unreachable')
  return null
}
