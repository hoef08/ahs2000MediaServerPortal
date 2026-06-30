import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

const health: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, _rep) => {
    return {
      status:   'ok',
      services: {
        spotify:   config.spotify.enabled,
        tidal:     config.tidal.enabled,
        plex:      config.plex.enabled,
        jellyfin:  config.jellyfin.enabled,
        subsonic:  config.subsonic.enabled,
        navidrome: config.navidrome.enabled,
        madsonic:  config.madsonic.enabled,
        airsonic:  config.airsonic.enabled,
      },
    };
  });
};

export default health;
