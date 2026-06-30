import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchMadsonic, getMadsonicStreamUrl, getMadsonicAlbumTracks, getMadsonicArtistAlbums, getMadsonicHomeSections, getMadsonicPlaylistTracks, browseMadsonicAlbums, browseMadsonicArtists, browseMadsonicTracks, discoverMadsonic, getMadsonicGenres, getMadsonicMusicFolders, buildMadsonicCoverUrl } from '../services/madsonic.js';
import { okResponse, errorResponse } from '../types/media.js';
import { logFetch } from '../utils/logFetch.js';

const NOT_CONFIGURED = errorResponse(503, 'Madsonic ist nicht konfiguriert (MADSONIC_BASE_URL / MADSONIC_USERNAME fehlen)');

const madsonic: FastifyPluginAsync = async (app) => {
  app.get('/madsonic/search', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['song', 'album', 'artist'];
      const result   = await searchMadsonic(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'madsonic');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/madsonic/albums/:id/tracks', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getMadsonicAlbumTracks(id), 'madsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/artists/:id/albums', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getMadsonicArtistAlbums(id), 'madsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/cover/:id', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id }   = req.params as { id: string };
    const { size } = req.query  as Record<string, string>;
    try {
      const url    = buildMadsonicCoverUrl(id, size);
      const resp   = await logFetch(url);
      const ct     = resp.headers.get('content-type') ?? '';
      if (!resp.ok || !ct.startsWith('image/')) return rep.code(404).send();
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length === 0) return rep.code(404).send();
      rep.header('Content-Type', ct);
      rep.header('Cache-Control', 'public, max-age=86400');
      return rep.send(buffer);
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/madsonic/home', async (_req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getMadsonicHomeSections() }, 'madsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/playlists/:id/tracks', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getMadsonicPlaylistTracks(id), 'madsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/browse', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseMadsonicArtists(off, lim)
                   : type === 'tracks'  ? await browseMadsonicTracks(off, lim)
                   : await browseMadsonicAlbums(off, lim);
      return okResponse(result, 'madsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/musicfolders', async (_req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getMadsonicMusicFolders() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/genres', async (_req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getMadsonicGenres() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/discover', async (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'random', fromYear, toYear, genre, limit = '20' } = req.query as Record<string, string>;
    try {
      const result = await discoverMadsonic(type, {
        limit: parseInt(limit),
        fromYear: fromYear ? parseInt(fromYear) : undefined,
        toYear:   toYear   ? parseInt(toYear)   : undefined,
        genre,
      });
      return okResponse(result, 'madsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/madsonic/stream/:id', (req, rep) => {
    if (!config.madsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { format = 'mp3' } = req.query as Record<string, string>;
    try {
      return rep.redirect(getMadsonicStreamUrl(id, format));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });
};

export default madsonic;
