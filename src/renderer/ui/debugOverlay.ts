import type { SceneDirector } from '../sceneDirector'

const fmt = (ms: number) => {
  const s = Math.max(0, ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const bar = (x: number) => '█'.repeat(Math.round(Math.min(1, Math.max(0, x)) * 12)).padEnd(12, '·')

export class DebugOverlay {
  visible = false
  private last = 0

  constructor(private el: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible
    this.el.hidden = !this.visible
  }

  update(d: SceneDirector, now: number): void {
    if (!this.visible || now - this.last < 100) return
    this.last = now
    const m = d.media
    const a = d.audio.state
    const am = d.audioMood
    const ms = d.moodState
    const song = d.song
    const line = song?.lyrics && d.lineIdx >= 0 ? song.lyrics[d.lineIdx] : null
    const lines = [
      `track    ${m?.type === 'track' ? `${m.artist} — ${m.title}` : (m?.type ?? 'waiting for sidecar')}`,
      `source   ${m?.type === 'track' ? m.sourceApp : '-'}  ${d.clock.isPlaying ? '▶' : '❚❚'}`,
      `position ${fmt(d.clock.now())}  offset ${d.offsetMs >= 0 ? '+' : ''}${d.offsetMs}ms`,
      `lyrics   ${song?.lyrics ? `${song.lyrics.length} lines (${song.synced ? 'synced' : 'estimated'})` : 'none'}`,
      `line     ${line ? `#${line.index} "${line.text.slice(0, 48)}"` : '-'}`,
      `section  ${d.section ? `${d.section.type} [${fmt(d.section.startMs)}–${fmt(d.section.endMs)}]` : '-'}`,
      `mood     ${ms.blend.map((b) => `${b.id} ${(b.weight * 100).toFixed(0)}%`).join(' + ')}${ms.override ? '  (manual)' : ''}`,
      `v/a      ${ms.point.valence.toFixed(2)} / ${ms.point.arousal.toFixed(2)}   intensity ${ms.intensity.toFixed(2)}`,
      `lyric    ${song?.analysis ? `${song.analysis.overall.dominant}  v ${song.analysis.overall.valence.toFixed(2)} a ${song.analysis.overall.arousal.toFixed(2)}` : '-'}`,
      `audio    ${a.active ? 'loopback ok' : `off ${d.audio.error}`}  conf ${(am.confidence * 100).toFixed(0)}%`,
      `key      ${am.key.estimate.name} (${am.key.estimate.modeScore.toFixed(2)})   bpm ${am.bpm || '?'} (${(am.tempoConfidence * 100).toFixed(0)}%)`,
      `energy   ${bar(a.energy)}  beat ${bar(a.beat)}`,
      `bass     ${bar(a.bass)}  mid  ${bar(a.mid)}`,
      `treble   ${bar(a.treble)}  bright ${bar(a.centroid)}`,
      '',
      '[ ]  offset ±100ms   M mood   F fullscreen   P mini   D debug'
    ]
    this.el.textContent = lines.join('\n')
  }
}
