import { describe, expect, it } from 'vitest'
import { LyricsNetworkError, fetchLyrics, trackVariants } from '../src/main/lyricsService'
import { ProviderNetworkError } from '../src/main/providers/http'
import { richsyncToLrc } from '../src/main/providers/musixmatch'
import type { Candidate, LyricsProvider } from '../src/main/providers/types'
import { parseLrc } from '../src/main/lrcParser'

const LRC = '[00:01.00]hello there\n[00:04.00]general kenobi'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fake(name: string, delayMs: number, c: Partial<Candidate> | null, fail = false): LyricsProvider {
  return {
    name,
    async search({ emit, signal }) {
      await sleep(delayMs)
      if (signal.aborted) return
      if (fail) throw new ProviderNetworkError('down')
      if (c) emit({ provider: name, via: 'test', trackName: 'Hello There', artistName: 'Obi', duration: 200, ...c })
    }
  }
}

const search = (impls: LyricsProvider[], deadlineMs = 2000) => fetchLyrics('Hello There', 'Obi', 200000, '', { impls, deadlineMs })

describe('multi-source lyrics search', () => {
  it('returns the first strong synced match without waiting for slow sources', async () => {
    const t0 = Date.now()
    const r = await search([fake('fast', 10, { synced: LRC }), fake('slow', 5000, { synced: LRC })])
    expect(r?.synced).toBe(true)
    expect(r?.source).toContain('fast')
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  it('prefers word-level timing that arrives within the grace period', async () => {
    const r = await search([fake('a', 10, { synced: LRC }), fake('b', 300, { synced: '[00:01.00]<00:01.00>hello <00:01.50>there', wordLevel: true })])
    expect(r?.source).toContain('b')
  })

  it('prefers synced over plain, whatever arrives first', async () => {
    const r = await search([fake('plain', 5, { plain: 'hello there\ngeneral kenobi' }), fake('sync', 200, { synced: LRC })])
    expect(r?.synced).toBe(true)
  })

  it('falls back to plain lyrics when nothing is synced', async () => {
    const r = await search([fake('plain', 5, { plain: 'hello there\ngeneral kenobi' }), fake('none', 5, null)])
    expect(r?.synced).toBe(false)
    expect(r?.lines.length).toBe(2)
  })

  it('never hangs: the deadline returns what it has', async () => {
    const t0 = Date.now()
    const r = await search([fake('slow', 10000, { synced: LRC })], 300)
    expect(r).toBeNull()
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('rejects wrong songs and wrong-length versions', async () => {
    const r = await search([fake('x', 5, { synced: LRC, trackName: 'Something Else Entirely' }), fake('y', 5, { synced: LRC, duration: 400 })])
    expect(r).toBeNull()
  })

  it('reports offline only when every source failed to connect', async () => {
    await expect(search([fake('a', 5, null, true), fake('b', 5, null, true)])).rejects.toBeInstanceOf(LyricsNetworkError)
    await expect(search([fake('a', 5, null, true), fake('b', 5, null)])).resolves.toBeNull()
  })
})

describe('trackVariants', () => {
  it('trusts the title first when the artist is real', () => {
    expect(trackVariants('Arabic Kuthu - Halamithi Habibo (From "Beast")', 'Anirudh Ravichander')[0]).toEqual({ title: 'Arabic Kuthu - Halamithi Habibo', artist: 'Anirudh Ravichander' })
  })
  it('splits YouTube "Artist - Song | Movie" titles from label channels', () => {
    const v = trackVariants('Arijit Singh - Channa Mereya | Ae Dil Hai Mushkil', 'SonyMusicIndiaVEVO')
    expect(v).toContainEqual({ title: 'Channa Mereya', artist: 'Arijit Singh' })
  })
})

describe('Musixmatch richsync', () => {
  it('converts word timing into enhanced LRC the parser understands', () => {
    const body = JSON.stringify([{ ts: 12.5, te: 15, x: 'hello world', l: [{ c: 'hello', o: 0 }, { c: ' ', o: 0.4 }, { c: 'world', o: 0.6 }] }])
    const lrc = richsyncToLrc(body)!
    expect(lrc).toBe('[00:12.50]<00:12.50>hello <00:13.10>world')
    const [line] = parseLrc(lrc)
    expect(line.wordsEstimated).toBe(false)
    expect(line.words.map((w) => w.startMs)).toEqual([12500, 13100])
  })
})
