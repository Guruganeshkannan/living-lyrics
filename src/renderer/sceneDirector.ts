import { nearestMoods } from '@shared/moods'
import type { KeywordEffect, LineAnalysis, LyricLine, MediaUpdate, Section, SectionType, SongPayload } from '@shared/types'
import { AudioEngine } from './audio/audioEngine'
import { CameraDirector } from './camera/CameraDirector'
import { SongClock } from './clock'
import { BackgroundLayer, type Fx, type SceneState } from './layers/BackgroundLayer'
import { TextParticles } from './layers/TextParticles'
import { TypographyLayer, type HideOptions } from './layers/TypographyLayer'
import { AudioMood } from './mood/audioMood'
import { MoodDirector, type MoodState } from './mood/moodDirector'
import { QualityGovernor } from './perf/QualityGovernor'
import { approachLook, blendThemes, type BlendedLook, type LivePalette } from './themes/blend'
import { hueShift } from './themes/color'
import { ExitStyle, THEMES, type Theme } from './themes/themes'
import { chooseTransition, seeded, type TransitionChoice } from './transitions/TransitionEngine'
import type { InPreset, OutPreset } from './transitions/presets'
import { detectScript } from '@shared/script'

/** Show a line slightly before its timestamp so the entrance lands on the word. */
const LEAD_MS = 60
/** How long a new dominant mood must hold before fonts/camera/worlds switch mid-section */
const TYPE_SWITCH_HOLD_S = 4

const KEYWORD_PARTICLES: Record<KeywordEffect, number> = {
  burn: ExitStyle.Ash,
  drip: ExitStyle.Droplets,
  heartbeat: ExitStyle.Petals,
  shatter: ExitStyle.Explode,
  glow: ExitStyle.Sparks,
  shake: ExitStyle.Explode,
  float: ExitStyle.Dust
}

export class SceneDirector {
  readonly clock = new SongClock()
  readonly audio = new AudioEngine()
  readonly audioMood = new AudioMood()
  readonly mood = new MoodDirector(this.audioMood)
  readonly cam: CameraDirector
  readonly bg: BackgroundLayer
  readonly particles: TextParticles
  readonly type: TypographyLayer
  readonly quality: QualityGovernor

  song: SongPayload | null = null
  media: MediaUpdate | null = null
  demo = false
  songOffsetMs = 0
  globalOffsetMs = 0
  lineIdx = -1
  section: Section | null = null
  moodState: MoodState = this.mood.state
  look: BlendedLook = blendThemes([{ id: 'nostalgic', weight: 1 }])
  /** Sticky theme that drives fonts, camera paths and worlds */
  typeTheme: Theme = THEMES.nostalgic
  scene: SceneState = { modeA: 0, modeB: 0, mix: 0, chorus: 0 }
  status = ''

  /** Last choreography decision (debug overlay) */
  lastChoice: TransitionChoice | null = null

  private mediaKey = ''
  private recentIn: InPreset[] = []
  private recentOut: OutPreset[] = []
  private time = 0
  private lastBeatCount = 0
  private candidate: Theme | null = null
  private candidateFor = 0
  private shake = 0
  private flash = 0
  private glitch = 0
  private zoomKick = 0
  private exposure = 1
  private exposureTarget = 1
  private cardFor = ''
  private targetMode = 0
  private modeFade = 0
  private keyHue = 0
  private palette: LivePalette = this.look.palette

