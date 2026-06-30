const API_BASE = '/api';

// ---- Typen vom Backend (gespiegelt aus server/backend/src/types/media.ts) ----

export interface MediaTrack {
  id: string; title: string; artistName: string; albumTitle: string;
  albumId: string; coverUrl: string; durationMs: number; trackNumber: number;
  discNumber: number; explicit: boolean; popularity: number;
  service: string; serviceUrl: string; previewUrl: string; isrc: string;
}

export interface MediaAlbum {
  id: string; title: string; artistName: string; coverUrl: string;
  releaseDate: string; trackCount: number; durationMs: number;
  explicit: boolean; popularity: number; service: string; serviceUrl: string;
}

export interface MediaArtist {
  id: string; name: string; imageUrl: string; popularity: number;
  genres: string[]; service: string; serviceUrl: string; albumCount?: number;
}

export interface MediaPlaylist {
  id: string; title: string; description: string; coverUrl: string;
  trackCount: number; isPublic: boolean; owner: string; service: string;
}

export interface MediaSearchResult {
  tracks: MediaTrack[]; albums: MediaAlbum[]; artists: MediaArtist[]; playlists: MediaPlaylist[];
  totalTracks: number; totalAlbums: number; totalArtists: number; totalPlaylists: number;
}

export interface HomeSection {
  id: string;
  title: string;
  type: 'albums' | 'tracks' | 'playlists';
  items: MediaItem[];
}

interface ApiResponse<T> {
  success: boolean; data: T | null;
  error: { code: number; message: string } | null;
}

// ---- Frontend-Item (kompatibel mit App.tsx) ----

export interface MediaItem {
  id: string; title: string; artist: string; album?: string;
  duration?: number; coverUrl?: string; streamUrl?: string;
  type?: 'audio' | 'video'; provider?: string;
  itemType?: 'track' | 'album' | 'artist' | 'playlist';
  year?: number;
  albumCount?: number;
}

// ---- Provider → Backend-Service-Mapping ----

const SERVICE_MAP: Record<string, string> = {
  SubSonic:  'subsonic',
  Madsonic:  'madsonic',
  Navidrome: 'navidrome',
  Airsonic:  'airsonic',
  Jellyfin:  'jellyfin',
  Plex:      'plex',
  Spotify:   'spotify',
  Tidal:     'tidal',
};

// ---- Health-Endpoint ----

export interface ServiceStatus {
  spotify: boolean; tidal: boolean; plex: boolean;
  jellyfin: boolean; subsonic: boolean; navidrome: boolean;
  madsonic?: boolean; airsonic?: boolean;
  tidalStreaming?: boolean;
}

export interface ServiceConfig {
  subsonic:  { baseUrl: string; username: string; password: string; clientName: string; apiVersion: string; musicFolderId?: string };
  navidrome: { baseUrl: string; username: string; password: string; clientName: string; apiVersion: string; musicFolderId?: string };
  madsonic:  { baseUrl: string; username: string; password: string; clientName: string; apiVersion: string; musicFolderId?: string };
  airsonic:  { baseUrl: string; username: string; password: string; clientName: string; apiVersion: string; musicFolderId?: string };
  plex:      { baseUrl: string; token: string };
  jellyfin:  { baseUrl: string; apiToken: string; userId: string };
  spotify:   { clientId: string; redirectUri: string; market: string };
  tidal:     { clientId: string; redirectUri: string; countryCode: string };
  lastfm:    { apiKey: string };
}

export interface AuthStatus {
  spotify: boolean;
  tidal: boolean;
  tidalStreaming: boolean;
}

export async function getServiceStatus(): Promise<ServiceStatus> {
  try {
    const resp = await fetch(`${API_BASE}/health`);
    if (!resp.ok) throw new Error();
    const data = await resp.json() as { services: ServiceStatus };
    return data.services;
  } catch {
    return { spotify: false, tidal: false, plex: false, jellyfin: false, subsonic: false, navidrome: false };
  }
}

// ---- Normalisierung ----

// Services mit Backend-Stream-Proxy
const STREAMABLE_SERVICES = new Set(['plex', 'jellyfin', 'subsonic', 'navidrome', 'madsonic', 'airsonic', 'tidal']);

// Cover-URLs die mit '/' beginnen, kommen als relative Backend-Pfade (z.B. Subsonic/Navidrome)
// und müssen mit API_BASE prefixiert werden.
function resolveCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith('/') ? `${API_BASE}${url}` : url;
}

