import { createHash, randomBytes } from 'crypto';
import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, MediaSearchResult, HomeSection } from '../types/media.js';

// ---- Typen ----

interface SubSong {
  id: string; title: string; artist?: string; album?: string; albumId?: string;
  coverArt?: string; duration?: number; track?: number; discNumber?: number;
  isVideo?: boolean; year?: number;
}
interface SubAlbum {
  id: string; name: string; artist?: string; artistId?: string;
  coverArt?: string; year?: number; songCount?: number; duration?: number;
}
interface SubArtist { id: string; name: string; coverArt?: string; albumCount?: number }
interface SubPlaylist { id: string; name: string; comment?: string; coverArt?: string; songCount?: number; owner?: string; public?: boolean }
interface SubSearch3Response { searchResult3?: { song?: SubSong[]; album?: SubAlbum[]; artist?: SubArtist[] } }
interface SubGetAlbumResponse  { album?:  SubAlbum  & { song?:  SubSong[]  } }
interface SubGetArtistResponse { artist?: SubArtist & { album?: SubAlbum[] } }
interface SubAlbumListResponse { albumList2?: { album?: SubAlbum[] } }
interface SubGenre { songCount: number; albumCount: number; value: string }
interface SubGenresResponse { genres?: { genre?: SubGenre[] } }
interface SubRandomSongsResponse { randomSongs?: { song?: SubSong[] } }
interface SubPlaylistsResponse { playlists?: { playlist?: SubPlaylist[] } }
interface SubPlaylistDetailResponse { playlist?: SubPlaylist & { entry?: SubSong[] } }
interface SubArtistsResponse { artists?: { index?: Array<{ name: string; artist?: SubArtist[] }> } }
interface SubIndexArtist { id: string; name: string; artistImageUrl?: string; albumCount?: number }
interface SubIndexesResponse { indexes?: { index?: Array<{ name: string; artist?: SubIndexArtist[] }> } }
interface SubDirChild { id: string; isDir?: boolean; title?: string; album?: string; artist?: string; year?: number; coverArt?: string; duration?: number; track?: number; discNumber?: number }
interface SubMusicDirectoryResponse { directory?: { id: string; name: string; child?: SubDirChild[] } }

// ---- Factory ----

export interface SubsonicCfg {
  baseUrl:     string;
  username:    string;
  password:    string;
  clientName:  string;
  serviceName: string; // 'subsonic' | 'navidrome' | 'madsonic' | 'airsonic' | ...
  responseKey?: string;           // 'subsonic-response' | 'madsonic-response'
  apiVersion?:  string;           // default '1.16.1'; Airsonic braucht '1.15.0'
  musicFolderId?: string;         // ID der gewählten Musikbibliothek (leer = alle)
  artistCoverViaCoverArt?: boolean; // true → getCoverArt statt artistImageUrl (Madsonic-Modus)
  useArtistsEndpoint?: boolean;   // true → getArtists (ID3) statt getIndexes (Airsonic)
  usePlainAuth?: boolean;         // true → p=password statt t+s Token-Auth (Airsonic)
}

