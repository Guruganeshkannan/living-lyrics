import { BrowserWindow, app, desktopCapturer, ipcMain, screen, session } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC, type WindowCommand } from '@shared/ipc'
import type { LyricAnalysis, LyricLine, LyricsStatus, MediaUpdate, SongPayload, TrackInfo } from '@shared/types'
import { readCache, writeCache } from './cache'
import { DEMO_SONGS, demoLrc } from './demoSongs'
import { findLocalLyrics, saveLocalLyrics } from './localLyrics'
import { parseLrc, spreadPlainLyrics } from './lrcParser'
import { analyzeLyrics } from './lyricMood'
import { LyricsNetworkError, fetchLyrics } from './lyricsService'
import { MediaWatcher, trackKey } from './mediaWatcher'

interface CachedSong {
  lyrics: LyricLine[] | null
  synced: boolean
  status: LyricsStatus
  source: string
  analysis: LyricAnalysis | null
  offsetMs: number
  /** Unix ms; misses are retried after a day */
  savedAt: number
  /** Bump to invalidate caches when parsing/analysis logic changes */
  v: number
}
const CACHE_VERSION = 3
const MISS_TTL_MS = 24 * 60 * 60 * 1000

// Smoother compositing for the 3D text + WebGL stack
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

let win: BrowserWindow | null = null
let latestTrack: TrackInfo | null = null
let latestMedia: MediaUpdate | null = null
let currentSong: SongPayload | null = null
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
  // QA harness: LL_DEMO=<song id> LL_MOOD=<mood> start straight into a demo
  const query: Record<string, string> = {}
  if (process.env.LL_DEMO) query.demo = process.env.LL_DEMO
  if (process.env.LL_MOOD) query.mood = process.env.LL_MOOD
  if (process.env.LL_DEBUG) query.debug = '1'
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(query)}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  if (process.env.LL_SHOTS) scheduleShots(process.env.LL_SHOTS)
}

/** Automated screenshots for visual QA: LL_SHOTS=<dir> LL_SHOT_EVERY=<ms> LL_SHOT_COUNT=<n> */
function scheduleShots(dir: string): void {
  const every = Number(process.env.LL_SHOT_EVERY ?? 2500)
  const count = Number(process.env.LL_SHOT_COUNT ?? 8)
  let n = 0
  const timer = setInterval(async () => {
    if (!win) return
    const img = await win.webContents.capturePage()
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `shot-${String(++n).padStart(2, '0')}.png`), img.resize({ width: 960 }).toPNG())
    if (n >= count) {
      clearInterval(timer)
      app.quit()
    }
  }, every)
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

function send(payload: SongPayload): void {
  currentSong = payload
  win?.webContents.send(IPC.song, payload)
}

function buildFromText(text: string, durationMs: number): { lyrics: LyricLine[] | null; synced: boolean } {
  const synced = /\[\d{1,3}:\d{1,2}([.:]\d{1,3})?\]/.test(text)
  const lyrics = synced ? parseLrc(text, durationMs) : spreadPlainLyrics(text, durationMs)
  return { lyrics: lyrics.length ? lyrics : null, synced: synced && lyrics.length > 0 }
}

