import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchSubsonic, getSubsonicStreamUrl, getSubsonicAlbumTracks, getSubsonicArtistAlbums, getSubsonicCoverArtDirectUrl, getSubsonicArtistImageDirectUrl, getSubsonicHomeSections, getSubsonicPlaylistTracks, browseSubsonicAlbums, browseSubsonicArtists, browseSubsonicTracks, discoverSubsonic, getSubsonicGenres, getSubsonicMusicFolders } from '../services/subsonic.js';
import { okResponse, errorResponse } from '../types/media.js';
import { logFetch } from '../utils/logFetch.js';

const NOT_CONFIGURED = errorResponse(503, 'Subsonic ist nicht konfiguriert (SUBSONIC_BASE_URL / SUBSONIC_USERNAME fehlen)');

const subsonic: FastifyPluginAsync = async (app) => {
  app.get('/subsonic/search', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['song', 'album', 'artist'];
      const result   = await searchSubsonic(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'subsonic');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/subsonic/albums/:id/tracks', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSubsonicAlbumTracks(id), 'subsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/artists/:id/albums', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSubsonicArtistAlbums(id), 'subsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/cover/:id', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try {
      const url  = getSubsonicCoverArtDirectUrl(id);
      const resp = await logFetch(url);
      if (!resp.ok) return rep.code(resp.status).send();
      rep.header('Content-Type', resp.headers.get('content-type') ?? 'image/jpeg');
      rep.header('Cache-Control', 'public, max-age=86400');
      return rep.send(Buffer.from(await resp.arrayBuffer()));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/subsonic/artist-image/:id', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try {
      const url  = getSubsonicArtistImageDirectUrl(id);
      const resp = await logFetch(url);
      const ct   = resp.headers.get('content-type') ?? '';
      if (!resp.ok || !ct.startsWith('image/')) return rep.code(404).send();
      rep.header('Content-Type', ct);
      rep.header('Cache-Control', 'public, max-age=86400');
      return rep.send(Buffer.from(await resp.arrayBuffer()));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/subsonic/home', async (_req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getSubsonicHomeSections() }, 'subsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/playlists/:id/tracks', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSubsonicPlaylistTracks(id), 'subsonic'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/browse', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseSubsonicArtists(off, lim)
                   : type === 'tracks'  ? await browseSubsonicTracks(off, lim)
                   : await browseSubsonicAlbums(off, lim);
      return okResponse(result, 'subsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/musicfolders', async (_req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getSubsonicMusicFolders() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/genres', async (_req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getSubsonicGenres() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/discover', async (req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'random', fromYear, toYear, genre, limit = '20' } = req.query as Record<string, string>;
    try {
      const result = await discoverSubsonic(type, {
        limit: parseInt(limit),
        fromYear: fromYear ? parseInt(fromYear) : undefined,
        toYear:   toYear   ? parseInt(toYear)   : undefined,
        genre,
      });
      return okResponse(result, 'subsonic');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/subsonic/stream/:id',(_req, rep) => {
    if (!config.subsonic.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = _req.params as { id: string };
    const { format = 'mp3' } = _req.query as Record<string, string>;
    try {
      return rep.redirect(getSubsonicStreamUrl(id, format));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });
};

export default subsonic;
