import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { searchTidal, getTidalAlbumTracks, getTidalArtistAlbums, getTidalHomeSections, getTidalPlaylistTracks, browseTidalTracks, browseTidalAlbums, browseTidalArtists } from '../services/tidal.js';
import { getTidalToken } from '../auth/tidal.js';
import { getTidalStreamingToken } from '../auth/tidalStreaming.js';
import { logFetch } from '../utils/logFetch.js';
import { okResponse, errorResponse } from '../types/media.js';

const NOT_CONFIGURED = errorResponse(503, 'Tidal ist nicht konfiguriert (TIDAL_CLIENT_ID / TIDAL_REFRESH_TOKEN fehlen)');

// Stream-Cache: verhindert wiederholte Tidal-API-Aufrufe bei Range-Requests
interface CachedStream { data: Buffer; mimeType: string; expiresAt: number; }
const streamCache = new Map<string, CachedStream>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

function getCached(id: string): CachedStream | null {
  const entry = streamCache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { streamCache.delete(id); return null; }
  return entry;
}
function setCache(id: string, data: Buffer, mimeType: string): void {
  // Alte Einträge bereinigen um Speicher zu sparen
  for (const [k, v] of streamCache) { if (Date.now() > v.expiresAt) streamCache.delete(k); }
  streamCache.set(id, { data, mimeType, expiresAt: Date.now() + CACHE_TTL_MS });
}

