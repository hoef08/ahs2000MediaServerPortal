import { getTidalToken } from '../auth/tidal.js';
import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';
import type { MediaTrack, MediaAlbum, MediaArtist, MediaPlaylist, MediaSearchResult, HomeSection } from '../types/media.js';

const BASE    = 'https://openapi.tidal.com/v2';
const BASE_V1 = 'https://api.tidal.com/v1';

async function apiGetV1<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getTidalToken();
  const url   = new URL(BASE_V1 + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await logFetch(url.toString(), {
    headers: {
      Authorization:   `Bearer ${token}`,
      Accept:          'application/json',
      'X-Tidal-Token': config.tidal.clientId,
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Tidal v1 API error: HTTP ${resp.status} ${path} — ${body}`);
  }
  return resp.json() as Promise<T>;
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getTidalToken();
  const url   = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await logFetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/vnd.api+json',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Tidal API error: HTTP ${resp.status} ${path} — ${body}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// JSON:API Hilfsfunktionen (Delphi BuildIncluded Equivalent)
// ---------------------------------------------------------------------------

type JsonApiItem = { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> }> };

function buildIncluded(included: JsonApiItem[]): Map<string, JsonApiItem> {
  const map = new Map<string, JsonApiItem>();
  for (const item of included ?? []) {
    if (item.type && item.id) map.set(`${item.type}:${item.id}`, item);
  }
  return map;
}

function attr<T>(item: JsonApiItem | undefined, key: string): T | undefined {
  return item?.attributes?.[key] as T | undefined;
}

function relIds(item: JsonApiItem | undefined, rel: string): string[] {
  const data = item?.relationships?.[rel]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data.map(d => d.id) : [data.id];
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

// Duration: Integer-Sekunden ODER ISO-8601 "PT3M45S"
function parseDurationMs(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number')           return Math.round(val * 1000);
  if (typeof val === 'string') {
    const n = Number(val);
    if (!isNaN(n)) return Math.round(n * 1000);
    // ISO 8601: PT[H]H[M]M[S]S
    const m = val.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
    if (!m) return 0;
    const h   = parseInt(m[1] ?? '0');
    const min = parseInt(m[2] ?? '0');
    const sec = parseFloat(m[3] ?? '0');
    return Math.round((h * 3600 + min * 60 + sec) * 1000);
  }
  return 0;
}

// Cover-URL: artwork item → attributes.files[] → nächste passende Größe
function artworkUrl(item: JsonApiItem | undefined, preferredWidth = 320): string {
  type FilesEntry = { href?: string; meta?: { width?: number } };
  const files = item?.attributes?.['files'] as FilesEntry[] | undefined;
  if (!files?.length) return '';
  let best = files[0];
  let bestDiff = Math.abs((best.meta?.width ?? 0) - preferredWidth);
  for (const f of files) {
    const diff = Math.abs((f.meta?.width ?? 0) - preferredWidth);
    if (diff < bestDiff) { bestDiff = diff; best = f; }
  }
  return best.href ?? '';
}

// Artwork über Named-Relationship: item.relationships.{relName}.data[0].id → included['artworks:{id}']
function getArtworkUrl(item: JsonApiItem | undefined, inc: Map<string, JsonApiItem>, relName: string): string {
  const artId = relIds(item, relName)[0];
  if (!artId) return '';
  return artworkUrl(inc.get(`artworks:${artId}`));
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

function normalizeTrack(
  track: JsonApiItem,
  inc:   Map<string, JsonApiItem>,
  _cc:   string,
): MediaTrack {
  const a = track.attributes ?? {};

  const artistRef  = inc.get(`artists:${relIds(track, 'artists')[0]}`);
  const artistName = attr<string>(artistRef, 'name') ?? '';

  const albumId  = relIds(track, 'albums')[0] ?? '';
  const albumRef = inc.get(`albums:${albumId}`);
  const albumTitle = attr<string>(albumRef, 'title') ?? '';

  // Cover: track → albums[0] → coverArt → artworks:{id} → attributes.files[0].href
  const coverUrl = getArtworkUrl(albumRef, inc, 'coverArt');

  return {
    id:          track.id,
    title:       (a['title']       as string  | undefined) ?? '',
    artistName,
    albumTitle,
    albumId,
    coverUrl,
    durationMs:  parseDurationMs(a['duration']),
    trackNumber: (a['trackNumber'] as number  | undefined) ?? 0,
    discNumber:  (a['volumeNumber']as number  | undefined) ?? 1,
    explicit:    (a['explicit']    as boolean | undefined) ?? false,
    popularity:  Math.round(((a['popularity'] as number | undefined) ?? 0) * 100),
    service:     'tidal',
    serviceUrl:  `https://tidal.com/browse/track/${track.id}`,
    previewUrl:  '',
    isrc:        (a['isrc']        as string  | undefined) ?? '',
  };
}

function normalizeAlbum(
  album: JsonApiItem,
  inc:   Map<string, JsonApiItem>,
): MediaAlbum {
  const a = album.attributes ?? {};

  const artistRef  = inc.get(`artists:${relIds(album, 'artists')[0]}`);
  const artistName = attr<string>(artistRef, 'name') ?? '';

  // Cover: album → coverArt → artworks:{id} → attributes.files[0].href
  const coverUrl = getArtworkUrl(album, inc, 'coverArt');

  return {
    id:          album.id,
    title:       (a['title']         as string  | undefined) ?? '',
    artistName,
    coverUrl,
    releaseDate: (a['releaseDate']   as string  | undefined) ?? '',
    trackCount:  (a['numberOfTracks']as number  | undefined) ?? 0,
    durationMs:  parseDurationMs(a['duration']),
    explicit:    (a['explicit']      as boolean | undefined) ?? false,
    popularity:  Math.round(((a['popularity'] as number | undefined) ?? 0) * 100),
    service:     'tidal',
    serviceUrl:  `https://tidal.com/browse/album/${album.id}`,
  };
}

function normalizeArtist(
  artist: JsonApiItem,
  inc:    Map<string, JsonApiItem>,
): MediaArtist {
  const a = artist.attributes ?? {};

  // Bild: artist → profileArt → artworks:{id} → attributes.files[0].href
  const imageUrl = getArtworkUrl(artist, inc, 'profileArt');

  return {
    id:         artist.id,
    name:       (a['name']       as string | undefined) ?? '',
    imageUrl,
    popularity: Math.round(((a['popularity'] as number | undefined) ?? 0) * 100),
    genres:     [],
    service:    'tidal',
    serviceUrl: `https://tidal.com/browse/artist/${artist.id}`,
  };
}

function normalizePlaylist(playlist: JsonApiItem, inc: Map<string, JsonApiItem>): MediaPlaylist {
  const a = playlist.attributes ?? {};
  // Playlists: privacy kann 'PUBLIC' oder 'PRIVATE' sein
  const privacy = (a['privacy'] as string | undefined) ?? '';
  return {
    id:          playlist.id,
    title:       (a['name']           as string  | undefined) ?? '',
    description: (a['description']    as string  | undefined) ?? '',
    coverUrl:    getArtworkUrl(playlist, inc, 'image'),
    trackCount:  (a['numberOfTracks'] as number  | undefined) ?? 0,
    isPublic:    privacy === 'PUBLIC',
    owner:       '',
    service:     'tidal',
  };
}

// ---------------------------------------------------------------------------
// Include-Parameter Aufbau (Delphi Search-Logik übernommen)
// ---------------------------------------------------------------------------

const INCLUDE_MAP: Record<string, string> = {
  tracks:    'tracks,tracks.albums,tracks.artists,tracks.albums.coverArt',
  albums:    'albums,albums.artists,albums.coverArt',
  artists:   'artists,artists.profileArt',
  playlists: 'playlists',
};

// ---------------------------------------------------------------------------
// API-Methoden
// ---------------------------------------------------------------------------

// Tidal-Response für Listen (Album-Tracks, Artist-Alben): data ist Array
interface TidalPageResponse {
  data:     Array<{ id: string; type: string }>;
  included: JsonApiItem[];
  meta?:    { total?: number; limit?: number; offset?: number };
}

// ---------------------------------------------------------------------------
// Benutzerbibliothek – Favoriten (Browse-Ersatz für Tidal)
// ---------------------------------------------------------------------------

export async function browseTidalTracks(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    '/userCollectionTracks/me/relationships/items',
    { countryCode: cc, include: 'items.albums.coverArt,items.artists.profileArt', offset: String(offset), limit: String(limit) },
  );
  const inc    = buildIncluded(resp.included ?? []);
  const total  = resp.meta?.total ?? resp.data.length;
  const tracks = resp.data
    .map(ref => inc.get(`tracks:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeTrack(item, inc, cc));
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function browseTidalAlbums(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    '/userCollectionAlbums/me/relationships/items',
    { countryCode: cc, include: 'items.coverArt,items.artists', offset: String(offset), limit: String(limit) },
  );
  const inc    = buildIncluded(resp.included ?? []);
  const total  = resp.meta?.total ?? resp.data.length;
  const albums = resp.data
    .map(ref => inc.get(`albums:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeAlbum(item, inc));
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: total, totalArtists: 0, totalPlaylists: 0 };
}

export async function browseTidalArtists(offset = 0, limit = 50): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    '/userCollectionArtists/me/relationships/items',
    { countryCode: cc, include: 'items.profileArt', offset: String(offset), limit: String(limit) },
  );
  const inc     = buildIncluded(resp.included ?? []);
  const total   = resp.meta?.total ?? resp.data.length;
  const artists = resp.data
    .map(ref => inc.get(`artists:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeArtist(item, inc));
  return { tracks: [], albums: [], artists, playlists: [], totalTracks: 0, totalAlbums: 0, totalArtists: total, totalPlaylists: 0 };
}

export async function getTidalAlbumTracks(
  albumId: string,
  offset  = 0,
  limit   = 50,
): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    `/albums/${encodeURIComponent(albumId)}/relationships/items`,
    { countryCode: cc, include: 'items,items.albums.coverArt,items.artists', offset: String(offset), limit: String(limit) },
  );
  const inc    = buildIncluded(resp.included ?? []);
  const total  = resp.meta?.total ?? resp.data.length;
  const tracks = resp.data
    .map(ref => inc.get(`tracks:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeTrack(item, inc, cc));
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}

