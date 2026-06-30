import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchAirsonic, getAirsonicStreamUrl, getAirsonicAlbumTracks, getAirsonicArtistAlbums, getAirsonicCoverArtDirectUrl, getAirsonicHomeSections, getAirsonicPlaylistTracks, browseAirsonicAlbums, browseAirsonicArtists, browseAirsonicTracks, discoverAirsonic, getAirsonicGenres, getAirsonicMusicFolders } from '../services/airsonic.js';
import { okResponse, errorResponse } from '../types/media.js';
import { logFetch } from '../utils/logFetch.js';

const NOT_CONFIGURED = errorResponse(503, 'Airsonic ist nicht konfiguriert (AIRSONIC_BASE_URL / AIRSONIC_USERNAME fehlen)');

const airsonic: FastifyPluginAsync = async (app) => {
  app.get('/airsonic/search', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['song', 'album', 'artist'];
      return okResponse(await searchAirsonic(q, typeList, parseInt(offset), parseInt(limit)), 'airsonic');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/airsonic/albums/:id/tracks', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getAirsonicAlbumTracks(id), 'airsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/artists/:id/albums', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getAirsonicArtistAlbums(id), 'airsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/cover/:id', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try {
      const url  = getAirsonicCoverArtDirectUrl(id);
      const resp = await logFetch(url);
      if (!resp.ok) return rep.code(resp.status).send();
      rep.header('Content-Type', resp.headers.get('content-type') ?? 'image/jpeg');
      rep.header('Cache-Control', 'public, max-age=86400');
      return rep.send(Buffer.from(await resp.arrayBuffer()));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/airsonic/home', async (_req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getAirsonicHomeSections() }, 'airsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/playlists/:id/tracks', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getAirsonicPlaylistTracks(id), 'airsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/browse', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseAirsonicArtists(off, lim)
                   : type === 'tracks'  ? await browseAirsonicTracks(off, lim)
                   : await browseAirsonicAlbums(off, lim);
      return okResponse(result, 'airsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/musicfolders', async (_req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getAirsonicMusicFolders() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/genres', async (_req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getAirsonicGenres() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/discover', async (req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'random', fromYear, toYear, genre, limit = '20' } = req.query as Record<string, string>;
    try {
      const result = await discoverAirsonic(type, {
        limit: parseInt(limit),
        fromYear: fromYear ? parseInt(fromYear) : undefined,
        toYear:   toYear   ? parseInt(toYear)   : undefined,
        genre,
      });
      return okResponse(result, 'airsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/airsonic/stream/:id', (_req, rep) => {
    if (!config.airsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = _req.params as { id: string };
    const { format = 'mp3' } = _req.query as Record<string, string>;
    try { return rep.redirect(getAirsonicStreamUrl(id, format)); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });
};

export default airsonic;
