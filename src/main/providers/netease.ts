import { fetchJson } from './http'
import { similarity } from './match'
import type { LyricsProvider } from './types'

/** NetEase Cloud Music public web API (unofficial): large synced LRC catalogue. */
const HEADERS = { Referer: 'https://music.163.com/', Origin: 'https://music.163.com' }

interface NeteaseSong {
  id: number
  name: string
  artists: { name: string }[]
  duration: number
}

export const netease: LyricsProvider = {
  name: 'netease',
  async search({ variants, signal, emit }) {
    const opts = { signal, headers: HEADERS, timeoutMs: 5000, retries: 1 }
    for (const v of variants.slice(0, 2)) {
      const q = new URLSearchParams({ s: `${v.title} ${v.artist}`.trim(), type: '1', limit: '8' })
      const res = await fetchJson<{ result?: { songs?: NeteaseSong[] } }>(`https://music.163.com/api/search/get?${q}`, opts)
      const songs = (res?.result?.songs ?? []).filter((s) => similarity(s.name, v.title) >= 0.55).slice(0, 2)
      for (const s of songs) {
        const ly = await fetchJson<{ lrc?: { lyric?: string }; nolyric?: boolean; pureMusic?: boolean }>(`https://music.163.com/api/song/lyric?id=${s.id}&lv=1&kv=1&tv=-1`, opts)
        const base = { provider: 'netease', via: 'search', trackName: s.name, artistName: s.artists.map((a) => a.name).join(', '), duration: s.duration / 1000 }
        if (ly?.pureMusic) emit({ ...base, instrumental: true })
        else if (ly?.lrc?.lyric && /\[\d+:\d+/.test(ly.lrc.lyric)) emit({ ...base, synced: ly.lrc.lyric })
      }
      if (songs.length) break
    }
  }
}