  constructor(canvas: HTMLCanvasElement, lyricsHost: HTMLElement) {
    this.cam = new CameraDirector(() => ({ w: window.innerWidth, h: window.innerHeight }))
    this.bg = new BackgroundLayer(canvas, this.cam.camera, () => this.cam.viewDistance())
    this.particles = new TextParticles(this.bg.world, () => this.cam.viewDistance(), () => this.bg.renderer.getPixelRatio())
    this.type = new TypographyLayer(lyricsHost, this.particles)
    this.quality = new QualityGovernor((q) => {
      this.bg.setQuality(q)
      this.particles.budget = q.textParticles
    })
    this.type.onImpact = (s) => this.impact(s)
    this.type.onKeyword = (effect, obj, line, word) => {
      if (this.quality.level < 3) this.particles.burstAt(obj, line, word, KEYWORD_PARTICLES[effect], this.palette)
      this.impact(effect === 'shatter' || effect === 'shake' ? 0.6 : 0.3, effect)
    }
    try {
      this.globalOffsetMs = Number(localStorage.getItem('globalOffsetMs') ?? 0) || 0
    } catch {
      this.globalOffsetMs = 0
    }
    window.addEventListener('resize', () => {
      this.cam.resize()
      this.bg.resize()
      this.type.resize()
    })
  }

  get offsetMs(): number {
    return this.songOffsetMs + this.globalOffsetMs
  }

  /* ---------------- inputs ---------------- */

  onMedia(u: MediaUpdate): void {
    this.media = u
    if (this.demo || u.type !== 'track' || !u.title) return
    const key = `${u.artist} - ${u.title}`.trim()
    if (key !== this.mediaKey) {
      this.mediaKey = key
      const age = u.isPlaying && u.updatedAt > 0 ? Math.max(0, Date.now() - u.updatedAt) : 0
      this.clock.reset(u.positionMs + (age < 5000 ? age : 0), u.isPlaying)
      this.clock.sync(u.positionMs, u.updatedAt, u.isPlaying, u.durationMs)
      return
    }
    if (this.clock.sync(u.positionMs, u.updatedAt, u.isPlaying, u.durationMs)) this.resetLines()
  }

  setSong(s: SongPayload | null): void {
    if (s?.source === 'demo') {
      this.demo = true
      this.clock.reset(0, true)
      this.audio.simulate(118)
    } else if (this.demo && s) return
    const sameSong = s && this.song?.key === s.key
    this.song = s
    this.songOffsetMs = s?.offsetMs ?? 0
    this.status = statusText(s)
    this.resetLines()
    if (!sameSong) {
      this.mood.reset(s?.analysis ?? null)
      this.audioMood.reset()
      this.cardFor = ''
      this.zoomKick = 0.06
      this.flash = 0.12
      this.cam.reset()
      this.particles.clear()
      this.type.clear()
      this.snapTypeTheme()
    } else if (s?.analysis) {
      this.mood.reset(s.analysis)
      this.snapTypeTheme()
    }
  }

  nudgeOffset(deltaMs: number, global: boolean): void {
    if (global) {
      this.globalOffsetMs += deltaMs
      try {
        localStorage.setItem('globalOffsetMs', String(this.globalOffsetMs))
      } catch {
        /* storage unavailable: offset just won't persist */
      }
    } else {
      this.songOffsetMs += deltaMs
      if (this.song && !this.demo) window.lyrics.setOffset(this.song.key, this.songOffsetMs)
    }
    this.resetLines()
  }

  private snapTypeTheme(): void {
    const analysis = this.song?.analysis
    const id = this.mood.override ?? (analysis ? nearestMoods(analysis.overall, 1)[0].id : null)
    if (id) {
      this.typeTheme = THEMES[id]
      this.targetMode = this.scene.modeA = this.scene.modeB = this.typeTheme.scenes.intro
      this.scene.mix = 0
    }
  }

  private resetLines(): void {
    this.lineIdx = -1
    this.type.hide(this.hideOpts(0.6, 0.6))
  }

  private hideOpts(intensity: number, pace: number): HideOptions {
    return { intensity, pace, palette: this.palette, particles: this.quality.level < 3 }
  }

  private impact(strength: number, kind?: KeywordEffect): void {
    const s = this.look.scene
    this.shake = Math.max(this.shake, strength * (0.3 + s.shake))
    // Flash is a light bloom kick, capped so it never washes out the lyrics
    this.flash = Math.min(0.15, Math.max(this.flash, strength * 0.12 * (kind === 'glow' || kind === 'burn' ? 1.4 : 1)))
    this.glitch = Math.max(this.glitch, strength * s.glitch * 1.4)
    this.zoomKick = Math.max(this.zoomKick, strength * 0.02)
  }

