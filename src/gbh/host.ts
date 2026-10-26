/*
 * The running kernel, as far as the spike can see it from the extension host.
 *
 * The CLI prints one URL per boot ("http://127.0.0.1:5439/?token=…") and writes it to ready-url*.txt.
 * A bare request without a cookie jar answers 401 by design (the token only becomes a session through
 * one navigation), so a listening server counts as alive on BOTH 200 and 401 — the spike never treats
 * 401 as "broken", which is the trap the repo notes record.
 */

/** A host the CLI has announced. */
export interface GbhHost {
  /** Origin without query: http://127.0.0.1:5439 */
  readonly baseUrl: string;
  /** The token printed in the ready URL. */
  readonly token: string;
  /** Full URL the browser would open. */
  readonly url: string;
}

/** What a liveness probe learned. */
export interface GbhHostProbe {
  readonly alive: boolean;
  readonly status?: number;
  readonly reason?: string;
}

/**
 * Parse the URL the CLI prints.
 * @param text - contents of ready-url.txt.
 * @returns the host, or undefined when the text is not an http(s) URL.
 */
export function parseReadyUrl(text: string): GbhHost | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return { baseUrl: parsed.origin, token: parsed.searchParams.get("token") ?? "", url: parsed.toString() };
}

/**
 * Probe whether something answers at the host origin.
 * @param host - parsed ready URL.
 * @param fetchImpl - injectable for tests.
 * @returns alive on 200/401 (server listening), dead on network error or other 5xx-only origin.
 */
export async function probeHost(host: GbhHost, fetchImpl: typeof fetch = fetch): Promise<GbhHostProbe> {
  try {
    const response = await fetchImpl(host.baseUrl, { method: "GET", redirect: "manual" });
    const status = response.status;
    // 401 is the documented answer to a bare request: the server is up, the cookie is not set yet.
    if (status === 200 || status === 401 || status === 302 || status === 307) return { alive: true, status };
    return { alive: false, status, reason: "HTTP " + String(status) };
  } catch (error) {
    return { alive: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
