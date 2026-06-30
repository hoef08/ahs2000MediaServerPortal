import { getSpotifyToken } from '../auth/spotify.js';
import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, MediaSearchResult, HomeSection } from '../types/media.js';

const BASE = 'https://api.spotify.com/v1';

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getSpotifyToken();
  const url   = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await logFetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Spotify API error: HTTP ${resp.status} ${path} — ${body}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

interface SpImage { url: string; width: number; height: number }
interface SpArtistRef { id: string; name: string }

function coverUrl(images?: SpImage[]): string {
  return images?.[0]?.url ?? '';
}

function normalizeTrack(t: Record<string, unknown>): MediaTrack {
  const artists = (t['artists'] as SpArtistRef[] | undefined) ?? [];
  const album   = (t['album']   as Record<string, unknown> | undefined) ?? {};
  return {
    id:          t['id'] as string,
    title:       t['name'] as string,
    artistName:  artists[0]?.name ?? '',
    albumTitle:  album['name'] as string ?? '',
    albumId:     album['id']   as string ?? '',
    coverUrl:    coverUrl((album['images'] as SpImage[] | undefined)),
    durationMs:  (t['duration_ms'] as number | undefined) ?? 0,
    trackNumber: (t['track_number'] as number | undefined) ?? 0,
    discNumber:  (t['disc_number']  as number | undefined) ?? 1,
    explicit:    (t['explicit']     as boolean | undefined) ?? false,
    popularity:  (t['popularity']   as number | undefined) ?? 0,
    service:     'spotify',
    serviceUrl:  (t['external_urls'] as Record<string, string> | undefined)?.['spotify'] ?? '',
    previewUrl:  (t['preview_url']  as string | undefined) ?? '',
    isrc:        (t['external_ids'] as Record<string, string> | undefined)?.['isrc'] ?? '',
  };
}

function normalizeAlbum(a: Record<string, unknown>): MediaAlbum {
  const artists = (a['artists'] as SpArtistRef[] | undefined) ?? [];
  return {
    id:          a['id'] as string,
    title:       a['name'] as string,
    artistName:  artists[0]?.name ?? '',
    coverUrl:    coverUrl((a['images'] as SpImage[] | undefined)),
    releaseDate: (a['release_date']  as string | undefined) ?? '',
    trackCount:  (a['total_tracks']  as number | undefined) ?? 0,
    durationMs:  0,
    explicit:    false,
    popularity:  (a['popularity']    as number | undefined) ?? 0,
    service:     'spotify',
    serviceUrl:  (a['external_urls'] as Record<string, string> | undefined)?.['spotify'] ?? '',
  };
}

function normalizeArtist(a: Record<string, unknown>): MediaArtist {
  return {
    id:         a['id'] as string,
    name:       a['name'] as string,
    imageUrl:   coverUrl((a['images'] as SpImage[] | undefined)),
    popularity: (a['popularity'] as number | undefined) ?? 0,
    genres:     (a['genres']     as string[] | undefined) ?? [],
    service:    'spotify',
    serviceUrl: (a['external_urls'] as Record<string, string> | undefined)?.['spotify'] ?? '',
  };
}

function normalizePlaylist(p: Record<string, unknown>): MediaPlaylist {
  const owner  = (p['owner']  as Record<string, unknown> | undefined) ?? {};
  const tracks = (p['tracks'] as Record<string, unknown> | undefined) ?? {};
  return {
    id:          p['id'] as string,
    title:       p['name'] as string,
    description: (p['description'] as string | undefined) ?? '',
    coverUrl:    coverUrl((p['images'] as SpImage[] | undefined)),
    trackCount:  (tracks['total'] as number | undefined) ?? 0,
    isPublic:    (p['public']     as boolean | undefined) ?? false,
    owner:       (owner['display_name'] as string | undefined) ?? '',
    service:     'spotify',
  };
}

// ---------------------------------------------------------------------------
// API-Methoden
// ---------------------------------------------------------------------------

