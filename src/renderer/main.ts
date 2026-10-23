import '@fontsource/playfair-display/500-italic.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/anton/400.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/oswald/300.css'
import '@fontsource/inter/400.css'
import './styles.css'

import type { LyricsApi } from '@shared/ipc'
import { BackgroundLayer } from './layers/BackgroundLayer'
import { TypographyLayer } from './layers/TypographyLayer'
import { SceneDirector } from './sceneDirector'
import { THEMES } from './themes/themes'
import { DebugOverlay } from './ui/debugOverlay'

declare global {
  interface Window {
    lyrics: LyricsApi
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const bg = new BackgroundLayer($<HTMLCanvasElement>('bg'))
const type = new TypographyLayer($('stage'), $('lyrics'))
const director = new SceneDirector(bg, type)
const debug = new DebugOverlay($('debug'))
const toast = $('toast')

let toastTimer: number | undefined
function showToast(text: string): void {
  toast.textContent = text
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1400)
}

window.lyrics.onMedia((u) => director.onMedia(u))
window.lyrics.onSong((s) => director.setSong(s))

// Fonts must be ready before the first line is measured
document.fonts.ready.then(() => director.audio.start())

window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case '[':
      director.nudgeOffset(-100)
      showToast(`sync ${director.offsetMs >= 0 ? '+' : ''}${director.offsetMs} ms`)
      break
    case ']':
      director.nudgeOffset(100)
      showToast(`sync ${director.offsetMs >= 0 ? '+' : ''}${director.offsetMs} ms`)
      break
    case 'm': {
      const m = director.mood.cycleOverride()
      showToast(m ? `mood: ${THEMES[m].label}` : 'mood: auto')
      break
    }
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

// Hide the cursor and chrome when idle
let idleTimer: number | undefined
window.addEventListener('mousemove', () => {
  document.body.classList.remove('idle')
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => document.body.classList.add('idle'), 2000)
})

let last = performance.now()
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  director.frame(dt)
  debug.update(director, now)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
