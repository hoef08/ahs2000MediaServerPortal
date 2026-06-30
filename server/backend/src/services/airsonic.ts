import { config } from '../config.js';
import { createSubsonicService } from './subsonic.js';

const svc = createSubsonicService({
  ...config.airsonic,          // apiVersion kommt aus config (default 1.15.0, überschreibbar)
  serviceName:        'airsonic',
  useArtistsEndpoint: true,
  usePlainAuth:       true,
});

export const searchAirsonic                = svc.search.bind(svc);
export const getAirsonicStreamUrl          = svc.getStreamUrl.bind(svc);
export const getAirsonicAlbumTracks        = svc.getAlbumTracks.bind(svc);        // ID3-basiert
export const getAirsonicArtistAlbums       = svc.getArtistAlbums.bind(svc);       // ID3-basiert
export const getAirsonicCoverArtDirectUrl  = svc.getCoverArtDirectUrl.bind(svc);
export const getAirsonicHomeSections       = svc.getHomeSections.bind(svc);
export const getAirsonicPlaylistTracks     = svc.getPlaylistTracks.bind(svc);
export const browseAirsonicAlbums          = svc.browseAlbums.bind(svc);
export const browseAirsonicArtists         = svc.browseArtists.bind(svc);
export const browseAirsonicTracks          = svc.browseTracks.bind(svc);
export const discoverAirsonic              = svc.discover.bind(svc);
export const getAirsonicGenres             = svc.getGenres.bind(svc);
export const getAirsonicMusicFolders       = svc.getMusicFolders.bind(svc);
