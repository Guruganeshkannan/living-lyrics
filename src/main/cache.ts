import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const dir = () => join(app.getPath('userData'), 'cache')

const safe = (key: string) => key.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 120)

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(dir(), `${safe(key)}.json`), 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(join(dir(), `${safe(key)}.json`), JSON.stringify(value))
}
