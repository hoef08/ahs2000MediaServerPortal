import { config } from '../config.js';
import * as v1 from './madsonicV1.js';
import * as v2 from './madsonicV2.js';

// Madsonic API v2+ verwendet /rest2/ und hat andere Endpunktnamen.
// Die Implementierungen sind vollständig getrennt; hier wird anhand der
// konfigurierten apiVersion die richtige gewählt.
const isV2 = (() => {
  const major = parseInt(config.madsonic.apiVersion?.split('.')[0] ?? '1', 10);
  return major >= 2;
})();

const impl = isV2 ? v2 : v1;

export const searchMadsonic            = impl.searchMadsonic;
export const getMadsonicStreamUrl      = impl.getMadsonicStreamUrl;
export const getMadsonicAlbumTracks    = impl.getMadsonicAlbumTracks;
export const getMadsonicArtistAlbums   = impl.getMadsonicArtistAlbums;
export const getMadsonicPlaylistTracks = impl.getMadsonicPlaylistTracks;
export const browseMadsonicAlbums      = impl.browseMadsonicAlbums;
export const browseMadsonicArtists     = impl.browseMadsonicArtists;
export const browseMadsonicTracks      = impl.browseMadsonicTracks;
export const discoverMadsonic          = impl.discoverMadsonic;
export const getMadsonicGenres         = impl.getMadsonicGenres;
export const getMadsonicMusicFolders   = impl.getMadsonicMusicFolders;
export const getMadsonicHomeSections   = impl.getMadsonicHomeSections;
export const buildMadsonicCoverUrl     = impl.buildMadsonicCoverUrl;
