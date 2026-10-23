/** Everything the visuals know about the sound, refreshed every frame. All 0..1 unless noted. */
export interface AudioState {
  active: boolean
  silent: boolean
  rms: number
  /** Loudness relative to the recent past, so quiet and loud mixes both move */
  energy: number
  bass: number
  mid: number
  treble: number
  /** Spectral brightness */
  centroid: number
  flux: number
  /** Decaying envelope that jumps to 1 on each detected kick/beat */
  beat: number
  /** Decaying envelope that jumps to 1 on any sharp onset */
  onset: number
  beatCount: number
  /** Seconds since the last beat */
  beatAge: number
  /** performance.now() of each beat, newest last (for the tempo tracker) */
  beatTimes: number[]
  chroma: Float32Array
}

/** Auto-gain: tracks a slowly decaying peak so values normalize to the mix. */
class Agc {
  private peak = 1e-4
  constructor(private release = 0.9975, private floor = 1e-4) {}
  norm(x: number): number {
    this.peak = Math.max(x, this.peak * this.release, this.floor)
    return Math.min(1, x / this.peak)
  }
}

/** Rolling mean/std for adaptive onset thresholds. */
class Stats {
  private buf: number[] = []
  constructor(private size: number) {}
  push(x: number): void {
    this.buf.push(x)
    if (this.buf.length > this.size) this.buf.shift()
  }
  get mean(): number {
    return this.buf.reduce((a, b) => a + b, 0) / (this.buf.length || 1)
  }
  get std(): number {
    const m = this.mean
    return Math.sqrt(this.buf.reduce((a, b) => a + (b - m) * (b - m), 0) / (this.buf.length || 1))
  }
}

const smooth = (prev: number, next: number, attack: number, release: number) => prev + (next - prev) * (next > prev ? attack : release)

export class AudioEngine {
  readonly state: AudioState = {
    active: false,
    silent: true,
    rms: 0,
    energy: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0.5,
    flux: 0,
    beat: 0,
    onset: 0,
    beatCount: 0,
    beatAge: 10,
    beatTimes: [],
    chroma: new Float32Array(12)
  }
  error = ''

  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private freq = new Float32Array(0)
  private prevMag = new Float32Array(0)
  private time = new Float32Array(0)
  private binHz = 0
  private agc = { rms: new Agc(0.9992), bass: new Agc(), mid: new Agc(), treble: new Agc(), flux: new Agc(0.999) }
  private bassFluxStats = new Stats(43) // ~0.7s at 60fps
  private fluxStats = new Stats(43)
  private lastBeat = 0
  private lastOnset = 0

  async start(): Promise<void> {
    try {
      // Main process answers this with system loopback audio (no picker)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      stream.getVideoTracks().forEach((t) => t.stop())
      if (!stream.getAudioTracks().length) throw new Error('no loopback audio track')
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      const src = this.ctx.createMediaStreamSource(stream)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0
      src.connect(this.analyser)
      this.freq = new Float32Array(this.analyser.frequencyBinCount)
      this.prevMag = new Float32Array(this.analyser.frequencyBinCount)
      this.time = new Float32Array(this.analyser.fftSize)
      this.binHz = this.ctx.sampleRate / this.analyser.fftSize
      this.state.active = true
    } catch (e) {
      this.error = String(e)
      console.error('[audio]', e)
    }
  }

  update(dt: number): AudioState {
    const s = this.state
    s.beatAge += dt
    // Envelopes decay even without audio so pulses fade out cleanly
    s.beat *= Math.exp(-dt * 5.5)
    s.onset *= Math.exp(-dt * 8)
    if (!this.analyser) return s

    this.analyser.getFloatTimeDomainData(this.time)
    this.analyser.getFloatFrequencyData(this.freq)

    let sq = 0
    for (let i = 0; i < this.time.length; i++) sq += this.time[i] * this.time[i]
    const rms = Math.sqrt(sq / this.time.length)
    s.rms = rms
    s.silent = rms < 0.002

    let bass = 0,
      mid = 0,
      treble = 0,
      flux = 0,
      bassFlux = 0,
      wSum = 0,
      fSum = 0
    const chroma = new Float32Array(12)
    for (let i = 1; i < this.freq.length; i++) {
      const hz = i * this.binHz
      if (hz > 12000) break
      const mag = Math.pow(10, this.freq[i] / 20) // dB -> linear
      const comp = Math.log1p(mag * 1000) // compressed, better for flux
      const diff = comp - this.prevMag[i]
      this.prevMag[i] = comp
      if (diff > 0) {
        flux += diff
        if (hz < 150) bassFlux += diff
      }
      if (hz < 150) bass += mag
      else if (hz < 2000) mid += mag
      else treble += mag
      wSum += mag * hz
      fSum += mag
      if (hz > 60 && hz < 5000) {
        const pitch = 12 * Math.log2(hz / 440) + 69
        chroma[((Math.round(pitch) % 12) + 12) % 12] += mag * mag
      }
    }

    const nb = this.agc.bass.norm(bass)
    const nm = this.agc.mid.norm(mid)
    const nt = this.agc.treble.norm(treble)
    s.bass = smooth(s.bass, nb, 0.6, 0.12)
    s.mid = smooth(s.mid, nm, 0.5, 0.1)
    s.treble = smooth(s.treble, nt, 0.6, 0.15)
    s.energy = smooth(s.energy, this.agc.rms.norm(rms), 0.3, 0.05)
    const centroidHz = fSum > 0 ? wSum / fSum : 1000
    const c = Math.min(1, Math.max(0, Math.log2(centroidHz / 200) / Math.log2(6000 / 200)))
    s.centroid = smooth(s.centroid, c, 0.05, 0.05)
    s.flux = smooth(s.flux, this.agc.flux.norm(flux), 0.5, 0.15)

    let chromaSum = 0
    for (let i = 0; i < 12; i++) chromaSum += chroma[i]
    for (let i = 0; i < 12; i++) s.chroma[i] = chromaSum > 0 ? chroma[i] / chromaSum : 0

    if (s.silent) return s
    const now = performance.now()

    // Kick detection: bass flux well above its recent average
    const bThresh = this.bassFluxStats.mean + this.bassFluxStats.std * 1.5
    if (bassFlux > bThresh && bassFlux > 0.5 && now - this.lastBeat > 280) {
      this.lastBeat = now
      s.beat = 1
      s.beatAge = 0
      s.beatCount++
      s.beatTimes.push(now)
      if (s.beatTimes.length > 48) s.beatTimes.shift()
    }
    this.bassFluxStats.push(bassFlux)

    const oThresh = this.fluxStats.mean + this.fluxStats.std * 1.8
    if (flux > oThresh && now - this.lastOnset > 110) {
      this.lastOnset = now
      s.onset = 1
    }
    this.fluxStats.push(flux)
    return s
  }
}
