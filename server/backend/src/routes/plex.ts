import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchPlex, getPlexStreamUrl, getPlexAlbumTracks, getPlexArtistAlbums, getPlexHomeSections, getPlexPlaylistTracks, browsePlexAlbums, browsePlexArtists, browsePlexTracks } from '../services/plex.js';
import { logFetch } from '../utils/logFetch.js';
import { okResponse, errorResponse } from '../types/media.js';

const NOT_CONFIGURED = errorResponse(503, 'Plex ist nicht konfiguriert (PLEX_BASE_URL / PLEX_TOKEN fehlen)');

const plex: FastifyPluginAsync = async (app) => {
  app.get('/plex/search', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['track', 'album', 'artist'];
      const result   = await searchPlex(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'plex');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/plex/albums/:id/tracks', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getPlexAlbumTracks(id), 'plex'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/plex/artists/:id/albums', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getPlexArtistAlbums(id), 'plex'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/plex/home', async (_req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getPlexHomeSections() }, 'plex'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/plex/playlists/:id/tracks', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getPlexPlaylistTracks(id), 'plex'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/plex/browse', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browsePlexArtists(off, lim)
                   : type === 'tracks'  ? await browsePlexTracks(off, lim)
                   : await browsePlexAlbums(off, lim);
      return okResponse(result, 'plex');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/plex/stream/:id', async (req, rep) => {
    if (!config.plex.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try {
      const streamUrl   = await getPlexStreamUrl(id);
      const rangeHeader = req.headers['range'] as string | undefined;

      // Plex erfordert Client-Identifier + download=1 um Transcoder-Check zu umgehen
      const url = new URL(streamUrl);
      url.searchParams.set('download', '1');
      const fetchUrl = url.toString();
      console.log(`[Plex Stream] URL: ${fetchUrl}`);
      const upstream = await logFetch(fetchUrl, {
        headers: {
          'X-Plex-Client-Identifier': 'media-server-backend',
          'X-Plex-Product':           'Media Server',
          'X-Plex-Platform':          'Web',
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
      });

      if (!upstream.ok && upstream.status !== 206) {
        const body = await upstream.text().catch(() => '');
        console.log(`[Plex Stream] Fehler ${upstream.status}: ${body.slice(0, 200)}`);
        return rep.code(upstream.status).send(
          errorResponse(upstream.status, `Plex Stream: HTTP ${upstream.status}`)
        );
      }

      const ct     = upstream.headers.get('content-type') ?? 'audio/mpeg';
      const cl     = upstream.headers.get('content-length');
      const cr     = upstream.headers.get('content-range');
      console.log(`[Plex Stream] Content-Type: ${ct}, Content-Length: ${cl}`);

      rep.code(upstream.status);
      rep.header('Content-Type',  ct);
      rep.header('Accept-Ranges', 'bytes');
      rep.header('Cache-Control', 'no-store');
      if (cl) rep.header('Content-Length', cl);
      if (cr) rep.header('Content-Range',  cr);

      return rep.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });
};

export default plex;
