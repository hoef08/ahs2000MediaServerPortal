import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { searchSpotify, getSpotifyTrack, getSpotifyAlbum, getSpotifyArtist, getSpotifyAlbumTracks, getSpotifyArtistAlbums, getSpotifyHomeSections, getSpotifyPlaylistTracks, browseSpotifyAlbums, browseSpotifyArtists, browseSpotifyTracks } from '../services/spotify.js';
import { getSpotifyToken } from '../auth/spotify.js';
import { logFetch } from '../utils/logFetch.js';
import { okResponse, errorResponse } from '../types/media.js';

const NOT_CONFIGURED = errorResponse(503, 'Spotify ist nicht konfiguriert (SPOTIFY_CLIENT_ID / SPOTIFY_REFRESH_TOKEN fehlen)');

const spotify: FastifyPluginAsync = async (app) => {
  app.get('/spotify/search', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { q, types, offset = '0', limit = '20' } = req.query as Record<string, string>;
    if (!q) return rep.code(400).send(errorResponse(400, 'Missing query parameter "q"'));
    try {
      const typeList = types ? types.split(',') : ['track', 'album', 'artist', 'playlist'];
      const result   = await searchSpotify(q, typeList, parseInt(offset), parseInt(limit));
      return okResponse(result, 'spotify');
    } catch (e) {
      return rep.code(502).send(errorResponse(502, (e as Error).message));
    }
  });

  app.get('/spotify/tracks/:id', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSpotifyTrack(id), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/albums/:id', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSpotifyAlbum(id), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/artists/:id', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    try { return okResponse(await getSpotifyArtist(id), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/albums/:id/tracks', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getSpotifyAlbumTracks(id, parseInt(offset), parseInt(limit)), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/artists/:id/albums', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getSpotifyArtistAlbums(id, parseInt(offset), parseInt(limit)), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/home', async (_req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try { return okResponse({ sections: await getSpotifyHomeSections() }, 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/playlists/:id/tracks', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { id } = req.params as { id: string };
    const { offset = '0', limit = '50' } = req.query as Record<string, string>;
    try { return okResponse(await getSpotifyPlaylistTracks(id, parseInt(offset), parseInt(limit)), 'spotify'); }
    catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  app.get('/spotify/browse', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    const { type = 'albums', offset = '0', limit = '50' } = req.query as Record<string, string>;
    try {
      const off = parseInt(offset), lim = parseInt(limit);
      const result = type === 'artists' ? await browseSpotifyArtists(off, lim)
                   : type === 'tracks'  ? await browseSpotifyTracks(off, lim)
                   : await browseSpotifyAlbums(off, lim);
      return okResponse(result, 'spotify');
    } catch (e) { return rep.code(502).send(errorResponse(502, (e as Error).message)); }
  });

  // ---- Spotify Connect / Web Playback SDK ----

  app.put('/spotify/player/play', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try {
      const token = await getSpotifyToken();
      console.log('[Spotify Play] Body received:', JSON.stringify(req.body));
      const resp  = await logFetch('https://api.spotify.com/v1/me/player/play', {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(req.body),
      });
      if (resp.status === 204) return rep.code(204).send();
      const errBody = await resp.json();
      console.log('[Spotify Play] Error response:', JSON.stringify(errBody));
      return rep.code(resp.status).send(errBody);
    } catch (e) {
      return rep.code(401).send(errorResponse(401, (e as Error).message));
    }
  });

  // Playback zu einem bestimmten Device transferieren (activates it for Connect API)
  app.put('/spotify/player/transfer', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try {
      const token = await getSpotifyToken();
      const resp  = await logFetch('https://api.spotify.com/v1/me/player', {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(req.body),
      });
      return rep.code(resp.status < 300 ? 204 : resp.status).send();
    } catch (e) {
      return rep.code(401).send(errorResponse(401, (e as Error).message));
    }
  });

  app.put('/spotify/player/pause', async (_req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try {
      const token = await getSpotifyToken();
      const resp  = await logFetch('https://api.spotify.com/v1/me/player/pause', {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      return rep.code(resp.status < 300 ? 204 : resp.status).send();
    } catch (e) {
      return rep.code(401).send(errorResponse(401, (e as Error).message));
    }
  });

  app.put('/spotify/player/seek', async (req, rep) => {
    if (!config.spotify.enabled) return rep.code(503).send(NOT_CONFIGURED);
    try {
      const token = await getSpotifyToken();
      const { position_ms } = req.body as { position_ms: number };
      const resp  = await logFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}`, {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      return rep.code(resp.status < 300 ? 204 : resp.status).send();
    } catch (e) {
      return rep.code(401).send(errorResponse(401, (e as Error).message));
    }
  });
};

export default spotify;
