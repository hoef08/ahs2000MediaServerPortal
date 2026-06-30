import { config } from '../config.js';
import { createSubsonicService } from './subsonic.js';

const svc = createSubsonicService({
  ...config.navidrome,
  serviceName:        'navidrome',
  useArtistsEndpoint: true, // getArtists (ID3) liefert albumCount; Navidrome unterstuetzt ID3 vollstaendig
});

export const searchNavidrome                = svc.search.bind(svc);
export const getNavidromeStreamUrl          = svc.getStreamUrl.bind(svc);
export const getNavidromeAlbumTracks        = svc.getAlbumTracks.bind(svc);
export const getNavidromeArtistAlbums       = svc.getArtistAlbums.bind(svc);
export const getNavidromeCoverArtDirectUrl  = svc.getCoverArtDirectUrl.bind(svc);
export const getNavidromeHomeSections       = svc.getHomeSections.bind(svc);
export const getNavidromePlaylistTracks     = svc.getPlaylistTracks.bind(svc);
export const browseNavidromeAlbums          = svc.browseAlbums.bind(svc);
export const browseNavidromeArtists         = svc.browseArtists.bind(svc);
export const browseNavidromeTracks          = svc.browseTracks.bind(svc);
export const discoverNavidrome              = svc.discover.bind(svc);
export const getNavidromeGenres             = svc.getGenres.bind(svc);
export const getNavidromeMusicFolders       = svc.getMusicFolders.bind(svc);
