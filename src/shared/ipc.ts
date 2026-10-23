import type { MediaUpdate, SongPayload } from './types'

export const IPC = {
  media: 'media',
  song: 'song',
  setOffset: 'set-offset',
  window: 'window'
} as const

export type WindowCommand = 'toggle-fullscreen' | 'exit-fullscreen' | 'toggle-mini' | 'minimize' | 'close'

export interface LyricsApi {
  onMedia(cb: (u: MediaUpdate) => void): void
  onSong(cb: (s: SongPayload | null) => void): void
  setOffset(songKey: string, offsetMs: number): void
  window(cmd: WindowCommand): void
}
