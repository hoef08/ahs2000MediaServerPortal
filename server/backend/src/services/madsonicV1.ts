import { createSubsonicService } from './subsonic.js';
import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import { createHash, randomBytes } from 'crypto';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, HomeSection, MediaSearchResult } from '../types/media.js';

// ---- Madsonic-spezifische Typen ----

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

interface MadSongsResponse      { newaddedSongs?:   { song?: SubSong[] } }
interface MadMostPlayedResponse { mostplayedSongs?: { song?: SubSong[] } }
interface MadLastPlayedResponse { lastplayedSongs?: { song?: SubSong[] } }
interface MadAlbumListResponse  { albumList2?:      { album?: SubAlbum[] } }
interface MadPlaylistsResponse  { playlists?:       { playlist?: SubPlaylist[] } }
interface SubArtist { id: string; name: string; coverArt?: string; albumCount?: number }
interface SubIndexArtist { id: string; name: string; albumCount?: number }
interface MadIndexesResponse { indexes?: { index?: Array<{ name: string; artist?: SubIndexArtist[] }> } }
interface MadSearch3Response { searchResult3?: { song?: SubSong[]; album?: SubAlbum[]; artist?: SubArtist[] } }
interface SubDirChild { id: string; isDir?: boolean; title?: string; album?: string; artist?: string; year?: number; coverArt?: string; duration?: number; track?: number; discNumber?: number }
interface MadMusicDirectoryResponse { directory?: { id: string; name: string; child?: SubDirChild[] } }

// ---- Basis-Service (Subsonic-kompatibel) ----

const base = createSubsonicService({
  ...config.madsonic,
  serviceName: 'madsonic',
  responseKey: 'madsonic-response',
});

// ---- API-Hilfsfunktion ----

function authParams(): Record<string, string> {
  const salt  = randomBytes(8).toString('hex');
  const token = createHash('md5').update(config.madsonic.password + salt).digest('hex');
  return { u: config.madsonic.username, t: token, s: salt, v: config.madsonic.apiVersion, c: config.madsonic.clientName, f: 'json' };
}

