import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { getLastFmArtistData } from '../services/lastfm.js';

const lastfmRoute: FastifyPluginAsync = async (app) => {
  app.get('/lastfm/artist', async (req, rep) => {
    if (!config.lastfm.apiKey) {
      return rep.code(503).send({ success: false, data: null, error: { code: 503, message: 'Last.fm API-Key nicht konfiguriert' } });
    }
    const { name } = req.query as { name?: string };
    if (!name?.trim()) {
      return rep.code(400).send({ success: false, data: null, error: { code: 400, message: 'Parameter "name" fehlt' } });
    }
    try {
      const data = await getLastFmArtistData(name.trim());
      return { success: true, data, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return rep.code(500).send({ success: false, data: null, error: { code: 500, message: msg } });
    }
  });
};

export default lastfmRoute;
