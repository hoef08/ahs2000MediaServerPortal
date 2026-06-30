import type { FastifyPluginAsync } from 'fastify';
import { startSpotifyLogin, handleSpotifyCallback, hasSpotifyToken, getSpotifyToken } from '../auth/spotify.js';
import { startTidalLogin, handleTidalCallback, hasTidalToken } from '../auth/tidal.js';
import { startStreamingLogin, handleStreamingCallback, hasStreamingToken } from '../auth/tidalStreaming.js';

const authRoutes: FastifyPluginAsync = async (app) => {

  // Öffne diesen Link im Browser um Spotify zu autorisieren
  app.get('/auth/spotify/login', (_req, rep) => {
    try {
      return rep.redirect(startSpotifyLogin());
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Login konnte nicht gestartet werden', (e as Error).message));
    }
  });

  // Spotify leitet nach dem Login hierher weiter
  app.get('/auth/spotify/callback', async (req, rep) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return rep.type('text/html').send(errorHtml('Spotify hat den Zugriff verweigert', error));
    }
    if (!code || !state) {
      return rep.code(400).type('text/html').send(errorHtml('Fehlende Parameter', 'code oder state fehlt in der Callback-URL'));
    }

    try {
      await handleSpotifyCallback(code, state);
      return rep.type('text/html').send(successHtml('Spotify'));
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Token-Austausch fehlgeschlagen', (e as Error).message));
    }
  });

  // ---- Tidal ----

  app.get('/auth/tidal/login', (_req, rep) => {
    try {
      return rep.redirect(startTidalLogin());
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Login konnte nicht gestartet werden', (e as Error).message));
    }
  });

  app.get('/auth/tidal/callback', async (req, rep) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return rep.type('text/html').send(errorHtml('Tidal hat den Zugriff verweigert', error));
    }
    if (!code || !state) {
      return rep.code(400).type('text/html').send(errorHtml('Fehlende Parameter', 'code oder state fehlt in der Callback-URL'));
    }

    try {
      await handleTidalCallback(code, state);
      return rep.type('text/html').send(successHtml('Tidal'));
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Token-Austausch fehlgeschlagen', (e as Error).message));
    }
  });

  // ---- Token für Spotify Web Playback SDK ----

  app.get('/auth/spotify/token', async (_req, rep) => {
    try {
      const token = await getSpotifyToken();
      return { access_token: token };
    } catch (e) {
      return rep.code(401).send({ error: (e as Error).message });
    }
  });

  // ---- Tidal Streaming Login (PKCE + manuelle URL-Eingabe) ----

  app.get('/auth/tidal/stream/login', (_req, rep) => {
    try {
      const authUrl = startStreamingLogin();
      return rep.type('text/html').send(streamingLoginHtml(authUrl));
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Login konnte nicht gestartet werden', (e as Error).message));
    }
  });

  app.post('/auth/tidal/stream/submit', async (req, rep) => {
    const { callbackUrl } = req.body as Record<string, string>;
    if (!callbackUrl) return rep.code(400).type('text/html').send(errorHtml('Fehlende Eingabe', 'Bitte die vollständige Callback-URL einfügen.'));
    try {
      await handleStreamingCallback(callbackUrl);
      return rep.type('text/html').send(successHtml('Tidal Streaming (Vollzugriff mit r_usr)'));
    } catch (e) {
      return rep.code(500).type('text/html').send(errorHtml('Token-Austausch fehlgeschlagen', (e as Error).message));
    }
  });

  // ---- Status ----

  app.get('/auth/status', (_req, rep) => {
    return { spotify: hasSpotifyToken(), tidal: hasTidalToken(), tidalStreaming: hasStreamingToken() };
  });
};

function streamingLoginHtml(authUrl: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Tidal Streaming Login</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #121212; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; max-width: 540px; width: 100%; }
    h1 { color: #00fecc; font-size: 1.4rem; margin-bottom: .5rem; }
    p { color: #b3b3b3; line-height: 1.6; margin: .5rem 0; }
    .step { background: #1e1e1e; border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem 0; text-align: left; }
    .step strong { color: #fff; }
    a.btn { display: inline-block; margin: .75rem 0; padding: .8rem 2rem; background: #00fecc;
            color: #000; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 1rem; }
    input[type=text] { width: 100%; box-sizing: border-box; padding: .75rem; border-radius: 6px;
                       background: #2a2a2a; border: 1px solid #444; color: #fff; font-size: .85rem; margin: .5rem 0; }
    button { padding: .75rem 2rem; background: #00fecc; color: #000; border: none;
             border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 1rem; margin-top: .25rem; }
    code { background: #1e1e1e; padding: .2rem .4rem; border-radius: 4px; font-size: .8rem; word-break: break-all; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size:2.5rem;margin-bottom:.5rem">🎵</div>
    <h1>Tidal Streaming — Vollzugriff einrichten</h1>
    <div class="step">
      <strong>Schritt 1:</strong> Klicke auf den Button und melde dich bei Tidal an.
      <br>
      <a class="btn" href="${authUrl}" target="_blank">Bei Tidal anmelden ↗</a>
    </div>
    <div class="step">
      <strong>Schritt 2:</strong> Nach der Anmeldung wirst du auf eine Tidal-Seite weitergeleitet.
      Kopiere die <strong>vollständige URL</strong> aus der Adressleiste
      (beginnt mit <code>https://tidal.com/android/login/auth?code=…</code>).
    </div>
    <div class="step">
      <strong>Schritt 3:</strong> Füge die URL hier ein und klicke auf Bestätigen.
      <form method="POST" action="/auth/tidal/stream/submit">
        <input type="text" name="callbackUrl"
               placeholder="https://tidal.com/android/login/auth?code=…&state=…" required />
        <button type="submit">Bestätigen</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

function successHtml(service: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${service} verbunden</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #121212; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; max-width: 420px; }
    h1 { color: #1db954; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #b3b3b3; line-height: 1.6; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✅</div>
    <h1>${service} erfolgreich verbunden</h1>
    <p>Der Token wurde gespeichert und wird automatisch erneuert.<br>
       Du kannst dieses Fenster schliessen.</p>
  </div>
</body>
</html>`;
}

function errorHtml(title: string, detail: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Fehler</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #121212; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; max-width: 420px; }
    h1 { color: #ef4444; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #b3b3b3; line-height: 1.6; }
    code { background: #1e1e1e; padding: .2rem .5rem; border-radius: 4px; font-size: .85rem; word-break: break-all; }
    a { color: #1db954; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">❌</div>
    <h1>${title}</h1>
    <p><code>${detail}</code></p>
    <p><a href="/auth/spotify/login">Erneut versuchen</a></p>
  </div>
</body>
</html>`;
}

export default authRoutes;