  /* ---------------- frame ---------------- */

  frame(dt: number): void {
    this.time += dt
    this.quality.tick(dt)
    const a = this.audio.update(dt)
    const energyEvent = this.audioMood.update(a, dt)
    const t = this.clock.now() + this.offsetMs

    const lyrics = this.song?.lyrics ?? null
    const analysis = this.song?.analysis ?? null
    const prevSection = this.section
    this.section = analysis?.sections.find((s) => t >= s.startMs && t < s.endMs) ?? null
    const sectionChanged = this.section !== prevSection
    const idx = lyrics ? findLine(lyrics, t + LEAD_MS) : -1
    const lineAnalysis = idx >= 0 ? (analysis?.lines[idx] ?? null) : null

    this.moodState = this.mood.update(dt, a, analysis, this.section, lineAnalysis, energyEvent)
    this.look = approachLook(this.look, blendThemes(this.moodState.blend), 1 - Math.exp(-dt * 2.2))
    this.updateTypeTheme(dt, sectionChanged)
    this.updatePalette(dt)
    const intensity = this.moodState.intensity
    const sectionType: SectionType = this.section?.type ?? (lyrics ? 'verse' : 'instrumental')

    // Signature moments: drops dim the world, surges blow it open
    if (energyEvent === 'drop') this.exposureTarget = 0.55
    if (energyEvent === 'surge') {
      this.exposureTarget = 1
      this.exposure = Math.min(this.exposure, 0.7)
      this.impact(0.9)
      this.zoomKick = Math.max(this.zoomKick, 0.07)
    }
    this.exposureTarget += (1 - this.exposureTarget) * (1 - Math.exp(-dt / 2.5))
    this.exposure += (this.exposureTarget - this.exposure) * (1 - Math.exp(-dt * 3))

    this.updateLyrics(t, lyrics, idx, lineAnalysis, intensity, a.energy, dt)
    this.updateWorlds(dt, sectionType, sectionChanged)

    // Beat reactions
    let strongBeat = false
    if (a.beatCount !== this.lastBeatCount) {
      this.lastBeatCount = a.beatCount
      const s = this.look.scene
      strongBeat = a.bass > 0.75
      this.shake = Math.max(this.shake, s.shake * intensity * 0.5)
      this.zoomKick = Math.max(this.zoomKick, 0.01 * s.beatPunch * intensity)
      if (a.onset > 0.9 && Math.random() < s.glitch * 0.5) this.glitch = Math.max(this.glitch, s.glitch)
    }
    this.shake *= Math.exp(-dt * 9)
    this.flash *= Math.exp(-dt * 4)
    this.glitch *= Math.exp(-dt * 7)
    this.zoomKick *= Math.exp(-dt * 5)

    this.cam.update(dt, { handheld: this.typeTheme.camera.handheld * (0.6 + 0.6 * a.energy), beatPush: a.beat * this.look.scene.beatPunch * intensity, shake: this.shake, zoomKick: this.zoomKick })
    const fx: Fx = { shake: this.shake, flash: this.flash, glitch: this.glitch, zoom: 1, scrim: 0.42 + this.flash * 1.5, exposure: this.exposure }
    this.particles.update(dt)
    this.bg.render(dt, this.time, { ...this.look, palette: this.palette }, a, intensity, fx, this.scene)
    this.type.pulse(a, this.look.scene.beatPunch, this.scene.chorus, strongBeat, this.look.scene.glitch + this.look.scene.aberration * 0.5, dt)
    this.type.render(this.cam.camera)
  }

  /** Fonts, camera language and worlds follow a mood only once it has settled. */
  private updateTypeTheme(dt: number, sectionChanged: boolean): void {
    const dominant = THEMES[this.moodState.blend[0].id]
    if (dominant.id === this.typeTheme.id) {
      this.candidate = null
      return
    }
    if (this.candidate?.id !== dominant.id) {
      this.candidate = dominant
      this.candidateFor = 0
    }
    this.candidateFor += dt
    if (sectionChanged || this.candidateFor > TYPE_SWITCH_HOLD_S || this.moodState.override) {
      this.typeTheme = dominant
      this.candidate = null
    }
  }

