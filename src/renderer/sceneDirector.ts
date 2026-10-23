import type { KeywordEffect, LineAnalysis, LyricLine, MediaUpdate, Section, SongPayload } from '@shared/types'
import { AudioEngine } from './audio/audioEngine'
import { SongClock } from './clock'
import { BackgroundLayer, type Fx } from './layers/BackgroundLayer'
import type { TypographyLayer } from './layers/TypographyLayer'
import { AudioMood } from './mood/audioMood'
import { MoodDirector, type MoodState } from './mood/moodDirector'
import { approachLook, blendThemes, type BlendedLook } from './themes/blend'
import { THEMES } from './themes/themes'
import { chooseTransition } from './transitions/TransitionEngine'
import type { InPreset } from './transitions/presets'

/** Show a line slightly before its timestamp so the entrance lands on the word. */
const LEAD_MS = 60

export class SceneDirector {
  readonly clock = new SongClock()
  readonly audio = new AudioEngine()
  readonly audioMood = new AudioMood()
  readonly mood = new MoodDirector(this.audioMood)

  song: SongPayload | null = null
  media: MediaUpdate | null = null
  offsetMs = 0
  lineIdx = -1
  section: Section | null = null
  moodState: MoodState = this.mood.state
  look: BlendedLook = blendThemes([{ id: 'nostalgic', weight: 1 }])

  private mediaKey = ''
  private lastIn: InPreset | null = null
  private time = 0
  private lastBeatCount = 0
  private shake = 0
  private flash = 0
  private glitch = 0
  private zoomKick = 0
  private fx: Fx = { shakeX: 0, shakeY: 0, flash: 0, glitch: 0, zoom: 1 }
  private cardFor = ''

  constructor(
    private bg: BackgroundLayer,
    private type: TypographyLayer
  ) {
    type.onImpact = (s, kind) => this.impact(s, kind)
  }

  onMedia(u: MediaUpdate): void {
    this.media = u
    if (u.type !== 'track' || !u.title) return
    const key = `${u.artist} - ${u.title}`.trim()
    if (key !== this.mediaKey) {
      this.mediaKey = key
      // New track: start counting from wherever the player says it is
      const age = u.isPlaying && u.updatedAt > 0 ? Math.max(0, Date.now() - u.updatedAt) : 0
      this.clock.reset(u.positionMs + (age < 5000 ? age : 0), u.isPlaying)
      this.clock.sync(u.positionMs, u.updatedAt, u.isPlaying, u.durationMs)
      return
    }
    if (this.clock.sync(u.positionMs, u.updatedAt, u.isPlaying, u.durationMs)) this.resetLines()
  }

  setSong(s: SongPayload | null): void {
    const sameSong = s && this.song?.key === s.key
    this.song = s
    this.offsetMs = s?.offsetMs ?? 0
    this.resetLines()
    if (!sameSong) {
      this.mood.reset(s?.analysis ?? null)
      this.audioMood.reset()
      this.cardFor = ''
      this.zoomKick = 0.08
      this.flash = 0.6
    } else if (s?.analysis) {
      this.mood.reset(s.analysis)
    }
  }

  nudgeOffset(deltaMs: number): void {
    this.offsetMs += deltaMs
    if (this.song) window.lyrics.setOffset(this.song.key, this.offsetMs)
    this.resetLines()
  }

  private resetLines(): void {
    this.lineIdx = -1
    this.type.hide(0.6, 0.6)
  }

  private impact(strength: number, kind?: KeywordEffect): void {
    const s = this.look.scene
    this.shake = Math.max(this.shake, strength * (0.3 + s.shake))
    this.flash = Math.max(this.flash, strength * 0.4 * (kind === 'glow' || kind === 'burn' ? 1.6 : 1))
    this.glitch = Math.max(this.glitch, strength * s.glitch * 1.4)
    this.zoomKick = Math.max(this.zoomKick, strength * 0.025)
  }