export async function getTidalArtistAlbums(
  artistId: string,
  offset   = 0,
  limit    = 50,
): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    `/artists/${encodeURIComponent(artistId)}/relationships/albums`,
    { countryCode: cc, include: 'albums.coverArt,albums.artists', offset: String(offset), limit: String(limit) },
  );
  const inc    = buildIncluded(resp.included ?? []);
  const total  = resp.meta?.total ?? resp.data.length;
  const albums = resp.data
    .map(ref => inc.get(`albums:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeAlbum(item, inc));
  return { tracks: [], albums, artists: [], playlists: [], totalTracks: 0, totalAlbums: total, totalArtists: 0, totalPlaylists: 0 };
}

// Tidal-Response: data ist EIN Objekt mit relationships, nicht Array
// Struktur: { data: { relationships: { tracks: { data: [{id,type}...], meta: {total} } } }, included: [...] }
type RelationshipPage = {
  data:   Array<{ id: string; type: string }>;
  meta?:  { total?: number; limit?: number; offset?: number };
  links?: { next?: string };
};

interface TidalSearchResponse {
  data: {
    id:   string;
    type: string;
    relationships?: {
      tracks?:    RelationshipPage;
      albums?:    RelationshipPage;
      artists?:   RelationshipPage;
      playlists?: RelationshipPage;
    };
  };
  included: JsonApiItem[];
}

export async function searchTidal(
  query:  string,
  types   = ['tracks', 'albums', 'artists', 'playlists'],
  offset  = 0,
  limit   = 20,
): Promise<MediaSearchResult> {
  const cc      = config.tidal.countryCode;
  const include = types
    .map(t => t.replace(/s$/, '') + 's') // normalisiere zu Plural
    .map(t => INCLUDE_MAP[t] ?? '')
    .filter(Boolean)
    .join(',');

  const resp = await apiGet<TidalSearchResponse>(
    `/searchResults/${encodeURIComponent(query)}`,
    { countryCode: cc, collapseBy: 'TRACK_ONLY', include, offset: String(offset), limit: String(limit) },
  );

  const inc  = buildIncluded(resp.included ?? []);
  const rels = resp.data?.relationships ?? {};

  const result: MediaSearchResult = {
    tracks: [], albums: [], artists: [], playlists: [],
    totalTracks: 0, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0,
  };

  // Tracks
  if (rels.tracks) {
    result.totalTracks = rels.tracks.meta?.total ?? rels.tracks.data.length;
    for (const ref of rels.tracks.data) {
      const item = inc.get(`tracks:${ref.id}`);
      if (item) result.tracks.push(normalizeTrack(item, inc, cc));
    }
  }

  // Albums
  if (rels.albums) {
    result.totalAlbums = rels.albums.meta?.total ?? rels.albums.data.length;
    for (const ref of rels.albums.data) {
      const item = inc.get(`albums:${ref.id}`);
      if (item) result.albums.push(normalizeAlbum(item, inc));
    }
  }

  // Artists
  if (rels.artists) {
    result.totalArtists = rels.artists.meta?.total ?? rels.artists.data.length;
    for (const ref of rels.artists.data) {
      const item = inc.get(`artists:${ref.id}`);
      if (item) result.artists.push(normalizeArtist(item, inc));
    }
  }

  // Playlists
  if (rels.playlists) {
    result.totalPlaylists = rels.playlists.meta?.total ?? rels.playlists.data.length;
    for (const ref of rels.playlists.data) {
      const item = inc.get(`playlists:${ref.id}`);
      if (item) result.playlists.push(normalizePlaylist(item, inc));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tidal v1 interne API — Home Page + Mix Tracks
// ---------------------------------------------------------------------------

interface V1Artist { id: number; name: string }
interface V1Album  { id: number; title: string; cover: string }
interface V1Track  {
  id: number; title: string; duration: number; explicit: boolean;
  trackNumber?: number; volumeNumber?: number; isrc?: string;
  artists: V1Artist[]; album: V1Album;
}
interface V1MixItem { type: string; item: V1Track; cut?: unknown }
interface V1Mix     { id: string; title: string; subTitle?: string; mixType?: string; images?: Record<string, { url: string }> }

interface V1HomeModule {
  id?:         string;
  type:        string;
  title?:      { text: string };
  pagedList?:  { items: unknown[]; totalNumberOfItems?: number };
}
interface V1HomeRow    { modules: V1HomeModule[] }
interface V1HomeResponse { rows: V1HomeRow[] }
interface V1MixItemsResponse { items: V1MixItem[]; totalNumberOfItems?: number }

function v1CoverUrl(cover: string | undefined): string {
  if (!cover) return '';
  return `https://resources.tidal.com/images/${cover.replace(/-/g, '/')}/320x320.jpg`;
}

function normalizeV1Track(t: V1Track): MediaTrack {
  return {
    id:          String(t.id),
    title:       t.title,
    artistName:  t.artists?.[0]?.name ?? '',
    albumTitle:  t.album?.title ?? '',
    albumId:     String(t.album?.id ?? ''),
    coverUrl:    v1CoverUrl(t.album?.cover),
    durationMs:  (t.duration ?? 0) * 1000,
    trackNumber: t.trackNumber ?? 0,
    discNumber:  t.volumeNumber ?? 1,
    explicit:    t.explicit ?? false,
    popularity:  0,
    service:     'tidal',
    serviceUrl:  `https://tidal.com/browse/track/${t.id}`,
    previewUrl:  '',
    isrc:        t.isrc ?? '',
  };
}

function normalizeV1Album(a: Record<string, unknown>): MediaAlbum {
  const artists = (a['artists'] as V1Artist[] | undefined) ?? [];
  const cover   = a['cover'] as string | undefined;
  return {
    id:          String(a['id']),
    title:       (a['title'] as string) ?? '',
    artistName:  artists[0]?.name ?? '',
    coverUrl:    v1CoverUrl(cover),
    releaseDate: (a['releaseDate'] as string | undefined) ?? '',
    trackCount:  (a['numberOfTracks'] as number | undefined) ?? 0,
    durationMs:  0,
    explicit:    (a['explicit'] as boolean | undefined) ?? false,
    popularity:  0,
    service:     'tidal',
    serviceUrl:  `https://tidal.com/browse/album/${a['id']}`,
  };
}

async function getMixTracks(mixId: string, limit = 15): Promise<MediaTrack[]> {
  const cc   = config.tidal.countryCode;
  const data = await apiGetV1<V1MixItemsResponse>(`/mixes/${mixId}/items`, {
    countryCode: cc, limit: String(limit),
  });
  return (data.items ?? [])
    .filter(i => i.type === 'track' && i.item)
    .map(i => normalizeV1Track(i.item));
}

async function getTidalHomeSectionsV1(): Promise<HomeSection[]> {
  const cc   = config.tidal.countryCode;
  const home = await apiGetV1<V1HomeResponse>('/pages/home', {
    countryCode: cc, deviceType: 'BROWSER',
  });

  const sections: HomeSection[] = [];

  for (const row of home.rows ?? []) {
    for (const mod of row.modules ?? []) {
      if (sections.length >= 6) break;
      const title = mod.title?.text ?? '';
      const items = mod.pagedList?.items ?? [];

      if (mod.type === 'MIX_LIST') {
        // Mixes: bis zu 3 abrufen und deren Tracks holen
        const mixes = items.slice(0, 3) as V1Mix[];
        for (const mix of mixes) {
          if (sections.length >= 6) break;
          try {
            const tracks = await getMixTracks(mix.id, 15);
            if (tracks.length) {
              sections.push({ id: `mix_${mix.id}`, title: mix.title, type: 'tracks', items: tracks });
            }
          } catch {}
        }
      } else if ((mod.type === 'ALBUM_LIST' || mod.type === 'HIGHLIGHTED_ALBUM') && title) {
        const albums = (items.slice(0, 20) as Record<string, unknown>[]).map(normalizeV1Album);
        if (albums.length) sections.push({ id: mod.id ?? `alb_${title}`, title, type: 'albums', items: albums });
      }
    }
    if (sections.length >= 6) break;
  }

  return sections;
}

interface TidalMixListResponse {
  data:      JsonApiItem[];
  included?: JsonApiItem[];
}

// User-ID aus JWT-Payload (sub-Claim) extrahieren
async function getTidalUserId(): Promise<string> {
  const token = await getTidalToken();
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    return String(payload['sub'] ?? payload['userId'] ?? payload['uid'] ?? '');
  } catch {
    return '';
  }
}

