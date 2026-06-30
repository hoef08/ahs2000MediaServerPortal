import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import { createHash, randomBytes } from 'crypto';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, HomeSection, MediaSearchResult } from '../types/media.js';

// ---- Typen ----

interface SubSong {
  id: string; title: string; artist?: string; album?: string; albumId?: string;
  coverArt?: string; duration?: number; track?: number; discNumber?: number;
}
interface SubAlbum {
  id: string; name: string; artist?: string; artistId?: string;
  coverArt?: string; year?: number; songCount?: number; duration?: number;
}
interface SubPlaylist {
  id: string; name: string; comment?: string; coverArt?: string;
  songCount?: number; owner?: string; public?: boolean;
}
interface SubArtist { id: string; name: string; coverArt?: string; albumCount?: number }
interface SubIndexArtist { id: string; name: string; albumCount?: number }
interface SubDirChild { id: string; isDir?: boolean; title?: string; album?: string; artist?: string; year?: number; coverArt?: string; duration?: number; track?: number; discNumber?: number }

interface Mad2MostPlayedResponse { mostplayedSongs?: { song?: SubSong[] } }
interface Mad2LastPlayedResponse { lastplayedSongs?: { song?: SubSong[] } }
interface Mad2TopPlayedResponse  { topplayedSongs?:  { song?: SubSong[] } }
interface Mad2AlbumListID3Response { albumListID3?: { album?: SubAlbum[] } }
interface Mad2PlaylistsResponse    { playlists?:    { playlist?: SubPlaylist[] } }
interface Mad2PlaylistDetailResponse { playlist?: SubPlaylist & { entry?: SubSong[] } }
interface Mad2IndexesResponse    { indexes?: { index?: Array<{ name: string; artist?: SubIndexArtist[] }> } }
interface Mad2SearchID3Response  { searchResultID3?: { song?: SubSong[]; album?: SubAlbum[]; artist?: SubArtist[] } }
interface Mad2DirResponse        { directory?: { id: string; name: string; child?: SubDirChild[] } }
interface Mad2GenresResponse     { genres?: { genre?: Array<{ value: string }> } }
interface Mad2MusicFoldersResponse { musicFolders?: { musicFolder?: Array<{ id: string; name?: string }> } }
interface Mad2RandomSongsResponse  { randomSongs?: { song?: SubSong[] } }

// ---- Basis-HTTP ----

function authParams(): Record<string, string> {
  const salt  = randomBytes(8).toString('hex');
  const token = createHash('md5').update(config.madsonic.password + salt).digest('hex');
  return { u: config.madsonic.username, t: token, s: salt, v: config.madsonic.apiVersion, c: config.madsonic.clientName, f: 'json' };
}

async function mad2Get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${config.madsonic.baseUrl}/rest2/${endpoint}`);
  Object.entries({ ...authParams(), ...(params ?? {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await logFetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Madsonic v2 API error: HTTP ${resp.status} ${endpoint}`);
  const body = await resp.json() as Record<string, Record<string, unknown>>;
  const sr   = body['madsonic-response'] ?? body['subsonic-response'];
  if (!sr || sr['status'] !== 'ok') {
    const err = sr?.['error'] as { code: number; message: string } | undefined;
    throw new Error(`Madsonic v2 error ${err?.code}: ${err?.message}`);
  }
  return sr as unknown as T;
}

// ---- Normalisierung ----

function proxyPath(id?: string): string {
  return id ? `/madsonic/cover/${encodeURIComponent(id)}` : '';
}

function normalizeTrack(s: SubSong): MediaTrack {
  return {
    id: s.id, title: s.title, artistName: s.artist ?? '', albumTitle: s.album ?? '',
    albumId: s.albumId ?? '', coverUrl: proxyPath(s.albumId ? `al-${s.albumId}` : (s.coverArt ?? s.id)) + '?size=300',
    durationMs: (s.duration ?? 0) * 1000, trackNumber: s.track ?? 0, discNumber: s.discNumber ?? 1,
    explicit: false, popularity: 0, service: 'madsonic', serviceUrl: '', previewUrl: '', isrc: '',
  };
}

function normalizeAlbum(a: SubAlbum): MediaAlbum {
  return {
    id: a.id, title: a.name, artistName: a.artist ?? '', coverUrl: proxyPath(a.coverArt || a.id),
    releaseDate: a.year ? String(a.year) : '', trackCount: a.songCount ?? 0,
    durationMs: (a.duration ?? 0) * 1000, explicit: false, popularity: 0,
    service: 'madsonic', serviceUrl: '',
  };
}