function trackToItem(t: MediaTrack): MediaItem {
  let streamUrl: string | undefined;
  if (t.previewUrl) {
    streamUrl = t.previewUrl;
  } else if (STREAMABLE_SERVICES.has(t.service)) {
    streamUrl = `${API_BASE}/${t.service}/stream/${t.id}`;
  }
  return {
    id:       t.id,
    title:    t.title,
    artist:   t.artistName,
    album:    t.albumTitle || undefined,
    duration: t.durationMs > 0 ? Math.round(t.durationMs / 1000) : undefined,
    coverUrl: resolveCoverUrl(t.coverUrl),
    streamUrl,
    type:     'audio',
    provider: t.service,
    itemType: 'track',
  };
}

function albumToItem(a: MediaAlbum): MediaItem {
  const yearNum = a.releaseDate ? parseInt(a.releaseDate.slice(0, 4), 10) : undefined;
  return {
    id:       a.id,
    title:    a.title,
    artist:   a.artistName,
    duration: a.durationMs > 0 ? Math.round(a.durationMs / 1000) : undefined,
    coverUrl: resolveCoverUrl(a.coverUrl),
    type:     'audio',
    provider: a.service,
    itemType: 'album',
    year:     yearNum && yearNum > 1000 ? yearNum : undefined,
  };
}

function artistToItem(a: MediaArtist): MediaItem {
  const coverUrl = a.imageUrl
    ? resolveCoverUrl(a.imageUrl)
    : `${API_BASE}/artist-image?name=${encodeURIComponent(a.name)}`;
  return {
    id:         a.id,
    title:      a.name,
    artist:     a.name,
    coverUrl,
    type:       'audio',
    provider:   a.service,
    itemType:   'artist',
    albumCount: a.albumCount,
  };
}

function playlistToItem(p: MediaPlaylist): MediaItem {
  return {
    id:       p.id,
    title:    p.title,
    artist:   p.owner || p.description || '',
    coverUrl: resolveCoverUrl(p.coverUrl),
    type:     'audio',
    provider: p.service,
    itemType: 'playlist',
  };
}

// ---- API-Methoden ----

export interface SearchPage {
  items: MediaItem[];
  total: number;
}

