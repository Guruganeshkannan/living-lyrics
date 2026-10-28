import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Settings {
  /** Lyrics sources, searched in parallel. Remove one to switch it off. */
  providers: string[]
  /** Give up on the online search after this many ms */
  searchTimeoutMs: number
}

// Musixmatch and NetEase go through unofficial endpoints, so they're opt-in:
// add "musixmatch" and/or "netease" to `providers` in settings.json to use them.
const DEFAULTS: Settings = {
  providers: ['lrclib', 'lyrics.ovh'],
  searchTimeoutMs: 12000
}

let cached: Settings | null = null

/** %APPDATA%/living-lyrics/settings.json — created with defaults on first run. */
export function settings(): Settings {
  if (cached) return cached
  const file = join(app.getPath('userData'), 'settings.json')
  try {
    cached = { ...DEFAULTS, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    cached = { ...DEFAULTS }
    try {
      writeFileSync(file, JSON.stringify(DEFAULTS, null, 2))
    } catch {
      /* read-only profile: defaults still apply */
    }
  }
  return cached!
}