export function createSubsonicService(cfg: SubsonicCfg) {
  function authParams(): Record<string, string> {
    const base = { u: cfg.username, v: cfg.apiVersion ?? '1.16.1', c: cfg.clientName, f: 'json' };
    if (cfg.usePlainAuth) return { ...base, p: cfg.password };
    const salt  = randomBytes(8).toString('hex');
    const token = createHash('md5').update(cfg.password + salt).digest('hex');
    return { ...base, t: token, s: salt };
  }

  async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${cfg.baseUrl}/rest/${endpoint}`);
    Object.entries({ ...authParams(), ...(params ?? {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
    const resp = await logFetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`${cfg.serviceName} API error: HTTP ${resp.status} ${endpoint}`);
    const body = await resp.json() as Record<string, Record<string, unknown>>;
    const key  = cfg.responseKey ?? 'subsonic-response';
    const sr   = body[key] ?? body['subsonic-response'] ?? body['madsonic-response'] ?? body['airsonic-response'];
    if (!sr) throw new Error(`${cfg.serviceName}: unbekanntes Response-Format (keys: ${Object.keys(body).join(', ')})`);
    if (sr['status'] !== 'ok') {
      const err = sr['error'] as { code: number; message: string } | undefined;
      throw new Error(`${cfg.serviceName} error ${err?.code}: ${err?.message}`);
    }
    return sr as unknown as T;
  }

  function directCoverUrl(id?: string): string {
    if (!id) return '';
    const url = new URL(`${cfg.baseUrl}/rest/getCoverArt`);
    Object.entries({ ...authParams(), id, size: '320' }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  function directArtistImageUrl(id: string): string {
    const url = new URL(`${cfg.baseUrl}/artistImage.view`);
    Object.entries({ ...authParams(), id }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  function proxyPath(id?: string): string {
    if (!id) return '';
    return `/${cfg.serviceName}/cover/${encodeURIComponent(id)}`;
  }

  // musicFolderId-Param wenn konfiguriert
  function mfid(): Record<string, string> {
    return cfg.musicFolderId ? { musicFolderId: cfg.musicFolderId } : {};
  }

  function normalizeTrack(s: SubSong): MediaTrack {
    return {
      id: s.id, title: s.title, artistName: s.artist ?? '', albumTitle: s.album ?? '',
      albumId: s.albumId ?? '', coverUrl: proxyPath(s.coverArt ?? s.albumId),
      durationMs: (s.duration ?? 0) * 1000, trackNumber: s.track ?? 0, discNumber: s.discNumber ?? 1,
      explicit: false, popularity: 0, service: cfg.serviceName, serviceUrl: '', previewUrl: '', isrc: '',
    };
  }

  function normalizeAlbum(a: SubAlbum): MediaAlbum {
    return {
      id: a.id, title: a.name, artistName: a.artist ?? '', coverUrl: proxyPath(a.coverArt || a.id),
      releaseDate: a.year ? String(a.year) : '', trackCount: a.songCount ?? 0,
      durationMs: (a.duration ?? 0) * 1000, explicit: false, popularity: 0,
      service: cfg.serviceName, serviceUrl: '',
    };
  }

  function normalizeArtist(a: SubArtist): MediaArtist {
    return {
      id: a.id, name: a.name, imageUrl: proxyPath(a.coverArt),
      popularity: 0, genres: [], service: cfg.serviceName, serviceUrl: '',
      albumCount: a.albumCount,
    };
  }

  function normalizePlaylist(p: SubPlaylist): MediaPlaylist {
    return {
      id: p.id, title: p.name, description: p.comment ?? '',
      coverUrl: proxyPath(p.coverArt ?? ''), trackCount: p.songCount ?? 0,
      isPublic: p.public ?? false, owner: p.owner ?? '', service: cfg.serviceName,
    };
  }

  return {
    getCoverArtDirectUrl(id: string): string {
      return directCoverUrl(id);
    },

    getArtistImageDirectUrl(id: string): string {
      return directArtistImageUrl(id);
    },

    async getMusicFolders(): Promise<{ id: string; name: string }[]> {
      interface SubMusicFoldersResponse { musicFolders?: { musicFolder?: { id: string; name: string }[] } }
      const data = await apiGet<SubMusicFoldersResponse>('getMusicFolders', {});
      return data.musicFolders?.musicFolder ?? [];
    },

    getStreamUrl(id: string, format = 'mp3'): string {
      const url = new URL(`${cfg.baseUrl}/rest/stream`);
      Object.entries({ ...authParams(), id, format }).forEach(([k, v]) => url.searchParams.set(k, v));
      return url.toString();
    },

    async getAlbumTracks(albumId: string): Promise<MediaSearchResult> {
      const data = await apiGet<SubGetAlbumResponse>('getAlbum', { id: albumId });
      const songs = data.album?.song ?? [];
      return { tracks: songs.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: songs.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
    },

    async getArtistAlbums(artistId: string): Promise<MediaSearchResult> {
      const data = await apiGet<SubGetArtistResponse>('getArtist', { id: artistId });
      const albums = data.artist?.album ?? [];
      return { tracks: [], albums: albums.map(normalizeAlbum), artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
    },

    async getArtistAlbumsFromDirectory(artistId: string): Promise<MediaSearchResult> {
      const data = await apiGet<SubMusicDirectoryResponse>('getMusicDirectory', { id: artistId });
      const children = (data.directory?.child ?? []).filter(c => c.isDir);
      const albums: MediaAlbum[] = children.map(c => ({
        id: c.id, title: c.title ?? c.album ?? '', artistName: c.artist ?? '',
        coverUrl: proxyPath(c.coverArt ?? c.id),
        releaseDate: c.year ? String(c.year) : '', trackCount: 0, durationMs: 0,
        explicit: false, popularity: 0, service: cfg.serviceName, serviceUrl: '',
      }));
      return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
    },

    async getAlbumTracksFromDirectory(albumId: string): Promise<MediaSearchResult> {
      const data = await apiGet<SubMusicDirectoryResponse>('getMusicDirectory', { id: albumId });
      const children = (data.directory?.child ?? []).filter(c => !c.isDir);
      const tracks: MediaTrack[] = children.map(c => ({
        id: c.id, title: c.title ?? '', artistName: c.artist ?? '', albumTitle: c.album ?? '',
        albumId, coverUrl: proxyPath(c.coverArt ?? albumId),
        durationMs: (c.duration ?? 0) * 1000, trackNumber: c.track ?? 0, discNumber: c.discNumber ?? 1,
        explicit: false, popularity: 0, service: cfg.serviceName, serviceUrl: '', previewUrl: '', isrc: '',
      }));
      return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
    },

    async getHomeSections(): Promise<HomeSection[]> {
      const sections: HomeSection[] = [];
      try {
        const data = await apiGet<SubPlaylistsResponse>('getPlaylists');
        const pls = (data.playlists?.playlist ?? []).map(normalizePlaylist);
        if (pls.length) sections.push({ id: 'playlists', title: 'Wiedergabelisten', type: 'playlists', items: pls });
      } catch {}
      try {
        const data = await apiGet<SubAlbumListResponse>('getAlbumList2', { type: 'newest', size: '20', ...mfid() });
        const albums = (data.albumList2?.album ?? []).map(normalizeAlbum);
        if (albums.length) sections.push({ id: 'newest', title: 'Neu hinzugefügt', type: 'albums', items: albums });
      } catch {}
      try {
        const data = await apiGet<SubAlbumListResponse>('getAlbumList2', { type: 'random', size: '20', ...mfid() });
        const albums = (data.albumList2?.album ?? []).map(normalizeAlbum);
        if (albums.length) sections.push({ id: 'random_albums', title: 'Zufällige Alben', type: 'albums', items: albums });
      } catch {}
      try {
        const data = await apiGet<SubRandomSongsResponse>('getRandomSongs', { size: '20', ...mfid() });
        const tracks = (data.randomSongs?.song ?? []).map(normalizeTrack);
        if (tracks.length) sections.push({ id: 'random_tracks', title: 'Zufällige Titel', type: 'tracks', items: tracks });
      } catch {}
      return sections;
    },

    async getPlaylistTracks(id: string): Promise<MediaSearchResult> {
      const data = await apiGet<SubPlaylistDetailResponse>('getPlaylist', { id });
      const songs = data.playlist?.entry ?? [];
      return { tracks: songs.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: songs.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
    },

    async getGenres(): Promise<string[]> {
      const data = await apiGet<SubGenresResponse>('getGenres', {});
      return (data.genres?.genre ?? [])
        .filter(g => g.albumCount > 0)
        .sort((a, b) => b.albumCount - a.albumCount)
        .map(g => g.value);
    },

    async discover(
      type: string,
      opts: { fromYear?: number; toYear?: number; genre?: string; limit?: number } = {},
    ): Promise<MediaSearchResult> {
      const { limit = 20, fromYear, toYear, genre } = opts;
      const params: Record<string, string> = { type, size: String(limit), ...mfid() };
      if (type === 'byYear') {
        params.fromYear = String(fromYear ?? 1980);
        params.toYear   = String(toYear   ?? 1989);
      }
      if (type === 'byGenre' && genre) params.genre = genre;
      const data   = await apiGet<SubAlbumListResponse>('getAlbumList2', params);
      const albums = (data.albumList2?.album ?? []).map(normalizeAlbum);
      return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: albums.length, totalArtists: 0, totalPlaylists: 0 };
    },

    async browseAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
      const data = await apiGet<SubAlbumListResponse>('getAlbumList2', {
        type: 'alphabeticalByName', size: String(limit), offset: String(offset), ...mfid(),
      });
      const albums = (data.albumList2?.album ?? []).map(normalizeAlbum);
      const total  = albums.length < limit ? offset + albums.length : offset + albums.length + 1;
      return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: total, totalArtists: 0, totalPlaylists: 0 };
    },

    async browseArtists(offset = 0, limit = 200): Promise<MediaSearchResult> {
      if (cfg.useArtistsEndpoint) {
        // ID3-basierter Modus: getArtists → echte Künstler unabhängig von Ordnerstruktur (Airsonic)
        const data = await apiGet<SubArtistsResponse>('getArtists', mfid());
        const all  = (data.artists?.index ?? []).flatMap(idx => idx.artist ?? []);
        const page = all.slice(offset, offset + limit);
        const artists: MediaArtist[] = page.map(a => ({
          id: a.id, name: a.name,
          imageUrl: cfg.artistCoverViaCoverArt ? proxyPath(a.coverArt || a.id) : '',
          popularity: 0, genres: [], service: cfg.serviceName, serviceUrl: '',
          albumCount: a.albumCount,
        }));
        return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: all.length, totalPlaylists: 0 };
      }
      // Filesystem-Modus: getIndexes → Verzeichnis-IDs (Subsonic/Navidrome/Madsonic)
      const data = await apiGet<SubIndexesResponse>('getIndexes', mfid());
      const all  = (data.indexes?.index ?? []).flatMap(idx => idx.artist ?? []);
      const page = all.slice(offset, offset + limit);
      const artists: MediaArtist[] = page.map(a => ({
        id: a.id, name: a.name,
        imageUrl: cfg.artistCoverViaCoverArt
          ? proxyPath(a.id)           // getCoverArt mit Filesystem-ID (Madsonic-Modus)
          : (a.artistImageUrl || ''), // absolute URL (Fanart.tv) oder leer → CSS-Placeholder
        popularity: 0, genres: [], service: cfg.serviceName, serviceUrl: '',
        albumCount: a.albumCount,
      }));
      return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: all.length, totalPlaylists: 0 };
    },

    async browseTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
      const data   = await apiGet<SubRandomSongsResponse>('getRandomSongs', { size: String(limit), ...mfid() });
      const tracks = (data.randomSongs?.song ?? []).map(normalizeTrack);
      return { tracks, albums: [], artists: [], playlists: [], totalTracks: tracks.length, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
    },

    async search(query: string, types = ['song', 'album', 'artist'], offset = 0, limit = 20): Promise<MediaSearchResult> {
      const wantSongs   = types.some(t => ['song', 'track', 'tracks', 'songs'].includes(t));
      const wantAlbums  = types.some(t => ['album', 'albums'].includes(t));
      const wantArtists = types.some(t => ['artist', 'artists'].includes(t));
      const data = await apiGet<SubSearch3Response>('search3', {
        query,
        songCount:    wantSongs   ? String(limit) : '0',
        albumCount:   wantAlbums  ? String(limit) : '0',
        artistCount:  wantArtists ? String(limit) : '0',
        songOffset:   String(offset),
        albumOffset:  String(offset),
        artistOffset: String(offset),
        ...mfid(),
      });
      const sr = data.searchResult3 ?? {};
      return {
        tracks:         (sr.song   ?? []).map(normalizeTrack),
        albums:         (sr.album  ?? []).map(normalizeAlbum),
        artists:        (sr.artist ?? []).map(normalizeArtist),
        playlists:      [],
        totalTracks:    (sr.song   ?? []).length,
        totalAlbums:    (sr.album  ?? []).length,
        totalArtists:   (sr.artist ?? []).length,
        totalPlaylists: 0,
      };
    },
  };
}

// ---- Subsonic-Instanz (config.subsonic) ----

const svc = createSubsonicService({
  ...config.subsonic,
  serviceName:        'subsonic',
  useArtistsEndpoint: true, // ID3-Modus: konsistente IDs für Browse und Artist-Navigation; Cover via Deezer
});

export const searchSubsonic               = svc.search.bind(svc);
export const getSubsonicStreamUrl         = svc.getStreamUrl.bind(svc);
export const getSubsonicAlbumTracks       = svc.getAlbumTracks.bind(svc);         // ID3-basiert
export const getSubsonicArtistAlbums      = svc.getArtistAlbums.bind(svc);        // ID3-basiert
export const getSubsonicCoverArtDirectUrl      = svc.getCoverArtDirectUrl.bind(svc);
export const getSubsonicArtistImageDirectUrl   = svc.getArtistImageDirectUrl.bind(svc);
export const getSubsonicHomeSections      = svc.getHomeSections.bind(svc);
export const getSubsonicPlaylistTracks    = svc.getPlaylistTracks.bind(svc);
export const browseSubsonicAlbums         = svc.browseAlbums.bind(svc);
export const browseSubsonicArtists        = svc.browseArtists.bind(svc);
export const browseSubsonicTracks         = svc.browseTracks.bind(svc);
export const discoverSubsonic             = svc.discover.bind(svc);
export const getSubsonicGenres            = svc.getGenres.bind(svc);
export const getSubsonicMusicFolders      = svc.getMusicFolders.bind(svc);
