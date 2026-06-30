// Normalisierte Typen – service-unabhängig, matching Delphi TMedia* Records

export interface MediaTrack {
  id:          string;
  title:       string;
  artistName:  string;
  albumTitle:  string;
  albumId:     string;
  coverUrl:    string;
  durationMs:  number;
  trackNumber: number;
  discNumber:  number;
  explicit:    boolean;
  popularity:  number;
  service:     string;
  serviceUrl:  string;
  previewUrl:  string;
  isrc:        string;
}

export interface MediaAlbum {
  id:          string;
  title:       string;
  artistName:  string;
  coverUrl:    string;
  releaseDate: string;
  trackCount:  number;
  durationMs:  number;
  explicit:    boolean;
  popularity:  number;
  service:     string;
  serviceUrl:  string;
}

export interface MediaArtist {
  id:           string;
  name:         string;
  imageUrl:     string;
  popularity:   number;
  genres:       string[];
  service:      string;
  serviceUrl:   string;
  albumCount?:  number;
}

export interface MediaPlaylist {
  id:          string;
  title:       string;
  description: string;
  coverUrl:    string;
  trackCount:  number;
  isPublic:    boolean;
  owner:       string;
  service:     string;
}

export interface HomeSection {
  id:    string;
  title: string;
  type:  'albums' | 'tracks' | 'playlists';
  items: Array<MediaAlbum | MediaTrack | MediaPlaylist>;
}

export interface MediaSearchResult {
  tracks:        MediaTrack[];
  albums:        MediaAlbum[];
  artists:       MediaArtist[];
  playlists:     MediaPlaylist[];
  totalTracks:   number;
  totalAlbums:   number;
  totalArtists:  number;
  totalPlaylists: number;
}

// API Response Envelope
export interface ApiResponse<T> {
  success: boolean;
  data:    T | null;
  error:   { code: number; message: string } | null;
  service?: string;
}

export function okResponse<T>(data: T, service?: string): ApiResponse<T> {
  return { success: true, data, error: null, service };
}

export function errorResponse(code: number, message: string): ApiResponse<null> {
  return { success: false, data: null, error: { code, message } };
}