export const mediaService = {
  search: async (
    query: string,
    provider: string,
    resultType: 'tracks' | 'albums' | 'artists' = 'tracks',
    offset = 0,
    limit  = 20,
  ): Promise<SearchPage> => {
    if (!query.trim()) return { items: [], total: 0 };

    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };

    try {
      const url = new URL(`${window.location.origin}${API_BASE}/${service}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(limit));

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const body = await resp.json() as ApiResponse<MediaSearchResult>;
      if (!body.success || !body.data) throw new Error(body.error?.message ?? 'Unbekannter Fehler');

      const data = body.data;
      if (resultType === 'albums')  return { items: data.albums.map(albumToItem),   total: data.totalAlbums  };
      if (resultType === 'artists') return { items: data.artists.map(artistToItem), total: data.totalArtists };
      return { items: data.tracks.map(trackToItem), total: data.totalTracks };
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  getAlbumTracks: async (provider: string, albumId: string, offset = 0, limit = 50): Promise<SearchPage> => {
    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };
    const resp = await fetch(`${API_BASE}/${service}/albums/${encodeURIComponent(albumId)}/tracks?offset=${offset}&limit=${limit}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json() as ApiResponse<MediaSearchResult>;
    if (!body.success || !body.data) throw new Error(body.error?.message ?? 'Unbekannter Fehler');
    return { items: body.data.tracks.map(trackToItem), total: body.data.totalTracks };
  },

  getArtistAlbums: async (provider: string, artistId: string, offset = 0, limit = 50): Promise<SearchPage> => {
    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };
    const resp = await fetch(`${API_BASE}/${service}/artists/${encodeURIComponent(artistId)}/albums?offset=${offset}&limit=${limit}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json() as ApiResponse<MediaSearchResult>;
    if (!body.success || !body.data) throw new Error(body.error?.message ?? 'Unbekannter Fehler');
    return { items: body.data.albums.map(albumToItem), total: body.data.totalAlbums };
  },

  getPlaylistTracks: async (provider: string, playlistId: string, offset = 0, limit = 50): Promise<SearchPage> => {
    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };
    const resp = await fetch(`${API_BASE}/${service}/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${limit}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json() as ApiResponse<MediaSearchResult>;
    if (!body.success || !body.data) throw new Error(body.error?.message ?? 'Unbekannter Fehler');
    return { items: body.data.tracks.map(trackToItem), total: body.data.totalTracks };
  },

  getHomeData: async (provider: string): Promise<HomeSection[]> => {
    const service = SERVICE_MAP[provider];
    if (!service) return [];
    try {
      const resp = await fetch(`${API_BASE}/${service}/home`);
      if (!resp.ok) return [];
      const body = await resp.json() as ApiResponse<{ sections: Array<{ id: string; title: string; type: 'albums' | 'tracks' | 'playlists'; items: unknown[] }> }>;
      if (!body.success || !body.data) return [];
      return body.data.sections.map(sec => ({
        id:    sec.id,
        title: sec.title,
        type:  sec.type,
        items: sec.items.map(item => {
          const i = item as Record<string, unknown>;
          if (sec.type === 'playlists') return playlistToItem(i as unknown as MediaPlaylist);
          if (sec.type === 'albums')    return albumToItem(i as unknown as MediaAlbum);
          return trackToItem(i as unknown as MediaTrack);
        }),
      }));
    } catch {
      return [];
    }
  },

  browse: async (
    provider: string,
    type: 'tracks' | 'albums' | 'artists',
    offset = 0,
    limit  = 50,
  ): Promise<SearchPage> => {
    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };
    const resp = await fetch(`${API_BASE}/${service}/browse?type=${type}&offset=${offset}&limit=${limit}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json() as ApiResponse<MediaSearchResult>;
    if (!body.success || !body.data) throw new Error(body.error?.message ?? 'Unbekannter Fehler');
    const data = body.data;
    if (type === 'albums')  return { items: data.albums.map(albumToItem),   total: data.totalAlbums  };
    if (type === 'artists') return { items: data.artists.map(artistToItem), total: data.totalArtists };
    return { items: data.tracks.map(trackToItem), total: data.totalTracks };
  },

  getMusicFolders: async (provider: string): Promise<{ id: string; name: string }[]> => {
    const service = SERVICE_MAP[provider];
    if (!service) return [];
    try {
      const resp = await fetch(`${API_BASE}/${service}/musicfolders`);
      if (!resp.ok) return [];
      const body = await resp.json() as { success: boolean; data: { id: string; name: string }[] };
      return body.success ? body.data : [];
    } catch {
      return [];
    }
  },

  getGenres: async (provider: string): Promise<string[]> => {
    const service = SERVICE_MAP[provider];
    if (!service) return [];
    try {
      const resp = await fetch(`${API_BASE}/${service}/genres`);
      if (!resp.ok) return [];
      const body = await resp.json() as { success: boolean; data: string[] };
      return body.success ? body.data : [];
    } catch {
      return [];
    }
  },

  discover: async (
    provider: string,
    type: string,
    opts: { fromYear?: number; toYear?: number; genre?: string; limit?: number } = {},
  ): Promise<SearchPage> => {
    const service = SERVICE_MAP[provider];
    if (!service) return { items: [], total: 0 };
    const params = new URLSearchParams({ type, limit: String(opts.limit ?? 20) });
    if (opts.fromYear != null) params.set('fromYear', String(opts.fromYear));
    if (opts.toYear   != null) params.set('toYear',   String(opts.toYear));
    if (opts.genre)            params.set('genre',    opts.genre);
    try {
      const resp = await fetch(`${API_BASE}/${service}/discover?${params}`);
      if (!resp.ok) return { items: [], total: 0 };
      const body = await resp.json() as ApiResponse<MediaSearchResult>;
      if (!body.success || !body.data) return { items: [], total: 0 };
      const data  = body.data;
      const items = [
        ...data.albums.map(albumToItem),
        ...data.tracks.map(trackToItem),
      ];
      return { items, total: items.length };
    } catch {
      return { items: [], total: 0 };
    }
  },

  getStreamUrl: (_id: string): string => {
    return '';
  },
};

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    const resp = await fetch(`${API_BASE}/auth/status`);
    if (!resp.ok) throw new Error();
    return resp.json() as Promise<AuthStatus>;
  } catch {
    return { spotify: false, tidal: false, tidalStreaming: false };
  }
}

export interface LastFmArtistData {
  name: string;
  listeners: number;
  playcount: number;
  bio: string;
  tags: string[];
  similar: Array<{ name: string; imageUrl: string }>;
  topTracks: Array<{ name: string; playcount: number; imageUrl: string }>;
}

export async function getLastFmArtistData(name: string): Promise<LastFmArtistData | null> {
  try {
    const resp = await fetch(`${API_BASE}/lastfm/artist?name=${encodeURIComponent(name)}`);
    if (!resp.ok) return null;
    const body = await resp.json() as ApiResponse<LastFmArtistData>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

export const serviceSettings = {
  get: async (): Promise<ServiceConfig> => {
    const resp = await fetch(`${API_BASE}/settings/services`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json() as Promise<ServiceConfig>;
  },
  save: async (cfg: ServiceConfig): Promise<{ success: boolean; message: string }> => {
    const resp = await fetch(`${API_BASE}/settings/services`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(cfg),
    });
    return resp.json() as Promise<{ success: boolean; message: string }>;
  },
};
