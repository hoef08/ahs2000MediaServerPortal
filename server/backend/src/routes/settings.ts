import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';

const DATA_PATH = join(process.cwd(), 'data', 'services-config.json');

function readOverrides(): Record<string, Record<string, string>> {
  try { return JSON.parse(readFileSync(DATA_PATH, 'utf-8')); }
  catch { return {}; }
}

function writeOverrides(data: Record<string, Record<string, string>>): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function mask(val: string): string { return val ? '***' : ''; }

const settingsRoute: FastifyPluginAsync = async (app) => {
  app.get('/settings/services', async () => {
    return {
      subsonic:  { baseUrl: config.subsonic.baseUrl,  username: config.subsonic.username,  password: mask(config.subsonic.password),  clientName: config.subsonic.clientName,  apiVersion: config.subsonic.apiVersion,  musicFolderId: config.subsonic.musicFolderId  ?? '' },
      navidrome: { baseUrl: config.navidrome.baseUrl, username: config.navidrome.username, password: mask(config.navidrome.password), clientName: config.navidrome.clientName, apiVersion: config.navidrome.apiVersion, musicFolderId: config.navidrome.musicFolderId ?? '' },
      madsonic:  { baseUrl: config.madsonic.baseUrl,  username: config.madsonic.username,  password: mask(config.madsonic.password),  clientName: config.madsonic.clientName,  apiVersion: config.madsonic.apiVersion,  musicFolderId: config.madsonic.musicFolderId  ?? '' },
      airsonic:  { baseUrl: config.airsonic.baseUrl,  username: config.airsonic.username,  password: mask(config.airsonic.password),  clientName: config.airsonic.clientName,  apiVersion: config.airsonic.apiVersion,  musicFolderId: config.airsonic.musicFolderId  ?? '' },
      plex:      { baseUrl: config.plex.baseUrl,      token:    mask(config.plex.token) },
      jellyfin:  { baseUrl: config.jellyfin.baseUrl,  apiToken: mask(config.jellyfin.apiToken), userId: config.jellyfin.userId },
      spotify:   { clientId: config.spotify.clientId, redirectUri: config.spotify.redirectUri, market: config.spotify.market },
      tidal:     { clientId: config.tidal.clientId,   redirectUri: config.tidal.redirectUri,   countryCode: config.tidal.countryCode },
      lastfm:    { apiKey: mask(config.lastfm.apiKey) },
    };
  });

  app.post('/settings/services', async (req, rep) => {
    const body = req.body as Record<string, Record<string, string>>;
    if (!body || typeof body !== 'object') return rep.code(400).send({ success: false, message: 'Ungültige Daten' });

    const existing = readOverrides();
    for (const [svc, fields] of Object.entries(body)) {
      if (!fields || typeof fields !== 'object') continue;
      if (!existing[svc]) existing[svc] = {};
      for (const [key, val] of Object.entries(fields)) {
        if (val !== '***') existing[svc][key] = val;
      }
    }
    writeOverrides(existing);
    return { success: true, message: 'Gespeichert. Backend neu starten damit Änderungen aktiv werden.' };
  });
};

export default settingsRoute;
