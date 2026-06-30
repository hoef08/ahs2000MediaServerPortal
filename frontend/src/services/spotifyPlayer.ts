// ---- Spotify Web Playback SDK Type Declarations ----

declare global {
  interface Window {
    Spotify: { Player: new (opts: SpotifyPlayerOptions) => SpotifySDKPlayer };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlaybackState {
  position: number;
  duration: number;
  paused:   boolean;
  track_window: {
    current_track: {
      id: string; name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
      duration_ms: number;
    };
  };
}

interface SpotifySDKPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  addListener(event: 'ready',                cb: (d: { device_id: string }) => void): boolean;
  addListener(event: 'not_ready',            cb: (d: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (s: SpotifyPlaybackState | null) => void): boolean;
  addListener(event: 'initialization_error', cb: (d: { message: string }) => void): boolean;
  addListener(event: 'authentication_error', cb: (d: { message: string }) => void): boolean;
  addListener(event: 'account_error',        cb: (d: { message: string }) => void): boolean;
}

// ---- Service ----

export type SpotifyStateCallback = (state: {
  position: number;
  duration: number;
  paused: boolean;
}) => void;

class SpotifyPlayerService {
  private player:       SpotifySDKPlayer | null = null;
  private deviceId:     string | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  noPremium = false; // gesetzt wenn account_error feuert

  async init(onStateChange: SpotifyStateCallback, onError: (msg: string) => void): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Access token vom Backend holen (Backend kümmert sich um Refresh)
      const resp = await fetch('/api/auth/spotify/token');
      if (!resp.ok) throw new Error('Spotify: Nicht eingeloggt – /auth/spotify/login aufrufen');
      const data = await resp.json() as { access_token: string };
      console.log('[SpotifySDK] Token OK, warte auf SDK...');

      // Auf SDK warten (Script in index.html, lädt asynchron)
      if (typeof window.Spotify === 'undefined') {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Spotify SDK Timeout (15s) — Script in index.html geladen?')), 15_000);
          window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(t); console.log('[SpotifySDK] SDK bereit'); resolve(); };
        });
      } else {
        console.log('[SpotifySDK] SDK bereits geladen');
      }

      this.player = new window.Spotify.Player({
        name: 'Media Server',
        getOAuthToken: async cb => {
          try {
            const r = await fetch('/api/auth/spotify/token');
            const d = await r.json() as { access_token?: string };
            cb(d.access_token ?? data.access_token);
          } catch {
            cb(data.access_token);
          }
        },
        volume: 0.7,
      });

      this.player.addListener('ready', ({ device_id }) => {
        console.log('[SpotifySDK] ready — device_id:', device_id);
        this.deviceId    = device_id;
        this.initialized = true;
      });
      this.player.addListener('not_ready', ({ device_id }) => {
        console.log('[SpotifySDK] not_ready — device_id:', device_id);
        this.deviceId = null;
      });
      this.player.addListener('player_state_changed', state => {
        if (!state) return;
        onStateChange({ position: state.position, duration: state.duration, paused: state.paused });
      });
      this.player.addListener('initialization_error', ({ message }) => {
        console.log('[SpotifySDK] initialization_error:', message);
        onError(`Spotify Init-Fehler: ${message}`);
      });
      this.player.addListener('authentication_error', ({ message }) => {
        console.log('[SpotifySDK] authentication_error:', message);
        onError(`Spotify Auth-Fehler: ${message} — bitte /auth/spotify/login aufrufen`);
      });
      this.player.addListener('account_error', ({ message }) => {
        console.log('[SpotifySDK] account_error:', message);
        this.noPremium = true;
        onError(`Spotify Premium erforderlich: ${message}`);
      });

      console.log('[SpotifySDK] Verbinde Player...');
      const connected = await this.player.connect();
      console.log('[SpotifySDK] connect() Ergebnis:', connected);
      if (!connected) throw new Error('Spotify Player konnte nicht verbunden werden');
    })();

    return this.initPromise;
  }

  async play(trackId: string): Promise<void> {
    if (this.noPremium) throw new Error('Spotify Premium erforderlich für die Web-Wiedergabe');

    // Auf device_id warten (max 8 Sekunden)
    let waited = 0;
    while (!this.deviceId && waited < 8_000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (!this.deviceId) throw new Error('Spotify Player nicht bereit (kein Device nach 8s)');

    console.log('[SpotifySDK] play() mit device_id:', this.deviceId, 'track:', trackId);

    // Schritt 1: Playback auf unser Device transferieren (aktiviert es für die Connect-API)
    const transferResp = await fetch('/api/spotify/player/transfer', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device_ids: [this.deviceId], play: false }),
    });
    console.log('[SpotifySDK] transfer() status:', transferResp.status);

    // Kurz warten bis das Device propagiert ist
    await new Promise(r => setTimeout(r, 800));

    // Schritt 2: Play mit Retry bei 404
    let lastErr = 'HTTP ???';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        console.log(`[SpotifySDK] play() retry ${attempt}...`);
        await new Promise(r => setTimeout(r, attempt * 1_000));
      }

      const resp = await fetch('/api/spotify/player/play', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uris: [`spotify:track:${trackId}`], device_id: this.deviceId }),
      });

      console.log(`[SpotifySDK] play() attempt ${attempt + 1} — status: ${resp.status}`);
      if (resp.status === 204 || resp.ok) return;

      const body = await resp.json().catch(() => null) as { error?: { message: string } } | null;
      lastErr = body?.error?.message ?? `HTTP ${resp.status}`;
      console.log(`[SpotifySDK] play() error:`, lastErr);

      if (resp.status !== 404) break;
    }
    throw new Error(lastErr);
  }

  async togglePlay(): Promise<void> { await this.player?.togglePlay(); }

  async seek(positionMs: number): Promise<void> { await this.player?.seek(positionMs); }

  async setVolume(volume: number): Promise<void> { await this.player?.setVolume(volume); }

  async getCurrentState(): Promise<{ position: number; duration: number; paused: boolean } | null> {
    const state = await this.player?.getCurrentState();
    if (!state) return null;
    return { position: state.position, duration: state.duration, paused: state.paused };
  }

  isReady(): boolean { return this.initialized && !!this.deviceId; }
}

export const spotifyPlayer = new SpotifyPlayerService();
