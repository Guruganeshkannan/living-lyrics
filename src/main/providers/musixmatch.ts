import { fetchJson } from './http'
import { lrcTime, similarity } from './match'
import type { LyricsProvider } from './types'

/**
 * Musixmatch via its desktop-app endpoints (unofficial; the same approach
 * open-source lyric tools use). Biggest catalogue for Indian film songs, and
 * "richsync" gives true word-by-word timing.
 */
const BASE = 'https://apic-desktop.musixmatch.com/ws/1.1/'
const APP = 'web-desktop-app-v1.0'
const HEADERS = { cookie: 'AWSELBCORS=0; AWSELB=0', authority: 'apic-desktop.musixmatch.com' }

interface MxmResponse<T> {
  message: { header: { status_code: number; hint?: string }; body: T }
}
interface MxmTrack {
  track_id: number
  track_name: string
  artist_name: string
  track_length: number
  has_subtitles: number
  has_richsync: number
  has_lyrics: number
  instrumental: number
}
interface RichLine {
  ts: number
  te: number
  l: { c: string; o: number }[]
  x: string
}

let token: Promise<string | null> | null = null
/** When Musixmatch refused us; we back off instead of hammering it */
let refusedAt = 0
const BACKOFF_MS = 10 * 60 * 1000

async function getToken(signal: AbortSignal): Promise<string | null> {
  if (Date.now() - refusedAt < BACKOFF_MS) return null
  token ??= (async () => {
    const r = await fetchJson<MxmResponse<{ user_token?: string }>>(`${BASE}token.get?app_id=${APP}&t=${Date.now().toString(36)}`, { signal, headers: HEADERS, timeoutMs: 5000, retries: 1 })
    const t = r?.message?.body?.user_token
    // Throttled clients get a placeholder token (all zeros / "UpgradeOnly...")
    if (!t || /^0+$/.test(t) || t.startsWith('UpgradeOnly')) {
      refusedAt = Date.now()
      return null
    }
    return t
  })()
  const t = await token
  if (!t) token = null
  return t
}

async function call<T>(method: string, params: Record<string, string>, signal: AbortSignal): Promise<T | null> {
  const t = await getToken(signal)
  if (!t) return null
  const q = new URLSearchParams({ ...params, app_id: APP, usertoken: t, format: 'json' })
  const r = await fetchJson<MxmResponse<T>>(`${BASE}${method}?${q}`, { signal, headers: HEADERS, timeoutMs: 5000, retries: 1 })
  const code = r?.message?.header?.status_code
  if (code === 401) token = null // expired: next call fetches a fresh one
  return code === 200 ? r!.message.body : null
}

/** Richsync JSON → enhanced LRC with <mm:ss.xx> word tags. */
export function richsyncToLrc(body: string): string | null {
  let lines: RichLine[]
  try {
    lines = JSON.parse(body)
  } catch {
    return null
  }
  return lines
    .map((ln) => {
      const words = ln.l.filter((w) => w.c.trim()).map((w) => `<${lrcTime(ln.ts + w.o)}>${w.c.trim()}`)
      return `[${lrcTime(ln.ts)}]${words.join(' ')}`
    })
    .join('\n')
}

export const musixmatch: LyricsProvider = {
  name: 'musixmatch',
  async search({ variants, durationMs, signal, emit }) {
    const seen = new Set<number>()
    for (const v of variants.slice(0, 2)) {
      const params: Record<string, string> = { q_track: v.title, page_size: '5', page: '1', s_track_rating: 'desc', f_has_lyrics: '1' }
      if (v.artist) params.q_artist = v.artist
      const res = await call<{ track_list: { track: MxmTrack }[] }>('track.search', params, signal)
      const tracks = (res?.track_list ?? [])
        .map((x) => x.track)
        .filter((t) => !seen.has(t.track_id) && similarity(t.track_name, v.title) >= 0.55)
        .sort((a, b) => Math.abs(a.track_length - durationMs / 1000) - Math.abs(b.track_length - durationMs / 1000))
        .slice(0, 2)
      for (const t of tracks) {
        seen.add(t.track_id)
        const base = { provider: 'musixmatch', trackName: t.track_name, artistName: t.artist_name, duration: t.track_length }
        if (t.instrumental) {
          emit({ ...base, via: 'search', instrumental: true })
          continue
        }
        if (t.has_richsync) {
          const rs = await call<{ richsync: { richsync_body: string } }>('track.richsync.get', { track_id: String(t.track_id) }, signal)
          const lrc = rs && richsyncToLrc(rs.richsync.richsync_body)
          if (lrc) {
            emit({ ...base, via: 'richsync', synced: lrc, wordLevel: true })
            continue
          }
        }
        if (t.has_subtitles) {
          const sub = await call<{ subtitle: { subtitle_body: string } }>('track.subtitle.get', { track_id: String(t.track_id), subtitle_format: 'lrc' }, signal)
          if (sub?.subtitle?.subtitle_body) {
            emit({ ...base, via: 'subtitles', synced: sub.subtitle.subtitle_body })
            continue
          }
        }
        if (t.has_lyrics) {
          const ly = await call<{ lyrics: { lyrics_body: string } }>('track.lyrics.get', { track_id: String(t.track_id) }, signal)
          // Free-tier bodies end with a "*** This Lyrics is NOT for Commercial use ***" footer
          const plain = ly?.lyrics?.lyrics_body?.replace(/\*{3}.*\*{3}[\s\S]*$/, '').trim()
          if (plain) emit({ ...base, via: 'lyrics', plain })
        }
      }
      if (tracks.length) break
    }
  }
}
