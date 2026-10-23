import { fetchJson } from './http'
import type { LyricsProvider } from './types'

const API = 'https://lrclib.net/api'

interface LrcLibRecord {
  trackName: string
  artistName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

const toCandidate = (r: LrcLibRecord, via: string) => ({
  provider: 'lrclib',
  via,
  trackName: r.trackName,
  artistName: r.artistName,
  duration: r.duration,
  synced: r.syncedLyrics ?? undefined,
  plain: r.plainLyrics ?? undefined,
  instrumental: r.instrumental
})

/** LRCLIB: open, community-synced lyrics. Exact lookup first, then searches. */
export const lrclib: LyricsProvider = {
  name: 'lrclib',
  async search({ variants, durationMs, album, signal, emit }) {
    const opts = { signal, timeoutMs: 5000, retries: 1 }
    const exact = variants.filter((v) => v.artist).slice(0, 2)
    // Exact lookups for the top variants, in parallel
    await Promise.allSettled(
      exact.map(async (v) => {
        const q = new URLSearchParams({ track_name: v.title, artist_name: v.artist })
        if (album) q.set('album_name', album)
        if (durationMs > 0) q.set('duration', String(Math.round(durationMs / 1000)))
        const r = await fetchJson<LrcLibRecord>(`${API}/get?${q}`, opts)
        if (r) emit(toCandidate(r, 'exact'))
      })
    )
    const searches: URLSearchParams[] = []
    for (const v of variants.slice(0, 3)) {
      if (v.artist) searches.push(new URLSearchParams({ track_name: v.title, artist_name: v.artist }))
      searches.push(new URLSearchParams({ q: `${v.title} ${v.artist}`.trim() }))
    }
    await Promise.allSettled(
      searches.slice(0, 5).map(async (q) => {
        const list = await fetchJson<LrcLibRecord[]>(`${API}/search?${q}`, opts)
        list?.slice(0, 8).forEach((r) => emit(toCandidate(r, 'search')))
      })
    )
  }
}
