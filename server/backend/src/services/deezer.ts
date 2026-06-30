import { logFetch } from '../utils/logFetch.js';

interface DeezerArtist {
  id: number;
  name: string;
  picture_medium: string;
  picture_big: string;
}
interface DeezerSearchResponse { data?: DeezerArtist[] }

const cache = new Map<string, { url: string | null; ts: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getDeezerArtistImageUrl(name: string): Promise<string | null> {
  const key = name.toLowerCase().trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.url;

  try {
    const resp = await logFetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`,
    );
    if (!resp.ok) { cache.set(key, { url: null, ts: Date.now() }); return null; }
    const data = await resp.json() as DeezerSearchResponse;
    const url  = data.data?.[0]?.picture_medium ?? null;
    cache.set(key, { url, ts: Date.now() });
    return url;
  } catch {
    cache.set(key, { url: null, ts: Date.now() });
    return null;
  }
}
