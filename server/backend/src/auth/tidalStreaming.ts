import { createHash, randomBytes } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logFetch } from '../utils/logFetch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const TOKEN_FILE = join(__dirname, '../../data/tidal-streaming-token.json');

// Music-Assistant-kompatibler Tidal-Client — unterstützt PKCE + r_usr-Scope
const CLIENT_ID   = '6BDSRdpK9hqEBTgU';
const AUTH_URL    = 'https://login.tidal.com/authorize';
const TOKEN_URL   = 'https://auth.tidal.com/v1/oauth2/token';
const REDIRECT_URI = 'https://tidal.com/android/login/auth';
const SCOPES      = 'r_usr w_usr w_sub';

interface TokenData {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;
}

const token: TokenData = { accessToken: '', refreshToken: '', expiresAt: 0 };
const pendingStates = new Map<string, { codeVerifier: string; createdAt: number }>();

async function persistToken(): Promise<void> {
  try {
    await mkdir(dirname(TOKEN_FILE), { recursive: true });
    await writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[TidalStream] Token konnte nicht gespeichert werden:', (e as Error).message);
  }
}

export async function initTidalStreamingAuth(): Promise<void> {
  try {
    const raw   = await readFile(TOKEN_FILE, 'utf-8');
    const saved = JSON.parse(raw) as Partial<TokenData>;
    if (saved.refreshToken) {
      token.accessToken  = saved.accessToken  ?? '';
      token.refreshToken = saved.refreshToken;
      token.expiresAt    = saved.expiresAt    ?? 0;
      const valid = token.accessToken && Date.now() < token.expiresAt - 60_000;
      console.log(`[TidalStream] Streaming-Token geladen — ${valid ? 'gültig' : 'wird beim nächsten Request erneuert'}`);
    }
  } catch {
    console.log('[TidalStream] Kein Streaming-Token vorhanden → /auth/tidal/stream/login aufrufen');
  }
}

// ---- Token-Refresh ----

let inflightRefresh: Promise<string> | null = null;

export async function getTidalStreamingToken(): Promise<string | null> {
  if (!token.refreshToken) return null;
  if (token.accessToken && Date.now() < token.expiresAt - 60_000) return token.accessToken;
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => { inflightRefresh = null; });
  }
  try { return await inflightRefresh; } catch { return null; }
}

async function doRefresh(): Promise<string> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: token.refreshToken,
    client_id:     CLIENT_ID,
  });

  const resp = await logFetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!resp.ok) {
    token.refreshToken = '';
    token.accessToken  = '';
    token.expiresAt    = 0;
    await persistToken();
    throw new Error('Tidal Streaming-Token abgelaufen — bitte neu einloggen unter /auth/tidal/stream/login');
  }

  const data = await resp.json() as Record<string, unknown>;
  token.accessToken  = data['access_token']  as string;
  token.refreshToken = (data['refresh_token'] as string | undefined) ?? token.refreshToken;
  token.expiresAt    = Date.now() + ((data['expires_in'] as number | undefined) ?? 7_776_000) * 1000;
  console.log('[TidalStream] Token erneuert, gültig bis:', new Date(token.expiresAt).toISOString());
  await persistToken();
  return token.accessToken;
}

// ---- PKCE Flow ----

function generateCodeVerifier(): string { return randomBytes(32).toString('base64url'); }
function generateCodeChallenge(v: string): string {
  return createHash('sha256').update(v).digest('base64url');
}

export function startStreamingLogin(): string {
  const now = Date.now();
  for (const [s, v] of pendingStates) {
    if (now - v.createdAt > 10 * 60 * 1000) pendingStates.delete(s);
  }

  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = randomBytes(16).toString('hex');
  pendingStates.set(state, { codeVerifier, createdAt: now });

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id',             CLIENT_ID);
  url.searchParams.set('response_type',         'code');
  url.searchParams.set('redirect_uri',          REDIRECT_URI);
  url.searchParams.set('scope',                 SCOPES);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('state',                 state);

  return url.toString();
}

export async function handleStreamingCallback(callbackUrl: string): Promise<void> {
  let code: string, state: string;
  try {
    const parsed = new URL(callbackUrl);
    code  = parsed.searchParams.get('code')  ?? '';
    state = parsed.searchParams.get('state') ?? '';
  } catch {
    throw new Error('Ungültige URL — bitte die vollständige Adressleisten-URL einfügen');
  }
  if (!code || !state) throw new Error('code oder state nicht in der URL gefunden');

  const pending = pendingStates.get(state);
  if (!pending) throw new Error('Unbekannter State — bitte erneut starten (der Code ist 10 Minuten gültig)');
  pendingStates.delete(state);

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     CLIENT_ID,
    code_verifier: pending.codeVerifier,
  });

  const resp = await logFetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token-Austausch fehlgeschlagen: HTTP ${resp.status} — ${text}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  token.accessToken  = data['access_token']  as string;
  token.refreshToken = data['refresh_token'] as string;
  token.expiresAt    = Date.now() + ((data['expires_in'] as number | undefined) ?? 7_776_000) * 1000;
  console.log('[TidalStream] PKCE abgeschlossen, Scopes:', data['scope']);
  console.log('[TidalStream] Token gültig bis:', new Date(token.expiresAt).toISOString());
  await persistToken();
}

export function hasStreamingToken(): boolean { return !!token.refreshToken; }
