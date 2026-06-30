import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { initSpotifyAuth }         from './auth/spotify.js';
import { initTidalAuth }            from './auth/tidal.js';
import { initTidalStreamingAuth }   from './auth/tidalStreaming.js';

const app = Fastify({
  logger: { level: 'warn' },   // pino nur für Warnungen/Fehler
  disableRequestLogging: true,  // eigene Hooks übernehmen Request-Logging
});

// ---- Request / Response Logging ----

app.addHook('onRequest', async (req) => {
  (req as unknown as Record<string, unknown>)['_t0'] = Date.now();
  const ts = new Date().toLocaleTimeString('de-DE', { hour12: false });
  console.log(`${ts} → ${req.method} ${req.url}`);
});

app.addHook('onSend', async (req, rep, payload) => {
  const t0 = ((req as unknown as Record<string, unknown>)['_t0'] as number | undefined) ?? Date.now();
  const ms = Date.now() - t0;
  const ts = new Date().toLocaleTimeString('de-DE', { hour12: false });
  console.log(`${ts} ← ${rep.statusCode} ${req.method} ${req.url} (${ms}ms)`);
  return payload;
});

await app.register(cors, { origin: true });
await app.register(formbody);

await registerRoutes(app);

// Globaler Fehlerhandler
app.setErrorHandler((err, _req, rep) => {
  app.log.error(err);
  rep.code(500).send({ success: false, data: null, error: { code: 500, message: err.message } });
});

await initSpotifyAuth();
await initTidalAuth();
await initTidalStreamingAuth();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[MediaServer] Listening on port ${config.port}`);
  console.log('[MediaServer] Enabled services:', {
    spotify:  config.spotify.enabled,
    tidal:    config.tidal.enabled,
    plex:     config.plex.enabled,
    jellyfin: config.jellyfin.enabled,
    subsonic: config.subsonic.enabled,
  });
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
