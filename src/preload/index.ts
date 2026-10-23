import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type LyricsApi } from '@shared/ipc'

const api: LyricsApi = {
  onMedia: (cb) => ipcRenderer.on(IPC.media, (_e, u) => cb(u)),
  onSong: (cb) => ipcRenderer.on(IPC.song, (_e, s) => cb(s)),
  setOffset: (songKey, offsetMs) => ipcRenderer.send(IPC.setOffset, songKey, offsetMs),
  window: (cmd) => ipcRenderer.send(IPC.window, cmd),
  dropLrc: (text) => ipcRenderer.send(IPC.dropLrc, text),
  reloadLyrics: () => ipcRenderer.send(IPC.reloadLyrics),
  demo: (id) => ipcRenderer.send(IPC.demo, id)
}

contextBridge.exposeInMainWorld('lyrics', api)
ipcRenderer.send(IPC.ready)
