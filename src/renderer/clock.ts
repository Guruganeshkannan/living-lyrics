/**
 * Song position that runs smoothly between the OS's sparse timeline updates.
 * Small disagreements are slewed out; big ones (seeks) jump immediately.
 */
export class SongClock {
  private basePos = 0
  private baseWall = 0
  private playing = false
  /** Without a usable OS timeline we just count time while playing */
  private freeRun = false

  reset(positionMs: number, playing: boolean, wall = Date.now()): void {
    this.basePos = positionMs
    this.baseWall = wall
    this.playing = playing
  }

  get isPlaying(): boolean {
    return this.playing
  }

  now(wall = Date.now()): number {
    return this.playing ? this.basePos + (wall - this.baseWall) : this.basePos
  }

  /** Returns true when the update was treated as a seek. */
  sync(positionMs: number, updatedAt: number, isPlaying: boolean, durationMs: number, wall = Date.now()): boolean {
    const expected = this.now(wall)
    if (isPlaying !== this.playing) {
      // Freeze or resume exactly where we are
      this.freeRun = durationMs <= 0
      const pos = this.freeRun ? expected : this.reported(positionMs, updatedAt, isPlaying, wall)
      this.reset(pos, isPlaying, wall)
      return false
    }
    this.freeRun = durationMs <= 0
    if (this.freeRun) return false

    const actual = this.reported(positionMs, updatedAt, isPlaying, wall)
    const error = actual - expected
    if (Math.abs(error) > 1500) {
      this.reset(actual, isPlaying, wall)
      return true
    }
    if (Math.abs(error) > 40) this.reset(expected + error * 0.35, isPlaying, wall)
    return false
  }

  private reported(positionMs: number, updatedAt: number, isPlaying: boolean, wall: number): number {
    // updatedAt in the future or absurdly old means the source doesn't stamp properly
    const age = wall - updatedAt
    const usable = updatedAt > 0 && age >= 0 && age < 60 * 60 * 1000
    return isPlaying && usable ? positionMs + age : positionMs
  }
}
