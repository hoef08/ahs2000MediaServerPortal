import type { FastifyInstance } from 'fastify';
import health    from './health.js';
import auth      from './auth.js';
import spotify   from './spotify.js';
import tidal     from './tidal.js';
import plex      from './plex.js';
import jellyfin  from './jellyfin.js';
import subsonic  from './subsonic.js';
import navidrome from './navidrome.js';
import madsonic  from './madsonic.js';
import airsonic  from './airsonic.js';
import settings     from './settings.js';
import artistImage  from './artistImage.js';
import lastfm       from './lastfm.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(health);
  await app.register(auth);
  await app.register(spotify);
  await app.register(tidal);
  await app.register(plex);
  await app.register(jellyfin);
  await app.register(subsonic);
  await app.register(navidrome);
  await app.register(madsonic);
  await app.register(airsonic);
  await app.register(settings);
  await app.register(artistImage);
  await app.register(lastfm);
}