async function fetchMixItems(
  mixType:  'userDailyMixes' | 'userDiscoveryMixes' | 'userNewReleaseMixes',
  mixId:    string,
  itemType: 'tracks' | 'albums',
  limit     = 15,
): Promise<{ tracks: MediaTrack[]; albums: MediaAlbum[] }> {
  const cc      = config.tidal.countryCode;
  const include = itemType === 'tracks'
    ? 'items,items.albums.coverArt,items.artists'
    : 'items,items.artists,items.coverArt';

  const resp = await apiGet<TidalPageResponse>(
    `/${mixType}/${mixId}/relationships/items`,
    { countryCode: cc, include, limit: String(limit) },
  );
  const inc = buildIncluded(resp.included ?? []);

  if (itemType === 'tracks') {
    const tracks = resp.data
      .map(ref => inc.get(`tracks:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
      .filter((x): x is JsonApiItem => !!x)
      .map(item => normalizeTrack(item, inc, cc));
    return { tracks, albums: [] };
  }
  const albums = resp.data
    .map(ref => inc.get(`albums:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeAlbum(item, inc));
  return { tracks: [], albums };
}

async function fetchMixSections(
  mixType:    'userDailyMixes' | 'userDiscoveryMixes' | 'userNewReleaseMixes',
  itemType:   'tracks' | 'albums',
  maxMixes    = 3,
  itemsPerMix = 15,
): Promise<HomeSection[]> {
  const cc     = config.tidal.countryCode;
  const userId = await getTidalUserId();
  if (!userId) throw new Error('Tidal User-ID nicht ermittelbar');

  // Mix-IDs über User-Relationship holen, inkl. Mix-Attribute für Titel
  const listResp = await apiGet<TidalMixListResponse>(
    `/users/${userId}/relationships/${mixType}`,
    { countryCode: cc, include: mixType },
  );

  const inc   = buildIncluded(listResp.included ?? []);
  const refs  = (listResp.data ?? []).slice(0, maxMixes);

  const sections: HomeSection[] = [];
  for (const [i, ref] of refs.entries()) {
    try {
      const mixItem = inc.get(`${mixType}:${ref.id}`);
      const title   = attr<string>(mixItem, 'title') ?? attr<string>(mixItem, 'name') ?? `Mix ${i + 1}`;
      const { tracks, albums } = await fetchMixItems(mixType, ref.id, itemType, itemsPerMix);
      if (itemType === 'tracks' && tracks.length) {
        sections.push({ id: `${mixType}_${ref.id}`, title, type: 'tracks', items: tracks });
      } else if (itemType === 'albums' && albums.length) {
        sections.push({ id: `${mixType}_${ref.id}`, title, type: 'albums', items: albums });
      }
    } catch {
      // skip failed mix
    }
  }
  return sections;
}

export async function getTidalHomeSections(): Promise<HomeSection[]> {
  // Versuch 1: interne v1 API mit echten personalisierten Inhalten
  try {
    const sections = await getTidalHomeSectionsV1();
    if (sections.length) {
      console.log(`[Tidal Home] v1 API: ${sections.length} Sections geladen`);
      return sections;
    }
  } catch (e) {
    console.warn('[Tidal Home] v1 API nicht verfügbar:', (e as Error).message);
  }

  // Fallback: Suchanfragen über v2 public API
  console.warn('[Tidal Home] Fallback auf Suche');
  const sections: HomeSection[] = [];
  const [newAlbums, danceAlbums, topPlaylists] = await Promise.allSettled([
    searchTidal('2024 2025', ['albums'], 0, 20),
    searchTidal('electronic dance pop', ['albums'], 0, 20),
    searchTidal('top hits best of', ['playlists'], 0, 20),
  ]);
  if (newAlbums.status    === 'fulfilled' && newAlbums.value.albums.length)
    sections.push({ id: 'new_albums', title: 'Aktuelle Alben',    type: 'albums',    items: newAlbums.value.albums });
  if (danceAlbums.status  === 'fulfilled' && danceAlbums.value.albums.length)
    sections.push({ id: 'discover',   title: 'Entdecken',         type: 'albums',    items: danceAlbums.value.albums });
  if (topPlaylists.status === 'fulfilled' && topPlaylists.value.playlists.length)
    sections.push({ id: 'playlists',  title: 'Playlisten',        type: 'playlists', items: topPlaylists.value.playlists });
  return sections;
}

export async function getTidalPlaylistTracks(playlistId: string, offset = 0, limit = 50): Promise<MediaSearchResult> {
  const cc   = config.tidal.countryCode;
  const resp = await apiGet<TidalPageResponse>(
    `/playlists/${encodeURIComponent(playlistId)}/relationships/items`,
    { countryCode: cc, include: 'items,items.albums.coverArt,items.artists', offset: String(offset), limit: String(limit) },
  );
  const inc    = buildIncluded(resp.included ?? []);
  const total  = resp.meta?.total ?? resp.data.length;
  const tracks = resp.data
    .map(ref => inc.get(`tracks:${ref.id}`) ?? inc.get(`${ref.type}:${ref.id}`))
    .filter((x): x is JsonApiItem => !!x)
    .map(item => normalizeTrack(item, inc, cc));
  return { tracks, albums: [], artists: [], playlists: [], totalTracks: total, totalAlbums: 0, totalArtists: 0, totalPlaylists: 0 };
}
