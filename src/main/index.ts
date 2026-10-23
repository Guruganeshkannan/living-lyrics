import { BrowserWindow, app, desktopCapturer, ipcMain, screen, session } from 'electron'
import { join } from 'node:path'
import { IPC, type WindowCommand } from '@shared/ipc'
import type { LyricAnalysis, LyricLine, SongPayload, TrackInfo } from '@shared/types'
import { readCache, writeCache } from './cache'
import { analyzeLyrics } from './lyricMood'
import { fetchLyrics } from './lyricsService'
import { MediaWatcher, trackKey } from './mediaWatcher'

interface CachedSong {
  lyrics: LyricLine[] | null
  synced: boolean
  analysis: LyricAnalysis | null
  offsetMs: number
  /** Bump to invalidate caches when analysis logic changes */
  v: number
}
const CACHE_VERSION = 1

let win: BrowserWindow | null = null
let latestTrack: TrackInfo | null = null
let loadToken = 0
let normalBounds: Electron.Rectangle | null = null

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  win = new BrowserWindow({
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.8),
    frame: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

/** Grant getDisplayMedia() requests with system-audio loopback (Windows). */
function enableLoopbackAudio(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_req, callback) => {
      const [source] = await desktopCapturer.getSources({ types: ['screen'] })
      callback({ video: source, audio: 'loopback' })
    },
    { useSystemPicker: false }
  )
}

async function loadSong(track: TrackInfo): Promise<void> {
  const token = ++loadToken
  const key = trackKey(track)
  const send = (payload: SongPayload) => token === loadToken && win?.webContents.send(IPC.song, payload)

  // Spotify ads and blank sessions have nothing to show
  if (/^(advertisement|spotify)$/i.test(track.title)) {
    send({ key, track, lyrics: null, synced: false, analysis: null, offsetMs: 0 })
    return
  }

  const cached = await readCache<CachedSong>(key)
  if (cached && cached.v === CACHE_VERSION) {
    send({ key, track, lyrics: cached.lyrics, synced: cached.synced, analysis: cached.analysis, offsetMs: cached.offsetMs })
    return
  }
  // Show the track immediately; lyrics follow when they arrive
  send({ key, track, lyrics: null, synced: false, analysis: null, offsetMs: 0 })

  const result = await fetchLyrics(track.title, track.artist, track.durationMs).catch((e) => {
    console.error('[lyrics]', e)
    return null
  })
  if (token !== loadToken) return
  const lyrics = result && result.lines.length ? result.lines : null
  const analysis = lyrics ? analyzeLyrics(lyrics, track.durationMs) : null
  const entry: CachedSong = { lyrics, synced: !!result?.synced, analysis, offsetMs: cached?.offsetMs ?? 0, v: CACHE_VERSION }
  // Don't cache misses for long: a network blip shouldn't stick forever
  if (result) await writeCache(key, entry)
  send({ key, track, ...entry })
}

function handleWindowCommand(cmd: WindowCommand): void {
  if (!win) return
  switch (cmd) {
    case 'toggle-fullscreen':
      win.setFullScreen(!win.isFullScreen())
      break
    case 'exit-fullscreen':
      win.setFullScreen(false)
      break
    case 'toggle-mini': {
      const mini = win.isAlwaysOnTop()
      if (mini) {
        win.setAlwaysOnTop(false)
        if (normalBounds) win.setBounds(normalBounds)
      } else {
        if (win.isFullScreen()) win.setFullScreen(false)
        normalBounds = win.getBounds()
        const area = screen.getDisplayMatching(normalBounds).workArea
        win.setAlwaysOnTop(true, 'floating')
        win.setBounds({ x: area.x + area.width - 660, y: area.y + area.height - 390, width: 640, height: 360 })
      }
      break
    }
    case 'minimize':
      win.minimize()
      break
    case 'close':
      win.close()
      break
  }
}

app.whenReady().then(() => {
  enableLoopbackAudio()
  createWindow()

  const scriptRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const watcher = new MediaWatcher(join(scriptRoot, 'sidecar', 'media-watcher.ps1'))
  let debounce: NodeJS.Timeout | undefined
  watcher.on('update', (u) => {
    if (u.type === 'track') latestTrack = u
    win?.webContents.send(IPC.media, u)
  })
  watcher.on('track', () => {
    // Metadata (duration especially) often arrives in pieces right after a skip
    clearTimeout(debounce)
    debounce = setTimeout(() => latestTrack && loadSong(latestTrack), 700)
  })
  watcher.start()

  ipcMain.on(IPC.setOffset, async (_e, songKey: string, offsetMs: number) => {
    const cached = await readCache<CachedSong>(songKey)
    if (cached) await writeCache(songKey, { ...cached, offsetMs })
  })
  ipcMain.on(IPC.window, (_e, cmd: WindowCommand) => handleWindowCommand(cmd))
  // Renderer reloads (dev HMR) need the current song again
  ipcMain.on('renderer-ready', () => latestTrack && loadSong(latestTrack))

  app.on('before-quit', () => watcher.stop())
})

app.on('window-all-closed', () => app.quit())