function normalizePlaylist(p: SubPlaylist): MediaPlaylist {
  return {
    id: p.id, title: p.name, description: p.comment ?? '',
    coverUrl: proxyPath(p.coverArt ?? ''), trackCount: p.songCount ?? 0,
    isPublic: p.public ?? false, owner: p.owner ?? '', service: 'madsonic',
  };
}

// ---- Stream-URL ----

export function getMadsonicStreamUrl(id: string, format = 'mp3'): string {
  const url = new URL(`${config.madsonic.baseUrl}/rest2/stream`);
  Object.entries({ ...authParams(), id, format }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

// ---- Cover-URL ----

export function buildMadsonicCoverUrl(id: string, size?: string): string {
  const url = new URL(`${config.madsonic.baseUrl}/rest2/getCoverArt`);
  Object.entries(authParams()).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('id', id);
  if (size) url.searchParams.set('size', size);
  return url.toString();
}

// ---- Home-Sections ----

export async function getMadsonicHomeSections(): Promise<HomeSection[]> {
  const sections: HomeSection[] = [];

  try {
    const data = await mad2Get<Mad2PlaylistsResponse>('getPlaylists');
    const pls = (data.playlists?.playlist ?? []).map(normalizePlaylist);
    if (pls.length) sections.push({ id: 'playlists', title: 'Wiedergabelisten', type: 'playlists', items: pls });
  } catch {}

  try {
    const data = await mad2Get<Mad2MostPlayedResponse>('getMostplayedSongs', { count: '20' });
    const tracks = (data.mostplayedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'most_played', title: 'Meistgespielt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await mad2Get<Mad2LastPlayedResponse>('getLastplayedSongs', { count: '20' });
    const tracks = (data.lastplayedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'last_played', title: 'Zuletzt gespielt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await mad2Get<Mad2TopPlayedResponse>('getTopplayedSongs', { count: '20' });
    const tracks = (data.topplayedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'top_played', title: 'Top gespielt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await mad2Get<Mad2AlbumListID3Response>('getAlbumListID3', { type: 'random', size: '20' });
    const albums = (data.albumListID3?.album ?? []).map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'random_albums', title: 'Zufällige Alben', type: 'albums', items: albums });
  } catch {}

  return sections;
}

// ---- Künstler-Browse ----

export async function browseMadsonicArtists(offset = 0, limit = 200): Promise<MediaSearchResult> {
  const idxData = await mad2Get<Mad2IndexesResponse>('getIndexes', { musicFolderId: config.madsonic.musicFolderId ?? '0' });
  const all  = (idxData.indexes?.index ?? []).flatMap(idx => idx.artist ?? []);
  const page = all.slice(offset, offset + limit);

  const albumCountMap = new Map<string, number>();
  await Promise.all(
    page.map(a =>
      mad2Get<Mad2DirResponse>('getMusicDirectory', { id: a.id })
        .then(d => albumCountMap.set(a.id, (d.directory?.child ?? []).filter(c => c.isDir).length))
        .catch(() => {})
    )
  );

  const artists: MediaArtist[] = page.map(a => ({
    id: a.id, name: a.name,
    imageUrl: `${proxyPath(a.id)}?size=300`,
    popularity: 0, genres: [], service: 'madsonic', serviceUrl: '',
    albumCount: albumCountMap.get(a.id) ?? a.albumCount,
  }));

  return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: all.length, totalPlaylists: 0 };
}

// ---- Alben-Browse ----

export async function browseMadsonicAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await mad2Get<Mad2AlbumListID3Response>('getAlbumListID3', {
    type: 'alphabeticalByName', size: String(limit), offset: String(offset),
  });
  const albums = (data.albumListID3?.album ?? []).map(normalizeAlbum);
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Tracks-Browse ----

export async function browseMadsonicTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await mad2Get<Mad2RandomSongsResponse>('getRandomSongs', {
    size: String(limit), ...(config.madsonic.musicFolderId ? { musicFolderId: config.madsonic.musicFolderId } : {}),
  });
  const tracks = (data.randomSongs?.song ?? []).slice(offset, offset + limit).map(normalizeTrack);
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Künstler-Alben ----

export async function getMadsonicArtistAlbums(artistId: string): Promise<MediaSearchResult> {
  const data = await mad2Get<Mad2DirResponse>('getMusicDirectory', { id: artistId });
  const children = (data.directory?.child ?? []).filter(c => c.isDir);
  const albums: MediaAlbum[] = children.map(c => ({
    id: c.id, title: c.title ?? c.album ?? '', artistName: c.artist ?? '',
    coverUrl: proxyPath(c.coverArt ?? c.id),
    releaseDate: c.year ? String(c.year) : '', trackCount: 0, durationMs: 0,
    explicit: false, popularity: 0, service: 'madsonic', serviceUrl: '',
  }));
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Album-Tracks ----

export async function getMadsonicAlbumTracks(albumId: string): Promise<MediaSearchResult> {
  const data = await mad2Get<Mad2DirResponse>('getMusicDirectory', { id: albumId });
  const children = (data.directory?.child ?? []).filter(c => !c.isDir);
  const tracks: MediaTrack[] = children.map(c => ({
    id: c.id, title: c.title ?? '', artistName: c.artist ?? '', albumTitle: c.album ?? '',
    albumId, coverUrl: proxyPath(c.coverArt ?? albumId),
    durationMs: (c.duration ?? 0) * 1000, trackNumber: c.track ?? 0, discNumber: c.discNumber ?? 1,
    explicit: false, popularity: 0, service: 'madsonic', serviceUrl: '', previewUrl: '', isrc: '',
  }));
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Playlist-Tracks ----

export async function getMadsonicPlaylistTracks(playlistId: string): Promise<MediaSearchResult> {
  const data = await mad2Get<Mad2PlaylistDetailResponse>('getPlaylist', { id: playlistId });
  const tracks = (data.playlist?.entry ?? []).map(normalizeTrack);
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Suche ----

export async function searchMadsonic(query: string, types = ['song', 'album', 'artist'], offset = 0, limit = 20): Promise<MediaSearchResult> {
  const wantSongs   = types.some(t => ['song', 'track', 'tracks', 'songs'].includes(t));
  const wantAlbums  = types.some(t => ['album', 'albums'].includes(t));
  const wantArtists = types.some(t => ['artist', 'artists'].includes(t));
  const data = await mad2Get<Mad2SearchID3Response>('searchID3', {
    query,
    songCount:    wantSongs   ? String(limit) : '0',
    albumCount:   wantAlbums  ? String(limit) : '0',
    artistCount:  wantArtists ? String(limit) : '0',
    songOffset:   String(offset),
    albumOffset:  String(offset),
    artistOffset: String(offset),
  });
  const sr = data.searchResultID3 ?? {};
  return {
    tracks:   (sr.song   ?? []).map(normalizeTrack),
    albums:   (sr.album  ?? []).map(normalizeAlbum),
    artists:  (sr.artist ?? []).map(a => ({
      id: a.id, name: a.name,
      imageUrl: `${proxyPath(a.coverArt || a.id)}?size=300`,
      popularity: 0, genres: [], service: 'madsonic', serviceUrl: '',
      albumCount: a.albumCount,
    })),
    playlists: [],
    totalTracks: (sr.song ?? []).length, totalAlbums: (sr.album ?? []).length,
    totalArtists: (sr.artist ?? []).length, totalPlaylists: 0,
  };
}

// ---- Entdecken ----

export async function discoverMadsonic(type: string, opts: { limit?: number; fromYear?: number; toYear?: number; genre?: string } = {}): Promise<MediaSearchResult> {
  const limit = String(opts.limit ?? 20);

  if (type === 'random') {
    const data = await mad2Get<Mad2RandomSongsResponse>('getRandomSongs', {
      size: limit, ...(config.madsonic.musicFolderId ? { musicFolderId: config.madsonic.musicFolderId } : {}),
    });
    const tracks = (data.randomSongs?.song ?? []).map(normalizeTrack);
    return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
  }

  const albumTypeMap: Record<string, string> = {
    newest: 'newest', frequent: 'frequent', recent: 'recent', starred: 'starred',
    byYear: 'byYear', byGenre: 'byGenre',
  };
  const albumType = albumTypeMap[type] ?? 'alphabeticalByName';
  const params: Record<string, string> = { type: albumType, size: limit };
  if (opts.fromYear != null) params['fromYear'] = String(opts.fromYear);
  if (opts.toYear   != null) params['toYear']   = String(opts.toYear);
  if (opts.genre)             params['genre']    = opts.genre;
  if (config.madsonic.musicFolderId) params['musicFolderId'] = config.madsonic.musicFolderId;

  const data = await mad2Get<Mad2AlbumListID3Response>('getAlbumListID3', params);
  const albums = (data.albumListID3?.album ?? []).map(normalizeAlbum);
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
}

// ---- Genres ----

export async function getMadsonicGenres(): Promise<string[]> {
  const data = await mad2Get<Mad2GenresResponse>('getGenres');
  return (data.genres?.genre ?? []).map(g => g.value).filter(Boolean).sort();
}

// ---- Musikbibliotheken ----

export async function getMadsonicMusicFolders(): Promise<{ id: string; name: string }[]> {
  const data = await mad2Get<Mad2MusicFoldersResponse>('getMusicFolders');
  return (data.musicFolders?.musicFolder ?? []).map(f => ({ id: String(f.id), name: f.name ?? String(f.id) }));
}