interface Paging<T> { items: T[]; total: number; limit: number; offset: number }

export async function searchSpotify(
  query:  string,
  types   = ['track', 'album', 'artist', 'playlist'],
  offset  = 0,
  limit   = 20,
): Promise<MediaSearchResult> {
  // Spotify erwartet Singular-Typen: track, album, artist, playlist
  const normalizedTypes = types
    .map(t => t.replace(/s$/, ''))
    .join(',');

  const params: Record<string, string> = {
    q: query, type: normalizedTypes,
    offset: String(offset), limit: String(limit),
  };
  if (config.spotify.market) params['market'] = config.spotify.market;

  const data = await apiGet<Record<string, Paging<Record<string, unknown>>>>('/search', params);

  const tracks    = (data['tracks']    as Paging<Record<string, unknown>> | undefined)?.items ?? [];
  const albums    = (data['albums']    as Paging<Record<string, unknown>> | undefined)?.items ?? [];
  const artists   = (data['artists']   as Paging<Record<string, unknown>> | undefined)?.items ?? [];
  const playlists = (data['playlists'] as Paging<Record<string, unknown>> | undefined)?.items ?? [];

  return {
    tracks:         tracks.filter(Boolean).map(normalizeTrack),
    albums:         albums.filter(Boolean).map(normalizeAlbum),
    artists:        artists.filter(Boolean).map(normalizeArtist),
    playlists:      playlists.filter(Boolean).map(normalizePlaylist),
    totalTracks:    (data['tracks']    as Paging<unknown> | undefined)?.total ?? 0,
    totalAlbums:    (data['albums']    as Paging<unknown> | undefined)?.total ?? 0,
    totalArtists:   (data['artists']  as Paging<unknown> | undefined)?.total ?? 0,
    totalPlaylists: (data['playlists'] as Paging<unknown> | undefined)?.total ?? 0,
  };
}

export async function getSpotifyTrack(id: string): Promise<MediaTrack> {
  const t = await apiGet<Record<string, unknown>>(`/tracks/${id}`,
    config.spotify.market ? { market: config.spotify.market } : undefined);
  return normalizeTrack(t);
}

export async function getSpotifyAlbum(id: string): Promise<MediaAlbum> {
  const a = await apiGet<Record<string, unknown>>(`/albums/${id}`,
    config.spotify.market ? { market: config.spotify.market } : undefined);
  return normalizeAlbum(a);
}

export async function getSpotifyArtist(id: string): Promise<MediaArtist> {
  const a = await apiGet<Record<string, unknown>>(`/artists/${id}`);
  return normalizeArtist(a);
}

