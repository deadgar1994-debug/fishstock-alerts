import { BACKEND_URL } from "@/src/config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJsonWithRetry<T>(
  path: string,
  opts?: RequestInit,
  attempts = 6
): Promise<T> {
  let lastErr: any;

  for (let i = 0; i < attempts; i++) {
    try {
      // cache-bust param helps on some networks
      const url = `${BACKEND_URL}${path}${path.includes("?") ? "&" : "?"}t=${Date.now()}`;

      const res = await fetch(url, opts);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      return json as T;
    } catch (e) {
      lastErr = e;
      // backoff: 0.5s, 1s, 2s, 4s...
      await sleep(Math.min(8000, 500 * Math.pow(2, i)));
    }
  }

  throw lastErr;
}
