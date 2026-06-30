// Query-Parameter die in Log-Ausgaben maskiert werden sollen
//const MASKED_PARAMS = new Set(['t', 's', 'X-Plex-Token', 'token', 'access_token', 'api_key', 'password']);
const MASKED_PARAMS = new Set([]);

function maskUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const p of MASKED_PARAMS) {
      if (u.searchParams.has(p)) u.searchParams.set(p, '***');
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function ts(): string {
  return new Date().toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function logFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const masked = maskUrl(url);
  const t0     = Date.now();
  console.log(`  ${ts()} ↑ ${method} ${masked}`);
  try {
    const resp = await fetch(url, init);
    const ms   = Date.now() - t0;
    const ok   = resp.ok ? '' : ' ✗';
    console.log(`  ${ts()} ↓ ${resp.status} ${resp.statusText}${ok} (${ms}ms)`);
    return resp;
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`  ${ts()} ↓ FEHLER (${ms}ms): ${(e as Error).message}`);
    throw e;
  }
}
