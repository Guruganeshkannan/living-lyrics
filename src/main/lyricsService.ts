import type { LyricLine } from '@shared/types'
import { parseLrc, spreadPlainLyrics } from './lrcParser'

const API = 'https://lrclib.net/api'
const HEADERS = { 'User-Agent': 'LivingLyrics/0.1 (personal lyric visualizer)' }

interface LrcLibRecord {
  trackName: string
  artistName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface LyricsResult {
  lines: LyricLine[]
  synced: boolean
  instrumental: boolean
}

/**
 * Browsers report YouTube videos as title "Artist - Song (Official Video)" with the
 * channel as artist, so pull the real artist/title apart and strip the noise.
 */
export function cleanTrack(title: string, artist: string): { title: string; artist: string } {
  let t = title
  let a = artist.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\s*(Official|Music)$/i, '').trim()
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const [, left, right] = dash
    // Only trust the split if the left side looks like the artist (or artist is unknown/channel-ish)
    if (!a || left.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(left.toLowerCase()) || /official|records|music|tv/i.test(artist)) {
      a = left
      t = right
    }
  }
  t = t
    .replace(/\s*[([](official|lyric|lyrics|audio|video|music video|visualizer|hd|4k|mv|live|remaster(ed)?)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](feat|ft|with)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?remaster(ed)?.*$/i, '')
    .replace(/\s+-\s+(single|radio) (version|edit).*$/i, '')
    .replace(/\s*\|.*$/, '')
    .trim()
  a = a.split(/\s*(,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0].trim()
  return { title: t, artist: a }
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  return (await res.json()) as T
}

function toResult(rec: LrcLibRecord, durationMs: number): LyricsResult | null {
  if (rec.instrumental) return { lines: [], synced: false, instrumental: true }
  if (rec.syncedLyrics) return { lines: parseLrc(rec.syncedLyrics, durationMs), synced: true, instrumental: false }
  if (rec.plainLyrics) return { lines: spreadPlainLyrics(rec.plainLyrics, durationMs || rec.duration * 1000), synced: false, instrumental: false }
  return null
}

export async function fetchLyrics(rawTitle: string, rawArtist: string, durationMs: number): Promise<LyricsResult | null> {
  const { title, artist } = cleanTrack(rawTitle, rawArtist)
  const q = new URLSearchParams({ track_name: title, artist_name: artist })
  if (durationMs > 0) q.set('duration', String(Math.round(durationMs / 1000)))

  const exact = await getJson<LrcLibRecord>(`${API}/get?${q}`).catch(() => null)
  const fromExact = exact && toResult(exact, durationMs)
  if (fromExact?.synced || fromExact?.instrumental) return fromExact

  // Fuzzy search: prefer synced lyrics whose duration matches what's playing
  const results =
    (await getJson<LrcLibRecord[]>(`${API}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`).catch(() => null)) ??
    (await getJson<LrcLibRecord[]>(`${API}/search?${new URLSearchParams({ q: `${artist} ${title}` })}`).catch(() => null)) ??
    []
  const durS = durationMs / 1000
  const scored = results
    .filter((r) => r.syncedLyrics || r.plainLyrics)
    .map((r) => ({ r, score: (r.syncedLyrics ? 0 : 50) + (durS > 0 ? Math.abs(r.duration - durS) : 0) }))
    .sort((a, b) => a.score - b.score)
  const best = scored[0]
  if (best && (durS <= 0 || Math.abs(best.r.duration - durS) < 15 || !best.r.syncedLyrics)) {
    return toResult(best.r, durationMs)
  }
  return fromExact ?? null
}