async function loadSong(track: TrackInfo, force = false): Promise<void> {
  const token = ++loadToken
  const key = trackKey(track)
  const base = { key, track, lyrics: null, synced: false, analysis: null, offsetMs: 0 }
  const sendIfCurrent = (p: SongPayload) => token === loadToken && send(p)

  // Spotify ads and blank sessions have nothing to show
  if (/^(advertisement|spotify|spotify free)$/i.test(track.title)) {
    sendIfCurrent({ ...base, status: 'none', source: 'ad' })
    return
  }

  // Durations often arrive a moment after the title; wait briefly so matching can use it
  for (let i = 0; i < 6 && track.durationMs <= 0; i++) {
    await new Promise((r) => setTimeout(r, 250))
    if (latestTrack && trackKey(latestTrack) === key) track = latestTrack
    if (token !== loadToken) return
  }

  const cached = await readCache<CachedSong>(key)
  const offsetMs = cached?.offsetMs ?? 0
  const finish = (lyrics: LyricLine[] | null, synced: boolean, status: LyricsStatus, source: string, persist: boolean) => {
    if (token !== loadToken) return
    const analysis = lyrics ? analyzeLyrics(lyrics, track.durationMs) : null
    const entry: CachedSong = { lyrics, synced, status, source, analysis, offsetMs, savedAt: Date.now(), v: CACHE_VERSION }
    if (persist) writeCache(key, entry).catch((e) => console.error('[cache]', e))
    sendIfCurrent({ key, track, lyrics, synced, status, source, analysis, offsetMs })
  }

  // 1. User lyric files always win
  const local = await findLocalLyrics(track.title, track.artist).catch(() => null)
  if (local) {
    const { lyrics, synced } = buildFromText(local.text, track.durationMs)
    finish(lyrics, synced, lyrics ? (synced ? 'synced' : 'plain') : 'none', `file: ${local.file}`, false)
    return
  }

  // 2. Cache (misses expire so new uploads to LRCLIB get picked up)
  const fresh = cached && cached.v === CACHE_VERSION && (cached.lyrics || Date.now() - cached.savedAt < MISS_TTL_MS)
  if (fresh && !force) {
    sendIfCurrent({ key, track, lyrics: cached.lyrics, synced: cached.synced, status: cached.status, source: `cache (${cached.source})`, analysis: cached.analysis, offsetMs })
    return
  }

  // 3. Network, with a visible "searching" state
  sendIfCurrent({ ...base, offsetMs, status: 'searching', source: '' })
  try {
    const result = await fetchLyrics(track.title, track.artist, track.durationMs, track.album)
    if (!result) finish(null, false, 'none', 'not found', true)
    else if (result.instrumental) finish(null, false, 'instrumental', result.source, true)
    else finish(result.lines, result.synced, result.synced ? 'synced' : 'plain', result.source, true)
  } catch (e) {
    console.error('[lyrics]', e)
    // Network trouble: don't cache, so the next play retries
    finish(null, false, e instanceof LyricsNetworkError ? 'error' : 'none', String(e), false)
  }
}

function loadDemo(id: string): void {
  const song = DEMO_SONGS.find((s) => s.id === id) ?? DEMO_SONGS[0]
  const { lrc, durationMs } = demoLrc(song)
  const lyrics = parseLrc(lrc, durationMs)
  const track: TrackInfo = { title: song.title, artist: 'Living Lyrics demo', album: '', sourceApp: 'demo', durationMs, positionMs: 0, updatedAt: Date.now(), isPlaying: true }
  loadToken++
  send({ key: `demo:${song.id}`, track, lyrics, synced: true, status: 'synced', source: 'demo', analysis: analyzeLyrics(lyrics, durationMs), offsetMs: 0 })
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
  watcher.on('update', (u: MediaUpdate) => {
    latestMedia = u
    if (u.type === 'track') latestTrack = u
    win?.webContents.send(IPC.media, u)
  })
  watcher.on('track', () => {
    // Metadata often arrives in pieces right after a skip
    clearTimeout(debounce)
    debounce = setTimeout(() => latestTrack && loadSong(latestTrack), 700)
  })
  if (!process.env.LL_DEMO) watcher.start()

  ipcMain.on(IPC.setOffset, async (_e, songKey: string, offsetMs: number) => {
    if (currentSong?.key === songKey) currentSong.offsetMs = offsetMs
    const cached = await readCache<CachedSong>(songKey)
    if (cached) await writeCache(songKey, { ...cached, offsetMs })
  })
  ipcMain.on(IPC.window, (_e, cmd: WindowCommand) => handleWindowCommand(cmd))
  ipcMain.on(IPC.dropLrc, async (_e, text: string) => {
    const track = currentSong?.track ?? latestTrack
    if (!track || !text.trim()) return
    await saveLocalLyrics(track.title, track.artist, text)
    loadSong(track, true)
  })
  ipcMain.on(IPC.reloadLyrics, () => {
    const track = latestTrack ?? currentSong?.track
    if (track && track.sourceApp !== 'demo') loadSong(track, true)
  })
  ipcMain.on(IPC.demo, (_e, id: string) => loadDemo(id))
  // Renderer (re)loads need the current state again
  ipcMain.on(IPC.ready, () => {
    if (latestMedia) win?.webContents.send(IPC.media, latestMedia)
    if (currentSong) win?.webContents.send(IPC.song, currentSong)
    else if (latestTrack) loadSong(latestTrack)
  })

  app.on('before-quit', () => watcher.stop())
})

app.on('window-all-closed', () => app.quit())
