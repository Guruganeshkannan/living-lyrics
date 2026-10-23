// Packages the Windows .exe files and signs them with Guruganesh's code-signing certificate.
// The certificate lives outside the repo: %USERPROFILE%\.living-lyrics-signing\
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = process.env.LL_SIGNING_DIR ?? join(homedir(), '.living-lyrics-signing')
const pfx = join(dir, 'guruganesh-codesign.pfx')
const env = { ...process.env }
if (existsSync(pfx)) {
  env.CSC_LINK = pfx
  env.CSC_KEY_PASSWORD = readFileSync(join(dir, 'pfx-password.txt'), 'utf8').trim()
  console.log(`signing with ${pfx}`)
} else {
  console.warn(`no certificate at ${pfx}: building UNSIGNED`)
}
const r = spawnSync('npx', ['electron-builder', '--win', '--x64'], { stdio: 'inherit', env, shell: true })
process.exit(r.status ?? 1)
