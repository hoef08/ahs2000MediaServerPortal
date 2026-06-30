import { createHash, randomBytes } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const TOKEN_FILE = join(__dirname, '../../data/tidal-token.json');

const AUTH_URL  = 'https://login.tidal.com/authorize';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

interface TokenData {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;
}

const token: TokenData = {
  accessToken:  '',
  refreshToken: config.tidal.refreshToken, // Fallback aus .env
  expiresAt:    0,
};

// ---- Token-Persistenz ----

async function persistToken(): Promise<void> {
  try {
    await mkdir(dirname(TOKEN_FILE), { recursive: true });
    await writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Tidal] Token konnte nicht gespeichert werden:', (e as Error).message);
  }
}

export async function initTidalAuth(): Promise<void> {
  try {
    const raw   = await readFile(TOKEN_FILE, 'utf-8');
    const saved = JSON.parse(raw) as Partial<TokenData>;
    if (saved.refreshToken) {
      token.accessToken  = saved.accessToken  ?? '';
      token.refreshToken = saved.refreshToken;
      token.expiresAt    = saved.expiresAt    ?? 0;
      const valid = token.accessToken && Date.now() < token.expiresAt - 60_000;
      console.log(`[Tidal] Token aus Datei geladen — Access-Token: ${valid ? 'gültig' : 'läuft ab, wird beim nächsten Request erneuert'}`);
    }
  } catch {
    if (token.refreshToken) {
      console.log('[Tidal] Kein Token-File gefunden, verwende TIDAL_REFRESH_TOKEN aus .env');
    } else {
      console.log('[Tidal] Kein Token vorhanden → bitte http://localhost:' + config.port + '/auth/tidal/login aufrufen');
    }
  }
}

// ---- Token-Refresh ----

let inflightRefresh: Promise<string> | null = null;

export async function getTidalToken(): Promise<string> {
  if (!token.refreshToken) {
    throw new Error(
      'Tidal nicht autorisiert — bitte http://localhost:' + config.port + '/auth/tidal/login aufrufen'
    );
  }
  if (token.accessToken && Date.now() < token.expiresAt - 60_000) {
    return token.accessToken;
  }
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

async function doRefresh(): Promise<string> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: token.refreshToken,
    client_id:     config.tidal.clientId,
  });

  const resp = await logFetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 400 && text.includes('invalid_grant')) {
      token.refreshToken = '';
      token.accessToken  = '';
      token.expiresAt    = 0;
      await persistToken();
      throw new Error(
        'Tidal Refresh-Token abgelaufen — bitte http://localhost:' + config.port + '/auth/tidal/login aufrufen'
      );
    }
    throw new Error(`Tidal Token-Refresh fehlgeschlagen: HTTP ${resp.status} — ${text}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  token.accessToken  = data['access_token'] as string;
  token.refreshToken = (data['refresh_token'] as string | undefined) ?? token.refreshToken;
  token.expiresAt    = Date.now() + ((data['expires_in'] as number | undefined) ?? 7_776_000) * 1000;

  console.log('[Tidal] Token erneuert, gültig bis:', new Date(token.expiresAt).toISOString());
  await persistToken();
  return token.accessToken;
}

// ---- PKCE OAuth Flow ----

const SCOPES = 'user.read collection.read collection.write playlists.read playlists.write entitlements.read playback';

const pendingStates = new Map<string, { codeVerifier: string; createdAt: number }>();

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function redirectUri(): string {
  return config.tidal.redirectUri;
}

export function startTidalLogin(): string {
  const now = Date.now();
  for (const [s, v] of pendingStates) {
    if (now - v.createdAt > 10 * 60 * 1000) pendingStates.delete(s);
  }

  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = randomBytes(16).toString('hex');

  pendingStates.set(state, { codeVerifier, createdAt: now });

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id',             config.tidal.clientId);
  url.searchParams.set('response_type',         'code');
  url.searchParams.set('redirect_uri',          redirectUri());
  url.searchParams.set('scope',                 SCOPES);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('state',                 state);

  return url.toString();
}

export async function handleTidalCallback(code: string, state: string): Promise<void> {
  const pending = pendingStates.get(state);
  if (!pending) throw new Error('Ungültiger oder abgelaufener State — bitte erneut einloggen');
  pendingStates.delete(state);

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri(),
    client_id:     config.tidal.clientId,
    code_verifier: pending.codeVerifier,
  });

  const resp = await logFetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Tidal Token-Austausch fehlgeschlagen: HTTP ${resp.status} — ${await resp.text()}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  token.accessToken  = data['access_token']  as string;
  token.refreshToken = data['refresh_token'] as string;
  token.expiresAt    = Date.now() + ((data['expires_in'] as number | undefined) ?? 7_776_000) * 1000;

  console.log('[Tidal] Neue Tokens via OAuth erhalten, gültig bis:', new Date(token.expiresAt).toISOString());
  await persistToken();
}

export function hasTidalToken(): boolean {
  return !!token.refreshToken;
}
