import { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { MediaUpdate, TrackInfo } from '@shared/types'

/**
 * Runs the PowerShell SMTC sidecar and re-emits its JSON lines.
 * Emits 'update' for every sample and 'track' when the song itself changes.
 */
export class MediaWatcher extends EventEmitter {
  private proc: ChildProcess | null = null
  private currentKey = ''
  private stopped = false

  constructor(private scriptPath: string) {
    super()
  }

  start(): void {
    this.stopped = false
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, '-IntervalMs', '400'], {
      windowsHide: true
    })
    this.proc = proc
    createInterface({ input: proc.stdout! }).on('line', (line) => this.handle(line))
    proc.stderr?.on('data', (d) => console.error('[media-watcher]', String(d).trim()))
    proc.on('exit', (code) => {
      this.proc = null
      if (!this.stopped) {
        console.warn(`[media-watcher] exited (${code}), restarting`)
        setTimeout(() => this.start(), 1500)
      }
    })
  }

  stop(): void {
    this.stopped = true
    this.proc?.kill()
  }

  private handle(line: string): void {
    let u: MediaUpdate
    try {
      u = JSON.parse(line)
    } catch {
      return
    }
    this.emit('update', u)
    if (u.type !== 'track' || !u.title) return
    const key = trackKey(u)
    if (key !== this.currentKey) {
      this.currentKey = key
      this.emit('track', u as TrackInfo)
    }
  }
}

export const trackKey = (t: Pick<TrackInfo, 'title' | 'artist'>) => `${t.artist} - ${t.title}`.trim()
