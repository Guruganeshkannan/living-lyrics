import { fetchJson } from './http'
import type { LyricsProvider } from './types'

/** lyrics.ovh: free plain-text lyrics (no timing) — a last-resort fallback. */
export const lyricsOvh: LyricsProvider = {
  name: 'lyrics.ovh',
  async search({ variants, signal, emit }) {
    for (const v of variants.filter((x) => x.artist).slice(0, 2)) {
      const res = await fetchJson<{ lyrics?: string }>(`https://api.lyrics.ovh/v1/${encodeURIComponent(v.artist)}/${encodeURIComponent(v.title)}`, { signal, timeoutMs: 6000, retries: 0 })
      const plain = res?.lyrics?.replace(/^Paroles de la chanson.*\r?\n/i, '').trim()
      if (plain) {
        emit({ provider: 'lyrics.ovh', via: 'search', trackName: v.title, artistName: v.artist, duration: 0, plain })
        return
      }
    }
  }
}
