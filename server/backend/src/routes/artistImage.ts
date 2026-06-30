import type { FastifyPluginAsync } from 'fastify';
import { getDeezerArtistImageUrl } from '../services/deezer.js';
import { logFetch } from '../utils/logFetch.js';

const artistImage: FastifyPluginAsync = async (app) => {
  app.get('/artist-image', async (req, rep) => {
    const { name } = req.query as { name?: string };
    if (!name?.trim()) return rep.code(400).send();

    const url = await getDeezerArtistImageUrl(name.trim());
    if (!url) return rep.code(404).send();

    try {
      const resp = await logFetch(url);
      if (!resp.ok) return rep.code(404).send();
      rep.header('Content-Type', resp.headers.get('content-type') ?? 'image/jpeg');
      rep.header('Cache-Control', 'public, max-age=86400');
      return rep.send(Buffer.from(await resp.arrayBuffer()));
    } catch {
      return rep.code(502).send();
    }
  });
};

export default artistImage;