const tidal: FastifyPluginAsync = async (app) => {
  app.get('/tidal/search', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['tracks', 'albums', 'artists', 'playlists'];
      const result   = await searchTidal(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'tidal');
    } catch (e) {
      app.log.error(e, 'Tidal search failed');
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });
  app.get('/tidal/albums/:id/tracks', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getTidalAlbumTracks(id, parseInt(offset), parseInt(limit)), 'tidal'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/tidal/artists/:id/albums', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getTidalArtistAlbums(id, parseInt(offset), parseInt(limit)), 'tidal'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/tidal/browse', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseTidalArtists(off, lim)
                   : type === 'tracks'  ? await browseTidalTracks(off, lim)
                   : await browseTidalAlbums(off, lim);
      return okResponse(result, 'tidal');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/tidal/home', async (_req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getTidalHomeSections() }, 'tidal'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/tidal/playlists/:id/tracks', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getTidalPlaylistTracks(id, parseInt(offset), parseInt(limit)), 'tidal'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  // ---- Stream ----

  app.get('/tidal/stream/:id', async (req, rep) => {
    if (!config.tidal.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const streamingToken = await getTidalStreamingToken();
    const token = streamingToken ?? await getTidalToken();
    if (!token) return rep.code(401).send(errorResponse(401, 'Nicht bei Tidal eingeloggt'));
    if (!streamingToken) console.log('[Tidal Stream] Kein Streaming-Token → nur Preview. /auth/tidal/stream/login aufrufen.');
    const { id } = req.params as { id: string };

    // Cache-Treffer: Range-Requests und Wiederholungen ohne erneuten Tidal-API-Aufruf bedienen
    const cached = getCached(id);
    if (cached) {
      return serveBuffer(cached.data, cached.mimeType, req, rep);
    }

    interface PlaybackInfo {
      url?: string; urls?: string[];
      manifest?: string; manifestMimeType?: string;
    }

    for (const quality of ['LOSSLESS', 'HIGH']) {
      try {
        const apiUrl = `https://api.tidal.com/v1/tracks/${id}/playbackinfopostpaywall` +
          `?countryCode=${config.tidal.countryCode}&audioquality=${quality}&playbackmode=STREAM&assetpresentation=FULL`;
        const resp = await logFetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });

        if (!resp.ok) {
          console.log(`[Tidal Stream] API ${resp.status} (${quality})`);
          continue;
        }

        let data: PlaybackInfo;
        try { data = JSON.parse(await resp.text()) as PlaybackInfo; } catch { continue; }

        // --- Fall 1: direkte URL im Response ---
        const directUrl = data.url ?? data.urls?.[0];
        if (directUrl) {
          console.log(`[Tidal Stream] Direkte URL (${quality})`);
          return await proxyUrl(directUrl, rep);
        }

        if (!data.manifest) continue;
        const mimeType = data.manifestMimeType ?? '';
        const decoded  = Buffer.from(data.manifest, 'base64').toString('utf-8');

        // --- Fall 2: BTS-Manifest (JSON mit urls[]) ---
        if (mimeType.includes('bts') || mimeType.includes('json')) {
          const bts = JSON.parse(decoded) as { urls?: string[] };
          const url = bts.urls?.[0];
          if (url) {
            console.log(`[Tidal Stream] BTS (${quality})`);
            return await proxyUrl(url, rep);
          }
          continue;
        }

        // --- Fall 3: MPEG-DASH mit SegmentTemplate ---
        if (mimeType.includes('dash') || mimeType.includes('xml')) {
          const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'");

          const initMatch   = decoded.match(/initialization="([^"]+)"/);
          const mediaMatch  = decoded.match(/\bmedia="([^"]+)"/);
          const startMatch  = decoded.match(/startNumber="(\d+)"/);
          const mimeMatch   = decoded.match(/mimeType="([^"]+)"/);

          if (!initMatch || !mediaMatch) {
            console.log(`[Tidal Stream] DASH ohne SegmentTemplate (${quality})`);
            continue;
          }

          const initUrl    = dec(initMatch[1]);
          const mediaTpl   = dec(mediaMatch[1]);
          const startNum   = parseInt(startMatch?.[1] ?? '1');
          const segMime    = mimeMatch?.[1] ?? 'audio/mp4';

          // Segmentanzahl aus SegmentTimeline
          let segCount = 0;
          for (const m of decoded.matchAll(/<S\b[^/]*/g)) {
            const r = parseInt(m[0].match(/\br="(\d+)"/)?.[1] ?? '0');
            segCount += r + 1;
          }

          if (segCount === 0) { console.log(`[Tidal Stream] DASH: keine Segmente (${quality})`); continue; }

          const segUrls = Array.from({ length: segCount }, (_, i) =>
            mediaTpl.replace('$Number$', String(startNum + i)));

          console.log(`[Tidal Stream] DASH (${quality}): ${segCount} Segmente, ${segMime}`);

          // Init + alle Segmente parallel laden
          const allBuffers = await Promise.all(
            [initUrl, ...segUrls].map(u => logFetch(u).then(r => r.arrayBuffer()))
          );
          const combined = Buffer.concat(allBuffers.map(b => Buffer.from(b)));

          console.log(`[Tidal Stream] DASH gesamt: ${(combined.byteLength / 1024 / 1024).toFixed(1)} MB`);
          setCache(id, combined, segMime);
          return serveBuffer(combined, segMime, req, rep);
        }
      } catch (e) {
        console.log(`[Tidal Stream] Fehler (${quality}):`, (e as Error).message);
      }
    }

    console.log(`[Tidal Stream] Keine Stream-URL gefunden`);
    return rep.code(404).send(errorResponse(404, 'Keine Stream-URL von Tidal'));
  });

  function serveBuffer(data: Buffer, mimeType: string, req: import('fastify').FastifyRequest, rep: FastifyReply) {
    const total = data.byteLength;
    const rangeHeader = (req.headers as Record<string, string | undefined>)['range'];

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = m[1] ? parseInt(m[1]) : 0;
        const end   = m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1;
        const chunk = data.subarray(start, end + 1);
        rep.code(206);
        rep.header('Content-Range',  `bytes ${start}-${end}/${total}`);
        rep.header('Content-Length', String(chunk.byteLength));
        rep.header('Content-Type',   mimeType);
        rep.header('Accept-Ranges',  'bytes');
        return rep.send(chunk);
      }
    }

    rep.header('Content-Type',   mimeType);
    rep.header('Content-Length', String(total));
    rep.header('Accept-Ranges',  'bytes');
    rep.header('Cache-Control',  'no-store');
    return rep.send(data);
  }

  async function proxyUrl(url: string, rep: FastifyReply) {
    const upstream = await logFetch(url);
    if (!upstream.ok) throw new Error(`CDN HTTP ${upstream.status}`);
    const ct = upstream.headers.get('content-type') ?? 'audio/mpeg';
    const cl = upstream.headers.get('content-length');
    rep.header('Content-Type',  ct);
    rep.header('Accept-Ranges', 'bytes');
    rep.header('Cache-Control', 'no-store');
    if (cl) rep.header('Content-Length', cl);
    return rep.send(Buffer.from(await upstream.arrayBuffer()));
  }
};

export default tidal;
