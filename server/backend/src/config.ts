import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function loadOverrides(): Record<string, Record<string, string>> {
  try { return JSON.parse(readFileSync(join(process.cwd(), 'data', 'services-config.json'), 'utf-8')); }
  catch { return {}; }
}

const ov = loadOverrides();

function oe(service: string, key: string, fallback: string): string {
  return (ov[service] as Record<string, string> | undefined)?.[key] || fallback;
}

export const config = {
  port:   parseInt(env('PORT', '3000'), 10) || 3000,
  apiKey: env('API_KEY'),

  spotify: {
    clientId:     oe('spotify', 'clientId',    env('SPOTIFY_CLIENT_ID')),
    refreshToken: env('SPOTIFY_REFRESH_TOKEN'),
    market:       oe('spotify', 'market',      env('SPOTIFY_MARKET', 'DE')),
    redirectUri:  oe('spotify', 'redirectUri', env('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:3000/auth/spotify/callback')),
    enabled:      !!oe('spotify', 'clientId', env('SPOTIFY_CLIENT_ID')),
  },

  tidal: {
    clientId:     oe('tidal', 'clientId',    env('TIDAL_CLIENT_ID')),
    refreshToken: env('TIDAL_REFRESH_TOKEN'),
    countryCode:  oe('tidal', 'countryCode', env('TIDAL_COUNTRY_CODE', 'DE')),
    redirectUri:  oe('tidal', 'redirectUri', env('TIDAL_REDIRECT_URI', 'http://127.0.0.1:3000/auth/tidal/callback')),
    enabled:      !!oe('tidal', 'clientId', env('TIDAL_CLIENT_ID')),
  },

  plex: (() => {
    const baseUrl = oe('plex', 'baseUrl', env('PLEX_BASE_URL'));
    const token   = oe('plex', 'token',   env('PLEX_TOKEN'));
    return { baseUrl, token, enabled: !!baseUrl && !!token };
  })(),

  jellyfin: (() => {
    const baseUrl  = oe('jellyfin', 'baseUrl',  env('JELLYFIN_BASE_URL'));
    const apiToken = oe('jellyfin', 'apiToken', env('JELLYFIN_API_TOKEN'));
    const userId   = oe('jellyfin', 'userId',   env('JELLYFIN_USER_ID'));
    return { baseUrl, apiToken, userId, enabled: !!baseUrl && !!apiToken };
  })(),

  subsonic: (() => {
    const baseUrl       = oe('subsonic', 'baseUrl',       env('SUBSONIC_BASE_URL'));
    const username      = oe('subsonic', 'username',      env('SUBSONIC_USERNAME'));
    const password      = oe('subsonic', 'password',      env('SUBSONIC_PASSWORD'));
    const clientName    = oe('subsonic', 'clientName',    env('SUBSONIC_CLIENT_NAME', 'MediaServer'));
    const apiVersion    = oe('subsonic', 'apiVersion',    env('SUBSONIC_API_VERSION', '1.16.1'));
    const musicFolderId = oe('subsonic', 'musicFolderId', env('SUBSONIC_MUSIC_FOLDER_ID', '')) || undefined;
    return { baseUrl, username, password, clientName, apiVersion, musicFolderId, enabled: !!baseUrl && !!username };
  })(),

  navidrome: (() => {
    const baseUrl       = oe('navidrome', 'baseUrl',       env('NAVIDROME_BASE_URL'));
    const username      = oe('navidrome', 'username',      env('NAVIDROME_USERNAME'));
    const password      = oe('navidrome', 'password',      env('NAVIDROME_PASSWORD'));
    const clientName    = oe('navidrome', 'clientName',    env('NAVIDROME_CLIENT_NAME', 'MediaServer'));
    const apiVersion    = oe('navidrome', 'apiVersion',    env('NAVIDROME_API_VERSION', '1.16.1'));
    const musicFolderId = oe('navidrome', 'musicFolderId', env('NAVIDROME_MUSIC_FOLDER_ID', '')) || undefined;
    return { baseUrl, username, password, clientName, apiVersion, musicFolderId, enabled: !!baseUrl && !!username };
  })(),

  madsonic: (() => {
    const baseUrl       = oe('madsonic', 'baseUrl',       env('MADSONIC_BASE_URL'));
    const username      = oe('madsonic', 'username',      env('MADSONIC_USERNAME'));
    const password      = oe('madsonic', 'password',      env('MADSONIC_PASSWORD'));
    const clientName    = oe('madsonic', 'clientName',    env('MADSONIC_CLIENT_NAME', 'MediaServer'));
    const apiVersion    = oe('madsonic', 'apiVersion',    env('MADSONIC_API_VERSION', '1.16.1'));
    const musicFolderId = oe('madsonic', 'musicFolderId', env('MADSONIC_MUSIC_FOLDER_ID', '')) || undefined;
    return { baseUrl, username, password, clientName, apiVersion, musicFolderId, enabled: !!baseUrl && !!username };
  })(),

  airsonic: (() => {
    const baseUrl       = oe('airsonic', 'baseUrl',       env('AIRSONIC_BASE_URL'));
    const username      = oe('airsonic', 'username',      env('AIRSONIC_USERNAME'));
    const password      = oe('airsonic', 'password',      env('AIRSONIC_PASSWORD'));
    const clientName    = oe('airsonic', 'clientName',    env('AIRSONIC_CLIENT_NAME', 'MediaServer'));
    const apiVersion    = oe('airsonic', 'apiVersion',    env('AIRSONIC_API_VERSION', '1.15.0'));
    const musicFolderId = oe('airsonic', 'musicFolderId', env('AIRSONIC_MUSIC_FOLDER_ID', '')) || undefined;
    return { baseUrl, username, password, clientName, apiVersion, musicFolderId, enabled: !!baseUrl && !!username };
  })(),

  lastfm: (() => {
    const apiKey = oe('lastfm', 'apiKey', env('LASTFM_API_KEY'));
    return { apiKey, enabled: !!apiKey };
  })(),
};
