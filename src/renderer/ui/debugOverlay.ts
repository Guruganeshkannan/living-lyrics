import type { SceneDirector } from '../sceneDirector'
import { SCENE_NAMES } from '../themes/themes'

const fmt = (ms: number) => {
  const s = Math.max(0, ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const bar = (x: number) => '█'.repeat(Math.round(Math.min(1, Math.max(0, x)) * 12)).padEnd(12, '·')
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`

export class DebugOverlay {
  visible = false
  private last = 0

  constructor(private el: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible
    this.el.hidden = !this.visible
  }

  update(d: SceneDirector, now: number): void {
    if (!this.visible || now - this.last < 120) return
    this.last = now
    const m = d.media
    const a = d.audio.state
    const am = d.audioMood
    const ms = d.moodState
    const song = d.song
    const line = song?.lyrics && d.lineIdx >= 0 ? song.lyrics[d.lineIdx] : null
    const sc = d.scene
    const world = sc.mix > 0 ? `${SCENE_NAMES[sc.modeA]} → ${SCENE_NAMES[sc.modeB]} ${(sc.mix * 100).toFixed(0)}%` : SCENE_NAMES[sc.modeA]
    const lines = [
      `track    ${d.demo ? 'DEMO ' : ''}${song ? `${song.track.artist} — ${song.track.title}` : m?.type === 'track' ? `${m.artist} — ${m.title}` : (m?.type ?? 'waiting for player')}`,
      `source   ${m?.type === 'track' ? m.sourceApp : '-'}  ${d.clock.isPlaying ? '▶' : '❚❚'}`,
      `position ${fmt(d.clock.now() + d.offsetMs)}  offset song ${signed(d.songOffsetMs)} global ${signed(d.globalOffsetMs)} ms`,
      `lyrics   ${song ? `${song.status}${song.lyrics ? ` · ${song.lyrics.length} lines` : ''} · ${song.source || '-'}` : '-'}`,
      `language ${song?.analysis?.languages.join(', ') || '-'}`,
      `line     ${line ? `#${line.index} "${line.text.slice(0, 44)}"${line.wordsEstimated ? ' (est.)' : ''}` : '-'}`,
      `section  ${d.section ? `${d.section.type} [${fmt(d.section.startMs)}–${fmt(d.section.endMs)}]` : '-'}`,
      `mood     ${ms.blend.map((b) => `${b.id} ${(b.weight * 100).toFixed(0)}%`).join(' + ')}${ms.override ? '  (manual)' : ''}`,
      `staging  ${d.typeTheme.id} · camera ${d.typeTheme.camera.path} · world ${world}`,
      `motion   ${d.lastChoice ? `in ${d.lastChoice.in} · out ${d.lastChoice.particleExit ? `particles(${d.lastChoice.exitStyle})` : d.lastChoice.out} · hit ${d.lastChoice.targetEnergy.toFixed(2)}` : '-'}`,
      `v/a      ${ms.point.valence.toFixed(2)} / ${ms.point.arousal.toFixed(2)}   intensity ${ms.intensity.toFixed(2)}`,
      `audio    ${d.demo ? 'simulated beat' : a.active ? 'loopback ok' : `off ${d.audio.error}`}  conf ${(am.confidence * 100).toFixed(0)}%`,
      `key      ${am.key.estimate.name} (${am.key.estimate.modeScore.toFixed(2)})   bpm ${am.bpm || '?'} (${(am.tempoConfidence * 100).toFixed(0)}%)`,
      `energy   ${bar(a.energy)}  beat ${bar(a.beat)}`,
      `bass     ${bar(a.bass)}  bright ${bar(a.centroid)}`,
      `perf     ${d.quality.fps.toFixed(0)} fps (${d.quality.frameMs.toFixed(1)} ms) · quality ${d.quality.current.name}`,
      '',
      '[ ] sync ±100ms (shift = global)   M mood   R reload lyrics   F fullscreen   P mini   D debug   Ctrl+Shift+D demo'
    ]
    this.el.textContent = lines.join('\n')
  }
}
