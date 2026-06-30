import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchJellyfin, getJellyfinStreamUrl, getJellyfinAlbumTracks, getJellyfinArtistAlbums, getJellyfinHomeSections, getJellyfinPlaylistTracks, browseJellyfinAlbums, browseJellyfinArtists, browseJellyfinTracks, discoverJellyfin, getJellyfinGenres } from '../services/jellyfin.js';
import { okResponse, errorResponse } from '../types/media.js';

const NOT_CONFIGURED = errorResponse(503, 'Jellyfin ist nicht konfiguriert (JELLYFIN_BASE_URL / JELLYFIN_API_TOKEN fehlen)');

const jellyfin: FastifyPluginAsync = async (app) => {
  app.get('/jellyfin/search', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeMap: Record<string, string> = {
        track: 'Audio', tracks: 'Audio', audio: 'Audio',
        album: 'MusicAlbum', albums: 'MusicAlbum',
        artist: 'MusicArtist', artists: 'MusicArtist',
      };
      const typeList = types
        ? types.split(',').map(t => typeMap[t.toLowerCase()]).filter(Boolean)
        : ['Audio', 'MusicAlbum', 'MusicArtist'];
      const result = await searchJellyfin(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'jellyfin');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/jellyfin/albums/:id/tracks', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getJellyfinAlbumTracks(id, parseInt(offset), parseInt(limit)), 'jellyfin'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/artists/:id/albums', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getJellyfinArtistAlbums(id, parseInt(offset), parseInt(limit)), 'jellyfin'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/home', async (_req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getJellyfinHomeSections() }, 'jellyfin'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/playlists/:id/tracks', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getJellyfinPlaylistTracks(id, parseInt(offset), parseInt(limit)), 'jellyfin'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/browse', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseJellyfinArtists(off, lim)
                   : type === 'tracks'  ? await browseJellyfinTracks(off, lim)
                   : await browseJellyfinAlbums(off, lim);
      return okResponse(result, 'jellyfin');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/genres', async (_req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return rep.send({ success: true, data: await getJellyfinGenres() }); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/discover', async (req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'random', fromYear, toYear, genre, limit = '20' } = req.query as Record<string, string>;
    try {
      const result = await discoverJellyfin(type, {
        limit: parseInt(limit),
        fromYear: fromYear ? parseInt(fromYear) : undefined,
        toYear:   toYear   ? parseInt(toYear)   : undefined,
        genre,
      });
      return okResponse(result, 'jellyfin');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/jellyfin/stream/:id', (_req, rep) => {
    if (!config.jellyfin.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = _req.params as { id: string };
    try {
      return rep.redirect(getJellyfinStreamUrl(id));
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });
};

export default jellyfin;
