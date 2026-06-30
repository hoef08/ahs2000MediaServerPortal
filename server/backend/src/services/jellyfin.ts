import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, MediaSearchResult, HomeSection } from '../types/media.js';

const { baseUrl, apiToken, userId } = config.jellyfin;

function authHeaders() {
  return {
    'X-Emby-Token': apiToken,
    Accept: 'application/json',
  };
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(baseUrl + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await logFetch(url.toString(), { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Jellyfin API error: HTTP ${resp.status} ${path}`);
  return resp.json() as Promise<T>;
}

function imageUrl(itemId: string, tag?: string): string {
  if (!tag) return '';
  return `${baseUrl}/Items/${itemId}/Images/Primary?tag=${tag}&maxHeight=320`;
}

interface JfItem {
  Id: string; Name: string; Type: string;
  AlbumId?: string; Album?: string; AlbumPrimaryImageTag?: string;
  AlbumArtist?: string; AlbumArtistId?: string;
  RunTimeTicks?: number; IndexNumber?: number; ParentIndexNumber?: number;
  ProductionYear?: number; ImageTags?: Record<string, string>;
  ExternalUrls?: Array<{ Name: string; Url: string }>;
  PremiereDate?: string; ChildCount?: number; AlbumCount?: number;
  ExtraType?: string;
}

interface JfSearchResult { Items: JfItem[]; TotalRecordCount: number }

function normalizeTrack(i: JfItem): MediaTrack {
  return {
    id:          i.Id,
    title:       i.Name,
    artistName:  i.AlbumArtist ?? '',
    albumTitle:  i.Album ?? '',
    albumId:     i.AlbumId ?? '',
    coverUrl:    imageUrl(i.AlbumId ?? i.Id, i.AlbumPrimaryImageTag ?? i.ImageTags?.['Primary']),
    durationMs:  Math.round((i.RunTimeTicks ?? 0) / 10_000),
    trackNumber: i.IndexNumber ?? 0,
    discNumber:  i.ParentIndexNumber ?? 1,
    explicit:    false,
    popularity:  0,
    service:     'jellyfin',
    serviceUrl:  '',
    previewUrl:  '',
    isrc:        '',
  };
}

function normalizeAlbum(i: JfItem): MediaAlbum {
  return {
    id:          i.Id,
    title:       i.Name,
    artistName:  i.AlbumArtist ?? '',
    coverUrl:    imageUrl(i.Id, i.ImageTags?.['Primary']),
    releaseDate: i.PremiereDate?.substring(0, 10) ?? (i.ProductionYear ? String(i.ProductionYear) : ''),
    trackCount:  i.ChildCount ?? 0,
    durationMs:  0,
    explicit:    false,
    popularity:  0,
    service:     'jellyfin',
    serviceUrl:  '',
  };
}

function normalizeArtist(i: JfItem): MediaArtist {
  return {
    id:         i.Id,
    name:       i.Name,
    imageUrl:   imageUrl(i.Id, i.ImageTags?.['Primary']),
    popularity: 0,
    genres:     [],
    service:    'jellyfin',
    serviceUrl: '',
  };
}

function normalizeJfPlaylist(i: JfItem): MediaPlaylist {
  return {
    id:          i.Id,
    title:       i.Name,
    description: '',
    coverUrl:    imageUrl(i.Id, i.ImageTags?.['Primary']),
    trackCount:  i.ChildCount ?? 0,
    isPublic:    false,
    owner:       '',
    service:     'jellyfin',
  };
}

export function getJellyfinStreamUrl(id: string): string {
  const url = new URL(`${baseUrl}/Audio/${id}/universal`);
  url.searchParams.set('api_key',             apiToken);
  url.searchParams.set('userId',              userId);
  url.searchParams.set('audioCodec',          'mp3');
  url.searchParams.set('container',           'mp3,aac,ogg,flac');
  url.searchParams.set('maxStreamingBitrate', '140000000');
  return url.toString();
}

export async function getJellyfinAlbumTracks(albumId: string, offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Items', {
    parentId: albumId, IncludeItemTypes: 'Audio', Recursive: 'true',
    SortBy: 'IndexNumber', StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });
  return { tracks: data.Items.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: data.TotalRecordCount, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function getJellyfinArtistAlbums(artistId: string, offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Items', {
    albumArtistIds: artistId, IncludeItemTypes: 'MusicAlbum', Recursive: 'true',
    SortBy: 'ProductionYear,SortName', SortOrder: 'Ascending',
    StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });
  return { tracks: [], albums: data.Items.map(normalizeAlbum), artists: [], playlists: [], totalTracks: 0, totalAlbums: data.TotalRecordCount, totalArtists: 0, totalPlaylists: 0 };
}

export async function getJellyfinHomeSections(): Promise<HomeSection[]> {
  const sections: HomeSection[] = [];
  try {
    const data = await apiGet<JfSearchResult>('/Items', {
      IncludeItemTypes: 'Playlist', Recursive: 'true', Limit: '50', UserId: userId,
    });
    const pls = data.Items.filter(i => !i.ExtraType).map(normalizeJfPlaylist);
    if (pls.length) sections.push({ id: 'playlists', title: 'Wiedergabelisten', type: 'playlists', items: pls });
  } catch {}
  try {
    const data = await apiGet<JfSearchResult>('/Items', {
      IncludeItemTypes: 'MusicAlbum', Recursive: 'true',
      SortBy: 'DateCreated', SortOrder: 'Descending', Limit: '20', UserId: userId,
    });
    const albums = data.Items.map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'recent', title: 'Zuletzt hinzugefügt', type: 'albums', items: albums });
  } catch {}
  try {
    const data = await apiGet<JfSearchResult>('/Items', {
      IncludeItemTypes: 'MusicAlbum', Recursive: 'true',
      SortBy: 'Random', Limit: '20', UserId: userId,
    });
    const albums = data.Items.map(normalizeAlbum);
    if (albums.length) sections.push({ id: 'random_albums', title: 'Zufällige Alben', type: 'albums', items: albums });
  } catch {}
  return sections;
}

export async function getJellyfinPlaylistTracks(playlistId: string, offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Items', {
    parentId: playlistId, IncludeItemTypes: 'Audio', Recursive: 'true',
    SortBy: 'IndexNumber', StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });
  return { tracks: data.Items.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: data.TotalRecordCount, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

interface JfGenre { Name: string; Id: string }
interface JfGenresResult { Items: JfGenre[]; TotalRecordCount: number }

export async function getJellyfinGenres(): Promise<string[]> {
  const data = await apiGet<JfGenresResult>('/MusicGenres', {
    UserId: userId, Limit: '200', SortBy: 'SortName',
  });
  return data.Items.map(g => g.Name);
}

export async function discoverJellyfin(
  type: string,
  opts: { fromYear?: number; toYear?: number; genre?: string; limit?: number } = {},
): Promise<MediaSearchResult> {
  const { limit = 20, fromYear, toYear, genre } = opts;
  const params: Record<string, string> = {
    IncludeItemTypes: 'MusicAlbum', Recursive: 'true',
    Limit: String(limit), UserId: userId,
  };
  switch (type) {
    case 'random':   params.SortBy = 'Random'; break;
    case 'newest':   params.SortBy = 'DateCreated'; params.SortOrder = 'Descending'; break;
    case 'frequent': params.SortBy = 'PlayCount';   params.SortOrder = 'Descending'; break;
    case 'recent':   params.SortBy = 'DatePlayed';  params.SortOrder = 'Descending'; break;
    case 'starred':  params.Filters = 'IsFavorite'; params.SortBy = 'SortName'; break;
    case 'byYear': {
      const years: number[] = [];
      for (let y = (fromYear ?? 1980); y <= (toYear ?? 1989); y++) years.push(y);
      params.Years  = years.join(',');
      params.SortBy = 'ProductionYear,SortName';
      break;
    }
    case 'byGenre':
      if (genre) params.Genres = genre;
      params.SortBy = 'SortName';
      break;
    default: params.SortBy = 'Random';
  }
  const data   = await apiGet<JfSearchResult>('/Items', params);
  const albums = data.Items.map(normalizeAlbum);
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: data.TotalRecordCount, totalArtists: 0, totalPlaylists: 0 };
}

export async function browseJellyfinAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Items', {
    IncludeItemTypes: 'MusicAlbum', Recursive: 'true',
    SortBy: 'SortName', SortOrder: 'Ascending',
    StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });
  return { tracks: [], albums: data.Items.map(normalizeAlbum), artists: [], playlists: [], totalTracks: 0, totalAlbums: data.TotalRecordCount, totalArtists: 0, totalPlaylists: 0 };
}

export async function browseJellyfinArtists(offset = 0, limit = 100): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Artists/AlbumArtists', {
    SortBy: 'SortName', SortOrder: 'Ascending',
    StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });

  // Albumanzahl per Künstler parallel abrufen — Limit=0 liefert nur TotalRecordCount ohne Items
  const albumCountMap = new Map<string, number>();
  await Promise.all(
    data.Items.map(artist =>
      apiGet<JfSearchResult>('/Items', {
        albumArtistIds: artist.Id,
        IncludeItemTypes: 'MusicAlbum',
        Recursive: 'true',
        Limit: '0',
        UserId: userId,
      })
      .then(r => albumCountMap.set(artist.Id, r.TotalRecordCount))
      .catch(() => {})
    )
  );

  const artists = data.Items.map(i => {
    const a = normalizeArtist(i);
    a.albumCount = albumCountMap.get(i.Id);
    return a;
  });

  return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: data.TotalRecordCount, totalPlaylists: 0 };
}

export async function browseJellyfinTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const data = await apiGet<JfSearchResult>('/Items', {
    IncludeItemTypes: 'Audio', Recursive: 'true',
    SortBy: 'SortName', SortOrder: 'Ascending',
    StartIndex: String(offset), Limit: String(limit), UserId: userId,
  });
  return { tracks: data.Items.map(normalizeTrack), albums: [], artists: [], playlists: [], totalTracks: data.TotalRecordCount, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function searchJellyfin(
  query:  string,
  types   = ['Audio', 'MusicAlbum', 'MusicArtist'],
  offset  = 0,
  limit   = 20,
): Promise<MediaSearchResult> {
  const result: MediaSearchResult = {
    tracks: [], albums: [], artists: [], playlists: [],
    totalTracks: 0, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0,
  };

  const base: Record<string, string> = {
    searchTerm: query,
    Recursive:  'true',
    Limit:      String(limit),
    StartIndex: String(offset),
    UserId:     userId,
  };

  for (const type of types) {
    const data = await apiGet<JfSearchResult>('/Items', { ...base, IncludeItemTypes: type });
    if (type === 'Audio') {
      result.tracks      = data.Items.map(normalizeTrack);
      result.totalTracks = data.TotalRecordCount;
    } else if (type === 'MusicAlbum') {
      result.albums      = data.Items.map(normalizeAlbum);
      result.totalAlbums = data.TotalRecordCount;
    } else if (type === 'MusicArtist') {
      result.artists      = data.Items.map(normalizeArtist);
      result.totalArtists = data.TotalRecordCount;
    }
  }

  return result;
}
