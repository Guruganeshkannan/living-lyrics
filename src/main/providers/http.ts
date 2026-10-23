/** Small fetch helpers: short timeouts, one quick retry, and cancellation from the search orchestrator. */

export class ProviderNetworkError extends Error {}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LivingLyrics/0.3'

export interface FetchOpts {
  headers?: Record<string, string>
  signal: AbortSignal
  timeoutMs?: number
  /** Retries after the first attempt (network errors / 5xx / 429 only) */
  retries?: number
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true })
  })

/** Returns null for "not found" (404 / 4xx); throws ProviderNetworkError when the service can't be reached. */
export async function fetchText(url: string, o: FetchOpts): Promise<string | null> {
  let lastErr: unknown = null
  const attempts = 1 + (o.retries ?? 1)
  for (let i = 0; i < attempts; i++) {
    if (o.signal.aborted) throw o.signal.reason
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...o.headers },
        signal: AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs ?? 5000)])
      })
      if (res.ok) return await res.text()
      if (res.status < 500 && res.status !== 429) return null
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      if (o.signal.aborted) throw o.signal.reason
      lastErr = e
    }
    if (i < attempts - 1) await sleep(400 * (i + 1), o.signal)
  }
  throw new ProviderNetworkError(String(lastErr))
}

export async function fetchJson<T>(url: string, o: FetchOpts): Promise<T | null> {
  const text = await fetchText(url, o)
  if (text == null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
