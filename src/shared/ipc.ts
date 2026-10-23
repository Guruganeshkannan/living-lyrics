import type { MediaUpdate, SongPayload } from './types'

export const IPC = {
  media: 'media',
  song: 'song',
  setOffset: 'set-offset',
  window: 'window',
  dropLrc: 'drop-lrc',
  reloadLyrics: 'reload-lyrics',
  demo: 'demo',
  ready: 'renderer-ready'
} as const

export type WindowCommand = 'toggle-fullscreen' | 'exit-fullscreen' | 'toggle-mini' | 'minimize' | 'close'

export interface LyricsApi {
  onMedia(cb: (u: MediaUpdate) => void): void
  onSong(cb: (s: SongPayload | null) => void): void
  setOffset(songKey: string, offsetMs: number): void
  window(cmd: WindowCommand): void
  /** Assign dropped .lrc text to the current song (saved to the user lyrics folder) */
  dropLrc(text: string): void
  /** Ignore caches and look the current song up again */
  reloadLyrics(): void
  /** Load a built-in demo song by id (QA harness) */
  demo(id: string): void
}