async function madGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${config.madsonic.baseUrl}/rest/${endpoint}`);
  Object.entries({ ...authParams(), ...(params ?? {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await logFetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Madsonic API error: HTTP ${resp.status} ${endpoint}`);
  const body = await resp.json() as Record<string, Record<string, unknown>>;
  const sr   = body['madsonic-response'] ?? body['subsonic-response'];
  if (!sr || sr['status'] !== 'ok') {
    const err = sr?.['error'] as { code: number; message: string } | undefined;
    throw new Error(`Madsonic error ${err?.code}: ${err?.message}`);
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
    albumId: s.albumId ?? '', coverUrl: proxyPath(s.coverArt ?? s.albumId),
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

// ---- Home-Sections ----

export async function getMadsonicHomeSections(): Promise<HomeSection[]> {
  const sections: HomeSection[] = [];

  try {
    const data = await madGet<MadPlaylistsResponse>('getPlaylists');
    const pls = (data.playlists?.playlist ?? []).map(normalizePlaylist);
    if (pls.length) sections.push({ id: 'playlists', title: 'Wiedergabelisten', type: 'playlists', items: pls });
  } catch {}

  try {
    const data = await madGet<MadSongsResponse>('getNewAddedSongs', { count: '20' });
    const tracks = (data.newaddedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'new_added', title: 'Neu hinzugefügt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await madGet<MadMostPlayedResponse>('getMostPlayedSongs', { count: '20' });
    const tracks = (data.mostplayedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'most_played', title: 'Meistgespielt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await madGet<MadLastPlayedResponse>('getLastPlayedSongs', { count: '20' });
    const tracks = (data.lastplayedSongs?.song ?? []).map(normalizeTrack);
    if (tracks.length) sections.push({ id: 'last_played', title: 'Zuletzt gespielt', type: 'tracks', items: tracks });
  } catch {}

  try {
    const data = await madGet<MadAlbumListResponse>('getAlbumList2', { type: 'random', size: '20' });
    const albums = (data.albumList2?.album ?? []).map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'random_albums', title: 'Zufällige Alben', type: 'albums', items: albums });
  } catch {}

  return sections;
}

// ---- Künstler-Browse ----

export async function browseMadsonicArtists(offset = 0, limit = 200): Promise<MediaSearchResult> {
  const idxData = await madGet<MadIndexesResponse>('getIndexes', { musicFolderId: config.madsonic.musicFolderId ?? '0' });
  const all  = (idxData.indexes?.index ?? []).flatMap(idx => idx.artist ?? []);
  const page = all.slice(offset, offset + limit);

  const albumCountMap = new Map<string, number>();
  await Promise.all(
    page.map(a =>
      madGet<MadMusicDirectoryResponse>('getMusicDirectory', { id: a.id })
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

// ---- Künstler-Alben ----

export async function getMadsonicArtistAlbums(artistId: string): Promise<MediaSearchResult> {
  try {
    const data = await madGet<MadMusicDirectoryResponse>('getMusicDirectory', { id: artistId });
    const children = (data.directory?.child ?? []).filter(c => c.isDir);
    const albums: MediaAlbum[] = children.map(c => ({
      id: c.id, title: c.title ?? c.album ?? '', artistName: c.artist ?? '',
      coverUrl: proxyPath(c.coverArt ?? c.id),
      releaseDate: c.year ? String(c.year) : '', trackCount: 0, durationMs: 0,
      explicit: false, popularity: 0, service: 'madsonic', serviceUrl: '',
    }));
    return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
  } catch {
    return base.getArtistAlbums(artistId);
  }
}

// ---- Album-Tracks ----

export async function getMadsonicAlbumTracks(albumId: string): Promise<MediaSearchResult> {
  try {
    const data = await madGet<MadMusicDirectoryResponse>('getMusicDirectory', { id: albumId });
    const children = (data.directory?.child ?? []).filter(c => !c.isDir);
    const tracks: MediaTrack[] = children.map(c => ({
      id: c.id, title: c.title ?? '', artistName: c.artist ?? '', albumTitle: c.album ?? '',
      albumId, coverUrl: proxyPath(c.coverArt ?? albumId),
      durationMs: (c.duration ?? 0) * 1000, trackNumber: c.track ?? 0, discNumber: c.discNumber ?? 1,
      explicit: false, popularity: 0, service: 'madsonic', serviceUrl: '', previewUrl: '', isrc: '',
    }));
    return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
  } catch {
    return base.getAlbumTracks(albumId);
  }
}

// ---- Suche ----

export async function searchMadsonic(query: string, types = ['song', 'album', 'artist'], offset = 0, limit = 20): Promise<MediaSearchResult> {
  const wantSongs   = types.some(t => ['song', 'track', 'tracks', 'songs'].includes(t));
  const wantAlbums  = types.some(t => ['album', 'albums'].includes(t));
  const wantArtists = types.some(t => ['artist', 'artists'].includes(t));
  const data = await madGet<MadSearch3Response>('search3', {
    query,
    musicFolderId: config.madsonic.musicFolderId ?? '0',
    songCount:    wantSongs   ? String(limit) : '0',
    albumCount:   wantAlbums  ? String(limit) : '0',
    artistCount:  wantArtists ? String(limit) : '0',
    songOffset:   String(offset),
    albumOffset:  String(offset),
    artistOffset: String(offset),
  });
  const sr = data.searchResult3 ?? {};
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

// ---- Cover-URL ----

export function buildMadsonicCoverUrl(id: string, size?: string): string {
  const url = new URL(`${config.madsonic.baseUrl}/rest/getCoverArt`);
  Object.entries(authParams()).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('id', id);
  if (size) url.searchParams.set('size', size);
  return url.toString();
}

// ---- Re-Exporte aus Subsonic-Factory ----

export const getMadsonicStreamUrl      = base.getStreamUrl.bind(base);
export const getMadsonicPlaylistTracks = base.getPlaylistTracks.bind(base);
export const browseMadsonicAlbums      = base.browseAlbums.bind(base);
export const browseMadsonicTracks      = base.browseTracks.bind(base);
export const discoverMadsonic          = base.discover.bind(base);
export const getMadsonicGenres         = base.getGenres.bind(base);
export const getMadsonicMusicFolders   = base.getMusicFolders.bind(base);