  /** Main loop: one call per animation frame. */
  frame(dt: number): void {
    this.time += dt
    const a = this.audio.update(dt)
    const energyEvent = this.audioMood.update(a, dt)
    const t = this.clock.now() + this.offsetMs

    const lyrics = this.song?.lyrics ?? null
    const analysis = this.song?.analysis ?? null
    this.section = analysis?.sections.find((s) => t >= s.startMs && t < s.endMs) ?? null
    const idx = lyrics ? this.findLine(lyrics, t + LEAD_MS) : -1
    const lineAnalysis = idx >= 0 ? (analysis?.lines[idx] ?? null) : null

    this.moodState = this.mood.update(dt, a, analysis, this.section, lineAnalysis, energyEvent)
    const target = blendThemes(this.moodState.blend)
    this.look = approachLook(this.look, target, 1 - Math.exp(-dt * 2.2))
    const theme = this.look.dominant
    const intensity = this.moodState.intensity

    if (energyEvent === 'surge') this.impact(0.8)

    // Lyrics
    if (lyrics && idx >= 0) {
      const line = lyrics[idx]
      const sungEnd = line.words.length ? line.words[line.words.length - 1].endMs : line.startMs + 3000
      const next = lyrics[idx + 1]
      const instrumentalGap = t > sungEnd + 2500 && (!next || next.startMs - t > 2000)
      if (idx !== this.lineIdx && !instrumentalGap) {
        this.lineIdx = idx
        this.enterLine(line, idx, intensity, a.energy, lineAnalysis)
      } else if (instrumentalGap && this.type.showing === 'line') {
        this.type.hide(intensity, this.pace())
      }
      this.type.updateWords(t)
    } else if (this.type.showing !== 'card' && this.song) {
      // Intro, or a song with no lyrics: show the title instead
      const key = this.song.key + (lyrics ? ':intro' : ':nolyrics')
      if (this.cardFor !== key && (!lyrics || t < lyrics[0].startMs - 1500)) {
        this.cardFor = key
        this.type.showCard(this.song.track.title, this.song.track.artist, theme, intensity)
      }
    } else if (!this.song && this.type.showing === null && this.cardFor !== 'idle') {
      this.cardFor = 'idle'
      this.type.showCard('Play something', 'living lyrics · listening to your PC', theme, 0.6)
    }

    // Beat reactions
    if (a.beatCount !== this.lastBeatCount) {
      this.lastBeatCount = a.beatCount
      const s = this.look.scene
      this.shake = Math.max(this.shake, s.shake * intensity * 0.55)
      this.zoomKick = Math.max(this.zoomKick, 0.012 * s.beatPunch * intensity)
      if (a.onset > 0.9 && Math.random() < s.glitch * 0.6) this.glitch = Math.max(this.glitch, s.glitch)
    }
    this.shake *= Math.exp(-dt * 9)
    this.flash *= Math.exp(-dt * 3.5)
    this.glitch *= Math.exp(-dt * 7)
    this.zoomKick *= Math.exp(-dt * 6)
    const jitter = () => (Math.random() * 2 - 1) * this.shake
    this.fx = { shakeX: jitter(), shakeY: jitter(), flash: this.flash, glitch: this.glitch, zoom: 1 + this.zoomKick }

    this.bg.render(dt, this.time, this.look, a, intensity, this.fx)
    this.type.update(this.look, a, this.fx, intensity, this.time)
  }

  /** Motion pace that follows the tempo: slower songs get longer, softer moves. */
  private pace(): number {
    const bpm = this.audioMood.bpm || 110
    return Math.min(1.4, Math.max(0.65, 60 / bpm / 0.5))
  }

  private enterLine(line: LyricLine, idx: number, intensity: number, energy: number, la: LineAnalysis | null): void {
    const theme = this.look.dominant
    const sectionType = this.section?.type ?? 'verse'
    const isSectionStart = !!this.section && this.section.lineStart === idx
    const choice = chooseTransition({ theme, sectionType, isSectionStart, intensity, energy, lineIndex: idx, previousIn: this.lastIn })
    this.lastIn = choice.in
    // Quick-fire lines get snappier transitions so they never lag behind the vocals
    const duration = line.endMs - line.startMs
    const pace = this.pace() * (duration < 1500 ? 0.6 : duration < 2500 ? 0.8 : 1)
    this.type.showLine(line, la, { theme: THEMES[theme.id], inPreset: choice.in, outPreset: choice.out, intensity, pace, karaoke: !!this.song?.synced })
    if (isSectionStart && sectionType === 'chorus') {
      this.flash = Math.max(this.flash, 0.9)
      this.zoomKick = Math.max(this.zoomKick, 0.06)
      this.shake = Math.max(this.shake, this.look.scene.shake * 0.8)
    }
  }

  private findLine(lines: LyricLine[], t: number): number {
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
}