  /** Each song gets its own tint from its musical key, on top of the mood palette. */
  private updatePalette(dt: number): void {
    const key = this.audioMood.key.estimate
    const target = key.confidence > 0.35 && this.audioMood.confidence > 0.5 ? ((key.tonic / 12) * 2 - 1) * 0.44 : 0
    this.keyHue += (target - this.keyHue) * (1 - Math.exp(-dt / 3))
    const p = this.look.palette
    const h = this.keyHue
    this.palette = Math.abs(h) < 0.01 ? p : { bg0: hueShift(p.bg0, h), bg1: hueShift(p.bg1, h), accent: hueShift(p.accent, h * 0.6), accent2: hueShift(p.accent2, h * 0.6), text: p.text, glow: hueShift(p.glow, h * 0.6) }
  }

  private updateWorlds(dt: number, sectionType: SectionType, sectionChanged: boolean): void {
    const want = this.typeTheme.scenes[sectionType]
    if (want !== this.targetMode && (sectionChanged || this.scene.mix === 0 || this.modeFade === 0)) {
      // Crossfade from whatever is on screen now to the new world over ~a bar
      this.scene.modeA = this.scene.mix > 0.5 ? this.scene.modeB : this.scene.modeA
      this.scene.modeB = want
      this.scene.mix = 0
      this.targetMode = want
      this.modeFade = Math.max(1.2, Math.min(3, (4 * 60) / (this.audioMood.bpm || 110)))
    }
    if (this.modeFade > 0 && this.scene.modeA !== this.scene.modeB) {
      this.scene.mix = Math.min(1, this.scene.mix + dt / this.modeFade)
      if (this.scene.mix >= 1) {
        this.scene.modeA = this.scene.modeB
        this.scene.mix = 0
        this.modeFade = 0
      }
    }
    const chorusTarget = sectionType === 'chorus' ? 1 : 0
    this.scene.chorus += (chorusTarget - this.scene.chorus) * (1 - Math.exp(-dt * 1.5))
  }

  private updateLyrics(t: number, lyrics: LyricLine[] | null, idx: number, la: LineAnalysis | null, intensity: number, energy: number, dt: number): void {
    if (lyrics && idx >= 0) {
      const line = lyrics[idx]
      const sungEnd = line.words.length ? line.words[line.words.length - 1].endMs : line.startMs + 3000
      const next = lyrics[idx + 1]
      const instrumentalGap = t > sungEnd + 2500 && (!next || next.startMs - t > 2000)
      if (idx !== this.lineIdx && !instrumentalGap) {
        this.lineIdx = idx
        this.enterLine(line, idx, intensity, energy, la)
      } else if (instrumentalGap && this.type.showing === 'line') {
        this.type.hide(this.hideOpts(intensity, this.pace()))
      }
      if (instrumentalGap || this.type.showing !== 'line') this.cam.idle(dt)
      this.type.updateKaraoke(t)
      return
    }
    this.cam.idle(dt)
    if (!this.song) {
      if (this.cardFor !== 'idle') {
        this.cardFor = 'idle'
        this.showCard('Play something', 'living lyrics · listening to your PC')
      }
      return
    }
    // Intro, searching, or no lyrics: title card (assembled from particles the first time)
    const key = `${this.song.key}:${this.song.status}`
    const intro = !lyrics || t < lyrics[0].startMs - 1500
    if (intro && this.cardFor !== key && this.type.showing !== 'line') {
      this.cardFor = key
      this.showCard(this.song.track.title, this.song.track.artist)
    }
  }

  private showCard(title: string, sub: string): void {
    const theme = this.typeTheme
    const pose = this.cam.nextLinePose(theme.camera.path, seeded(title.length + 3), false)
    this.cam.flyTo(pose, theme.camera.path, theme.camera.flySeconds * 1.4, theme.camera.ease, seeded(title.length), true)
    this.type.showCard(title, sub, theme, this.palette, pose, this.hideOpts(0.6, 1), this.quality.level < 3)
  }

