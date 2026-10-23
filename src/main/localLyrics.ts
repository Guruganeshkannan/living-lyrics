import { app } from 'electron'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { similarity } from './lyricsService'

/** User-supplied lyrics always win: Documents/LivingLyrics/lyrics/Artist - Title.lrc */
export const lyricsDir = () => join(app.getPath('documents'), 'LivingLyrics', 'lyrics')

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 120)

export async function findLocalLyrics(title: string, artist: string): Promise<{ text: string; file: string } | null> {
  let files: string[]
  try {
    files = await readdir(lyricsDir())
  } catch {
    return null
  }
  const want = `${artist} - ${title}`
  let best: { file: string; s: number } | null = null
  for (const f of files) {
    const ext = extname(f).toLowerCase()
    if (ext !== '.lrc' && ext !== '.txt') continue
    const name = f.slice(0, -ext.length)
    const s = Math.max(similarity(name, want), similarity(name, title) * 0.95)
    if (!best || s > best.s) best = { file: f, s }
  }
  if (!best || best.s < 0.8) return null
  return { text: await readFile(join(lyricsDir(), best.file), 'utf8'), file: best.file }
}

export async function saveLocalLyrics(title: string, artist: string, text: string): Promise<string> {
  await mkdir(lyricsDir(), { recursive: true })
  const file = `${safeName(artist) || 'Unknown'} - ${safeName(title) || 'Untitled'}.lrc`
  await writeFile(join(lyricsDir(), file), text, 'utf8')
  return file
}
