import './text/fonts'
import './styles.css'

import type { LyricsApi } from '@shared/ipc'
import type { MoodId } from '@shared/types'
import { SceneDirector } from './sceneDirector'
import { preloadFonts } from './text/fonts'
import { THEMES } from './themes/themes'
import { DebugOverlay } from './ui/debugOverlay'

declare global {
  interface Window {
    lyrics: LyricsApi
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const director = new SceneDirector($<HTMLCanvasElement>('bg'), $('lyrics'))
const debug = new DebugOverlay($('debug'))
const toast = $('toast')
const statusEl = $('status')
const params = new URLSearchParams(location.search)

let toastTimer: number | undefined
function showToast(text: string): void {
  toast.textContent = text
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1400)
}

window.lyrics.onMedia((u) => director.onMedia(u))
window.lyrics.onSong((s) => director.setSong(s))

const DEMO_IDS = ['en', 'en-revenge', 'ta', 'ta-rom', 'hi', 'te', 'kn', 'ml', 'ur', 'bn']
let demoIdx = Math.max(0, DEMO_IDS.indexOf(params.get('demo') ?? ''))

// Fonts must be ready before the first line is measured
preloadFonts().then(() => {
  if (params.get('mood')) director.mood.setOverride(params.get('mood') as MoodId)
  if (params.get('debug')) debug.toggle()
  if (params.get('demo')) window.lyrics.demo(DEMO_IDS[demoIdx])
  else director.audio.start()
})

const fmtOffset = () => `sync ${director.offsetMs >= 0 ? '+' : ''}${director.offsetMs} ms  (song ${director.songOffsetMs >= 0 ? '+' : ''}${director.songOffsetMs}, global ${director.globalOffsetMs >= 0 ? '+' : ''}${director.globalOffsetMs})`

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (e.ctrlKey && e.shiftKey && key === 'd') {
    // Demo / QA harness: cycle through the built-in sample songs
    window.lyrics.demo(DEMO_IDS[demoIdx++ % DEMO_IDS.length])
    showToast(`demo: ${DEMO_IDS[(demoIdx - 1) % DEMO_IDS.length]}`)
    return
  }
  switch (key) {
    case '[':
    case '{':
      director.nudgeOffset(-100, e.shiftKey)
      showToast(fmtOffset())
      break
    case ']':
    case '}':
      director.nudgeOffset(100, e.shiftKey)
      showToast(fmtOffset())
      break
    case 'm': {
      const m = director.mood.cycleOverride()
      showToast(m ? `mood: ${THEMES[m].label}` : 'mood: auto')
      break
    }
    case 'r':
      window.lyrics.reloadLyrics()
      showToast('looking up lyrics again…')
      break
    case 'd':
      debug.toggle()
      break
    case 'f':
      window.lyrics.window('toggle-fullscreen')
      break
    case 'p':
      window.lyrics.window('toggle-mini')
      break
    case 'escape':
      window.lyrics.window('exit-fullscreen')
      break
  }
})
document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => b.addEventListener('click', () => window.lyrics.window(b.dataset.cmd as 'minimize' | 'close')))

// Drop an .lrc / .txt file to assign lyrics to the current song
window.addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('dropping')
})
window.addEventListener('dragleave', () => document.body.classList.remove('dropping'))
window.addEventListener('drop', async (e) => {
  e.preventDefault()
  document.body.classList.remove('dropping')
  const file = e.dataTransfer?.files[0]
  if (!file || !/\.(lrc|txt)$/i.test(file.name)) {
    showToast('drop a .lrc or .txt lyrics file')
    return
  }
  window.lyrics.dropLrc(await file.text())
  showToast(`lyrics saved for this song: ${file.name}`)
})

// Hide the cursor and chrome when idle
let idleTimer: number | undefined
window.addEventListener('mousemove', () => {
  document.body.classList.remove('idle')
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => document.body.classList.add('idle'), 2000)
})

let last = performance.now()
let lastStatus = ''
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  try {
    director.frame(dt)
  } catch (err) {
    // One bad frame must never kill the show
    console.error('[frame]', err)
  }
  if (director.status !== lastStatus) {
    lastStatus = director.status
    statusEl.textContent = lastStatus
    statusEl.classList.toggle('show', !!lastStatus)
  }
  debug.update(director, now)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