  /** Motion pace that follows the tempo: slower songs get longer, softer moves. */
  private pace(): number {
    const bpm = this.audioMood.bpm || 110
    return Math.min(1.4, Math.max(0.65, 60 / bpm / 0.5))
  }

  private enterLine(line: LyricLine, idx: number, intensity: number, energy: number, la: LineAnalysis | null): void {
    const theme = this.typeTheme
    const sectionType = this.section?.type ?? 'verse'
    const isSectionStart = !!this.section && this.section.lineStart === idx
    const isSectionEnd = !!this.section && this.section.lineEnd - 1 === idx
    const chorusStart = isSectionStart && sectionType === 'chorus'
    const duration = line.endMs - line.startMs
    // Quick-fire lines get snappier moves so they never lag behind the vocals
    const pace = this.pace() * (duration < 1500 ? 0.6 : duration < 2500 ? 0.8 : 1)
    // The song decides the choreography: mood, energy, tempo, section, the line's words
    const choice = chooseTransition({
      theme,
      blend: this.moodState.blend,
      sectionType,
      isSectionStart,
      isSectionEnd,
      intensity,
      energy,
      bpm: this.audioMood.bpm,
      lineIndex: idx,
      lineDurationMs: duration,
      lineChars: Array.from(line.text).length,
      lineArousal: la?.arousal ?? this.moodState.point.arousal,
      keywords: (la?.keywords ?? []).map((k) => k.effect),
      recentIn: this.recentIn,
      recentOut: this.recentOut,
      pace,
      latin: detectScript(line.text) === 'latin',
      synced: !!this.song?.synced
    })
    this.recentIn = [choice.in, ...this.recentIn].slice(0, 3)
    this.recentOut = [choice.out, ...this.recentOut].slice(0, 3)
    this.lastChoice = choice

    const rand = seeded(idx * 31 + 5)
    const pose = this.cam.nextLinePose(theme.camera.path, rand, chorusStart)
    let fly = theme.camera.flySeconds * (chorusStart ? 1.6 : 1) * Math.min(1.2, pace)
    fly = Math.min(fly, Math.max(0.35, (duration / 1000) * 0.7))
    // Land on the beat when one is close
    const toBeat = this.audio.nextBeatIn(this.audioMood.bpm) / 1000
    if (Number.isFinite(toBeat)) {
      const period = 60 / (this.audioMood.bpm || 120)
      const landing = Math.round((fly - toBeat) / period) * period + toBeat
      if (Math.abs(landing - fly) < 0.12 && landing > 0.3) fly = landing
    }
    this.cam.flyTo(pose, theme.camera.path, fly, theme.camera.ease, rand, chorusStart)

    this.type.showLine(
      line,
      la,
      {
        theme,
        palette: this.palette,
        pose,
        inPreset: choice.in,
        outPreset: choice.out,
        exit: choice.exitStyle,
        particleExit: choice.particleExit,
        intensity,
        pace,
        karaoke: !!this.song?.synced,
        assemble: chorusStart && this.quality.level < 3
      },
      this.hideOpts(intensity, pace)
    )
    if (chorusStart) {
      this.flash = Math.max(this.flash, 0.15)
      this.zoomKick = Math.max(this.zoomKick, 0.05)
      this.shake = Math.max(this.shake, this.look.scene.shake * 0.8)
    }
  }
}

function findLine(lines: LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].startMs <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

function statusText(s: SongPayload | null): string {
  if (!s) return ''
  switch (s.status) {
    case 'searching':
      return 'searching lyrics…'
    case 'plain':
      return 'no synced lyrics found · timing is estimated · [ ] to nudge'
    case 'none':
      return 'no lyrics found · drop an .lrc file here · R to retry'
    case 'instrumental':
      return 'instrumental'
    case 'error':
      return "couldn't reach the lyrics service · R to retry"
    default:
      return ''
  }
}
