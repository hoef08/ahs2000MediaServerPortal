import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, MediaSearchResult, HomeSection } from '../types/media.js';

const { baseUrl, token } = config.plex;

function authParams(): Record<string, string> {
  return { 'X-Plex-Token': token };
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(baseUrl + path);
  url.searchParams.set('X-Plex-Token', token);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await logFetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Plex API error: HTTP ${resp.status} ${path}`);
  return resp.json() as Promise<T>;
}

function thumbUrl(thumb?: string): string {
  if (!thumb) return '';
  const url = new URL(baseUrl + '/photo/:/transcode');
  url.searchParams.set('url', thumb);
  url.searchParams.set('width', '320');
  url.searchParams.set('height', '320');
  url.searchParams.set('X-Plex-Token', token);
  return url.toString();
}

interface PlexHub {
  type:  string;
  size:  number;
  Metadata?: PlexItem[];
}

interface PlexItem {
  ratingKey:           string;
  title:               string;
  type:                string;
  thumb?:              string;
  art?:                string;
  parentRatingKey?:    string;
  parentTitle?:        string;
  grandparentTitle?:   string;
  grandparentRatingKey?: string;
  grandparentThumb?:   string;
  duration?:           number;
  index?:              number;
  parentIndex?:        number;
  year?:               number;
  leafCount?:          number;
  summary?:            string;
}

interface PlexHubResponse { MediaContainer: { Hub: PlexHub[] } }

function normalizeTrack(i: PlexItem): MediaTrack {
  return {
    id:          i.ratingKey,
    title:       i.title,
    artistName:  i.grandparentTitle ?? '',
    albumTitle:  i.parentTitle ?? '',
    albumId:     i.parentRatingKey ?? '',
    coverUrl:    thumbUrl(i.parentTitle ? `/library/metadata/${i.parentRatingKey}/thumb` : i.thumb),
    durationMs:  i.duration ?? 0,
    trackNumber: i.index ?? 0,
    discNumber:  i.parentIndex ?? 1,
    explicit:    false,
    popularity:  0,
    service:     'plex',
    serviceUrl:  '',
    previewUrl:  '',
    isrc:        '',
  };
}

function normalizeAlbum(i: PlexItem): MediaAlbum {
  return {
    id:          i.ratingKey,
    title:       i.title,
    artistName:  i.parentTitle ?? '',
    coverUrl:    thumbUrl(i.thumb),
    releaseDate: i.year ? String(i.year) : '',
    trackCount:  i.leafCount ?? 0,
    durationMs:  0,
    explicit:    false,
    popularity:  0,
    service:     'plex',
    serviceUrl:  '',
  };
}

function normalizeArtist(i: PlexItem): MediaArtist {
  return {
    id:         i.ratingKey,
    name:       i.title,
    imageUrl:   thumbUrl(i.thumb),
    popularity: 0,
    genres:     [],
    service:    'plex',
    serviceUrl: '',
  };
}

interface PlexMetaResponse {
  MediaContainer: {
    Metadata: Array<{
      Media?: Array<{ Part?: Array<{ key: string }> }>;
    }>;
  };
}

function normalizePlexPlaylist(i: PlexItem): MediaPlaylist {
  return {
    id:          i.ratingKey,
    title:       i.title,
    description: i.summary ?? '',
    coverUrl:    thumbUrl(i.thumb),
    trackCount:  i.leafCount ?? 0,
    isPublic:    false,
    owner:       '',
    service:     'plex',
  };
}

export async function getPlexStreamUrl(id: string): Promise<string> {
  const data = await apiGet<PlexMetaResponse>(`/library/metadata/${id}`);
  const partKey = data.MediaContainer?.Metadata?.[0]?.Media?.[0]?.Part?.[0]?.key;
  if (!partKey) throw new Error(`Kein Media-Part für Plex-Item ${id}`);
  return `${baseUrl}${partKey}?X-Plex-Token=${token}`;
}

interface PlexChildrenResponse {
  MediaContainer: { Metadata?: PlexItem[]; size?: number; totalSize?: number };
}

export async function getPlexAlbumTracks(albumId: string): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>(`/library/metadata/${albumId}/children`);
  const items = (data.MediaContainer?.Metadata ?? []).filter(i => i.type === 'track');
  return { tracks: items.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: items.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function getPlexArtistAlbums(artistId: string): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>(`/library/metadata/${artistId}/children`);
  const items = (data.MediaContainer?.Metadata ?? []).filter(i => i.type === 'album');
  return { tracks: [], albums: items.map(normalizeAlbum), artists: [], playlists: [], totalTracks: 0, totalAlbums: items.length, totalArtists: 0, totalPlaylists: 0 };
}

export async function searchPlex(
  query:  string,
  types   = ['track', 'album', 'artist'],
  offset  = 0,
  limit   = 20,
): Promise<MediaSearchResult> {
  const data = await apiGet<PlexHubResponse>('/hubs/search', {
    query,
    limit:                String(limit),
    includeExternalMedia: '0',
    sectionId:            '',
  });

  const result: MediaSearchResult = {
    tracks: [], albums: [], artists: [], playlists: [],
    totalTracks: 0, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0,
  };

  const hubs = data.MediaContainer?.Hub ?? [];

  for (const hub of hubs) {
    const items = hub.Metadata ?? [];
    if (hub.type === 'track' && types.some(t => t === 'track' || t === 'tracks')) {
      result.tracks      = items.slice(offset).map(normalizeTrack);
      result.totalTracks = hub.size;
    } else if (hub.type === 'album' && types.some(t => t === 'album' || t === 'albums')) {
      result.albums      = items.slice(offset).map(normalizeAlbum);
      result.totalAlbums = hub.size;
    } else if (hub.type === 'artist' && types.some(t => t === 'artist' || t === 'artists')) {
      result.artists      = items.slice(offset).map(normalizeArtist);
      result.totalArtists = hub.size;
    }
  }

  return result;
}

export async function getPlexHomeSections(): Promise<HomeSection[]> {
  const sections: HomeSection[] = [];
  try {
    const data = await apiGet<PlexChildrenResponse>('/playlists', { playlistType: 'audio' });
    const pls = (data.MediaContainer?.Metadata ?? []).map(normalizePlexPlaylist);
    if (pls.length) sections.push({ id: 'playlists', title: 'Wiedergabelisten', type: 'playlists', items: pls });
  } catch {}
  try {
    const data = await apiGet<PlexChildrenResponse>('/library/recentlyAdded', { type: '9', 'X-Plex-Container-Size': '20' });
    const albums = (data.MediaContainer?.Metadata ?? []).filter(i => i.type === 'album').map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'recent', title: 'Zuletzt hinzugefügt', type: 'albums', items: albums });
  } catch {}
  return sections;
}

export async function getPlexPlaylistTracks(playlistId: string): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>(`/playlists/${playlistId}/items`);
  const items = (data.MediaContainer?.Metadata ?? []).filter(i => i.type === 'track');
  return { tracks: items.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: items.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function browsePlexAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>('/library/all', {
    type: '9', sort: 'titleSort:asc',
    'X-Plex-Container-Start': String(offset),
    'X-Plex-Container-Size':  String(limit),
  });
  const items = (data.MediaContainer?.Metadata ?? []).map(normalizeAlbum);
  const total = data.MediaContainer?.totalSize ?? items.length;
  return { tracks: [], albums: items, artists: [], playlists: [], totalTracks: 0, totalAlbums: total, totalArtists: 0, totalPlaylists: 0 };
}

export async function browsePlexArtists(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>('/library/all', {
    type: '8', sort: 'titleSort:asc',
    'X-Plex-Container-Start': String(offset),
    'X-Plex-Container-Size':  String(limit),
  });
  const items = (data.MediaContainer?.Metadata ?? []).map(normalizeArtist);
  const total = data.MediaContainer?.totalSize ?? items.length;
  return { tracks: [], albums: [], artists: items, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: total, totalPlaylists: 0 };
}

export async function browsePlexTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<PlexChildrenResponse>('/library/all', {
    type: '10', sort: 'titleSort:asc',
    'X-Plex-Container-Start': String(offset),
    'X-Plex-Container-Size':  String(limit),
  });
  const items = (data.MediaContainer?.Metadata ?? []).map(normalizeTrack);
  const total = data.MediaContainer?.totalSize ?? items.length;
  return { tracks: items, albums: [], artists: [], playlists: [], totalTracks: total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}