export async function getSpotifyAlbumTracks(
  albumId: string,
  offset  = 0,
  limit   = 50,
): Promise<MediaSearchResult> {
  const mktParam: Record<string, string> = config.spotify.market ? { market: config.spotify.market } : {};
  // Album-Info für Cover und Titel
  const album   = await apiGet<Record<string, unknown>>(`/albums/${albumId}`, mktParam);
  const albCover  = coverUrl((album['images'] as SpImage[] | undefined));
  const albTitle  = (album['name'] as string | undefined) ?? '';
  const albArtist = ((album['artists'] as SpArtistRef[] | undefined) ?? [])[0]?.name ?? '';

  const data = await apiGet<Paging<Record<string, unknown>>>(`/albums/${albumId}/tracks`, {
    ...mktParam, offset: String(offset), limit: String(limit) } as Record<string, string>);

  const tracks: MediaTrack[] = data.items.filter(Boolean).map(t => {
    const artists = (t['artists'] as SpArtistRef[] | undefined) ?? [];
    return {
      id:          t['id'] as string,
      title:       t['name'] as string,
      artistName:  artists[0]?.name ?? albArtist,
      albumTitle:  albTitle,
      albumId,
      coverUrl:    albCover,
      durationMs:  (t['duration_ms'] as number | undefined) ?? 0,
      trackNumber: (t['track_number'] as number | undefined) ?? 0,
      discNumber:  (t['disc_number']  as number | undefined) ?? 1,
      explicit:    (t['explicit']     as boolean | undefined) ?? false,
      popularity:  0,
      service:     'spotify',
      serviceUrl:  (t['external_urls'] as Record<string, string> | undefined)?.['spotify'] ?? '',
      previewUrl:  (t['preview_url']  as string | undefined) ?? '',
      isrc:        '',
    } satisfies MediaTrack;
  });

  return { tracks, albums: [], artists: [], playlists: [], totalTracks: data.total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function getSpotifyArtistAlbums(
  artistId: string,
  offset   = 0,
  limit    = 50,
): Promise<MediaSearchResult> {
  const params: Record<string, string> = {
    include_groups: 'album,single',
    offset: String(offset),
    limit:  String(limit),
  };
  if (config.spotify.market) params['market'] = config.spotify.market;
  const data = await apiGet<Paging<Record<string, unknown>>>(`/artists/${artistId}/albums`, params);
  return { tracks: [], albums: data.items.filter(Boolean).map(normalizeAlbum), artists: [], playlists: [], totalTracks: 0, totalAlbums: data.total, totalArtists: 0, totalPlaylists: 0 };
}

export async function getSpotifyHomeSections(): Promise<HomeSection[]> {
  const sections: HomeSection[] = [];
  try {
    const data = await apiGet<Paging<Record<string, unknown>>>('/me/playlists', { limit: '20' });
    const pls = (data.items ?? []).filter(Boolean).map(normalizePlaylist);
    if (pls.length) sections.push({ id: 'my_playlists', title: 'Meine Playlisten', type: 'playlists', items: pls });
  } catch {}
  try {
    const data = await apiGet<{ albums: Paging<Record<string, unknown>> }>('/browse/new-releases', { limit: '20' });
    const albums = (data.albums?.items ?? []).filter(Boolean).map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'new_releases', title: 'Neue Veröffentlichungen', type: 'albums', items: albums });
  } catch {}
  try {
    const data = await apiGet<{ playlists: Paging<Record<string, unknown>> }>('/browse/featured-playlists', { limit: '20' });
    const pls = (data.playlists?.items ?? []).filter(Boolean).map(normalizePlaylist);
    if (pls.length) sections.push({ id: 'featured', title: 'Empfohlene Playlisten', type: 'playlists', items: pls });
  } catch {}
  return sections;
}

export async function browseSpotifyAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<Paging<Record<string, unknown>>>('/me/albums', {
    limit: String(limit), offset: String(offset),
  });
  const albums = (data.items ?? [])
    .map(item => (item as Record<string, unknown>)['album'] as Record<string, unknown> | null)
    .filter((a): a is Record<string, unknown> => !!a)
    .map(normalizeAlbum);
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: data.total, totalArtists: 0, totalPlaylists: 0 };
}

export async function browseSpotifyArtists(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<Paging<Record<string, unknown>>>('/me/top/artists', {
    time_range: 'long_term', limit: String(limit), offset: String(offset),
  });
  const artists = (data.items ?? []).filter(Boolean).map(normalizeArtist);
  return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: data.total, totalPlaylists: 0 };
}

export async function browseSpotifyTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<Paging<Record<string, unknown>>>('/me/tracks', {
    limit: String(limit), offset: String(offset),
  });
  const tracks = (data.items ?? [])
    .map(item => (item as Record<string, unknown>)['track'] as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && !!t['id'])
    .map(normalizeTrack);
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: data.total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function getSpotifyPlaylistTracks(playlistId: string, offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<Paging<Record<string, unknown>>>(`/playlists/${playlistId}/tracks`, {
    limit: String(limit), offset: String(offset),
  });
  const tracks: MediaTrack[] = (data.items ?? [])
    .map(item => (item as Record<string, unknown>)['track'] as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && !!t['id'])
    .map(normalizeTrack);
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: data.total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}
