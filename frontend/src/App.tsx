import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume, Volume1, Volume2, VolumeX, Search, ListMusic, Settings, RefreshCw, LayoutGrid, List, GalleryHorizontalEnd, Clock, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Home, Trash2, GripVertical, Users, Compass, Plus, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { mediaService, getServiceStatus, serviceSettings, getAuthStatus } from './services/api';
import type { MediaItem, ServiceStatus, HomeSection, ServiceConfig, AuthStatus } from './services/api';
import { ArtistDetailView } from './components/ArtistDetailView';
import { loadSettings, saveSettings, DISCOVER_TYPE_LABELS } from './services/settings';
import type { AppSettings, DiscoverLane, DiscoverType } from './services/settings';
import { spotifyPlayer } from './services/spotifyPlayer';
import { parseQuery } from './services/queryParser';


function CoverImage({ src, alt, className, placeholder }: {
  src?: string; alt?: string; className?: string; placeholder: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{placeholder}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

const ALL_PROVIDERS = ['Alle', 'SubSonic', 'Navidrome', 'Jellyfin', 'Plex', 'Spotify', 'Tidal', 'Madsonic', 'Airsonic'];

// Provider → ServiceStatus-Key
const PROVIDER_SERVICE: Record<string, keyof ServiceStatus> = {
  SubSonic:  'subsonic',
  Madsonic:  'madsonic',
  Navidrome: 'navidrome',
  Airsonic:  'airsonic',
  Jellyfin:  'jellyfin',
  Plex:      'plex',
  Spotify:   'spotify',
  Tidal:     'tidal',
};

// Service-Name → Provider-Label (Umkehrung von SERVICE_MAP in api.ts)
const SERVICE_TO_PROVIDER: Record<string, string> = {
  subsonic: 'SubSonic', navidrome: 'Navidrome', madsonic: 'Madsonic',
  airsonic: 'Airsonic', plex: 'Plex', jellyfin: 'Jellyfin',
  spotify: 'Spotify', tidal: 'Tidal',
};

const VIEWS = [
  { id: 'coverflow',  label: 'Cover Flow',   icon: GalleryHorizontalEnd },
  { id: 'galerie',    label: 'Galerie',       icon: LayoutGrid },
  { id: 'liste',      label: 'Liste',         icon: List },
  { id: 'artisthub',  label: 'Künstler-Hub',  icon: Users },
  { id: 'discover',   label: 'Entdecken',     icon: Compass },
];

const HUB_ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
const hubFold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hubFirstLetter = (name: string): string => {
  const c = hubFold(name)[0] ?? '#';
  return /[A-Z]/.test(c) ? c : '#';
};

const RESULT_TYPES = [
  { id: 'tracks',  label: 'Titel'   },
  { id: 'albums',  label: 'Alben'   },
  { id: 'artists', label: 'Künstler'},
] as const;
type ResultType = typeof RESULT_TYPES[number]['id'];

const SVC_DEFS: { key: keyof ServiceConfig; label: string; fields: string[]; hasMusicFolders?: boolean; hasOAuth?: boolean }[] = [
  { key: 'subsonic',  label: 'SubSonic',  fields: ['baseUrl', 'username', 'password', 'clientName', 'apiVersion'], hasMusicFolders: true },
  { key: 'navidrome', label: 'Navidrome', fields: ['baseUrl', 'username', 'password', 'clientName', 'apiVersion'], hasMusicFolders: true },
  { key: 'madsonic',  label: 'Madsonic',  fields: ['baseUrl', 'username', 'password', 'clientName', 'apiVersion'], hasMusicFolders: true },
  { key: 'airsonic',  label: 'Airsonic',  fields: ['baseUrl', 'username', 'password', 'clientName', 'apiVersion'], hasMusicFolders: true },
  { key: 'plex',      label: 'Plex',      fields: ['baseUrl', 'token'] },
  { key: 'jellyfin',  label: 'Jellyfin',  fields: ['baseUrl', 'apiToken', 'userId'] },
  { key: 'spotify',   label: 'Spotify',   fields: ['clientId', 'redirectUri', 'market'], hasOAuth: true },
  { key: 'tidal',     label: 'Tidal',     fields: ['clientId', 'redirectUri', 'countryCode'], hasOAuth: true },
  { key: 'lastfm',    label: 'Last.fm',   fields: ['apiKey'] },
];
const FIELD_LABELS: Record<string, string> = {
  baseUrl: 'Server URL', username: 'Benutzername', password: 'Passwort',
  clientName: 'Client Name', apiVersion: 'API Version',
  token: 'Token', apiToken: 'API Token', userId: 'User ID',
  clientId: 'Client ID', redirectUri: 'Redirect URI', market: 'Markt (z. B. DE)',
  countryCode: 'Ländercode (z. B. DE)', apiKey: 'API Key',
};
const PASSWORD_FIELDS = new Set(['password', 'token', 'apiToken', 'apiKey']);

function getSvcField(cfg: ServiceConfig, svc: keyof ServiceConfig, field: string): string {
  return ((cfg[svc] as Record<string, string>)[field]) ?? '';
}
function setSvcField(cfg: ServiceConfig, svc: keyof ServiceConfig, field: string, val: string): ServiceConfig {
  return { ...cfg, [svc]: { ...(cfg[svc] as Record<string, string>), [field]: val } };
}

function App() {
  const [activeProvider, setActiveProvider]     = useState(ALL_PROVIDERS[0]);
  const [activeView, setActiveView]             = useState('coverflow');
  const [activeResultType, setActiveResultType] = useState<ResultType>('tracks');
  const [searchQuery, setSearchQuery]           = useState('');
  const [lastSearched, setLastSearched]         = useState('');
  const [results, setResults]                   = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [currentOffset, setCurrentOffset]       = useState(0);
  const [totalResults, setTotalResults]         = useState(0);
  // Breadcrumb-Stack: jeder Eintrag = eine Ebene zurück
  const [navStack, setNavStack]                 = useState<Array<{ label: string; items: MediaItem[]; total: number }>>([]);
  const [serviceStatus, setServiceStatus]       = useState<ServiceStatus | null>(null);
  const [currentTrack, setCurrentTrack]         = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [progress, setProgress]                 = useState(0);
  const [currentTime, setCurrentTime]           = useState(0);
  const [duration, setDuration]                 = useState(0);
  const [coverFlowIndex, setCoverFlowIndex]     = useState(0);
  const [consoleLog, setConsoleLog]             = useState<string[]>([
    `> ahs2000 Media Server Portal v${__APP_VERSION__} gestartet.`,
    '> Verbinde mit Backend...',
  ]);

  const [browseType, setBrowseType]           = useState<ResultType | null>(null);
  const [volume, setVolume]                   = useState(() => loadSettings().volume ?? 0.7);
  const prevVolumeRef                         = useRef(0.7);
  const [settings, setSettings]               = useState<AppSettings>(loadSettings);
  const [showSettings, setShowSettings]       = useState(false);
  const [serviceConfig, setServiceConfig]     = useState<ServiceConfig | null>(null);
  const [expandedSvc, setExpandedSvc]         = useState<string | null>(null);
  const [svcSaveStatus, setSvcSaveStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authStatus, setAuthStatus]           = useState<AuthStatus | null>(null);
  const [musicFolders, setMusicFolders]       = useState<Record<string, { id: string; name: string }[]>>({});
  const [musicFoldersLoading, setMusicFoldersLoading] = useState<Set<string>>(new Set());
  const [spotifyFallback, setSpotifyFallback] = useState(false);
  const [consoleHeight, setConsoleHeight]     = useState(160);
  const [queue, setQueue]                     = useState<MediaItem[]>([]);
  const [showQueue, setShowQueue]             = useState(false);
  const [homeSections, setHomeSections]       = useState<HomeSection[]>([]);
  const [homeLoading, setHomeLoading]         = useState(false);
  const consoleDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const lastWheelTime       = useRef<number>(0);
  const spotifyInitialized  = useRef(false);
  const queueRef            = useRef<MediaItem[]>([]); // Snapshot der aktuellen Trackliste für Skip
  const dragIndexRef        = useRef<number | null>(null);
  const prevDiscoverProviderRef = useRef<string>('');
  const [queueDragOver, setQueueDragOver] = useState<number | null>(null);
  const [hubLetter, setHubLetter]         = useState<string | null>(null);
  const [hubSearch, setHubSearch]         = useState('');
  const [hubColumns, setHubColumns]       = useState(() => loadSettings().hubColumns ?? 3);
  const [artistDetail, setArtistDetail]   = useState<MediaItem | null>(null);
  const [discoverData, setDiscoverData]   = useState<Record<string, MediaItem[]>>({});
  const [discoverLoading, setDiscoverLoading] = useState<Set<string>>(new Set());
  const [editingLane, setEditingLane]     = useState<string | null>(null);
  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);

  const log = (msg: string) => setConsoleLog(prev => [...prev.slice(-20), `> ${msg}`]);

  const removeFromQueue = (idx: number) => {
    const next = queue.filter((_, i) => i !== idx);
    queueRef.current = next;
    setQueue(next);
  };

  const clearQueue = () => {
    queueRef.current = [];
    setQueue([]);
    setShowQueue(false);
  };

  const loadDiscoverLane = async (lane: DiscoverLane) => {
    const providers = lane.service === 'all'
      ? ALL_PROVIDERS.filter(p => p !== 'Alle' && isProviderAvailable(p))
      : [lane.service];

    setDiscoverLoading(prev => new Set(prev).add(lane.id));
    try {
      const settled = await Promise.allSettled(
        providers.map(p => mediaService.discover(p, lane.type, {
          limit: Math.ceil(lane.limit / providers.length),
          fromYear: lane.fromYear,
          toYear:   lane.toYear,
          genre:    lane.genre,
        }))
      );
      const items: MediaItem[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') items.push(...r.value.items);
      }
      setDiscoverData(prev => ({ ...prev, [lane.id]: items.slice(0, lane.limit) }));
    } catch {}
    setDiscoverLoading(prev => { const s = new Set(prev); s.delete(lane.id); return s; });
  };

  const loadAllDiscoverLanes = () => {
    settings.discoverLanes.filter(l => l.enabled).forEach(loadDiscoverLane);
  };

  const reorderQueue = (from: number, to: number) => {
    if (from === to) return;
    const next = [...queue];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    queueRef.current = next;
    setQueue(next);
  };

  // Health-Check beim Start
  useEffect(() => {
    getServiceStatus().then(status => {
      setServiceStatus(status);
      const enabled = Object.entries(status).filter(([, v]) => v).map(([k]) => k);
      log(`Backend erreichbar. Aktive Services: ${enabled.join(', ') || 'keine'}`);
    });
  }, []);

  // Service-Config und Auth-Status laden wenn Settings-Panel öffnet
  useEffect(() => {
    if (!showSettings) return;
    setServiceConfig(null);
    setSvcSaveStatus('idle');
    serviceSettings.get().then(setServiceConfig).catch(() => {});
    getAuthStatus().then(setAuthStatus).catch(() => {});
  }, [showSettings]);

  const doGlobalSearch = async (query: string, rtype: ResultType) => {
    setIsLoading(true);
    setError(null);
    const parsed = parseQuery(query);
    const effectiveQuery = parsed.nativeQuery || query;
    const activeProviders = ALL_PROVIDERS.filter(p => p !== 'Alle' && isProviderAvailable(p));
    const filterHint = parsed.hasFilters ? ' [Filter]' : '';
    log(`Globale Suche nach "${query}" (${rtype}) in ${activeProviders.length} Services${filterHint}...`);
    try {
      const settled = await Promise.allSettled(
        activeProviders.map(p => mediaService.search(effectiveQuery, p, rtype, 0, 5))
      );
      const allItems: MediaItem[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') allItems.push(...r.value.items);
      }
      const filtered = parsed.hasFilters ? allItems.filter(parsed.matches) : allItems;
      const failed = settled.filter(r => r.status === 'rejected').length;
      setResults(filtered);
      setTotalResults(filtered.length);
      setCurrentOffset(0);
      setCoverFlowIndex(Math.floor(filtered.length / 2));
      log(`${filtered.length} Treffer aus ${activeProviders.length - failed}/${activeProviders.length} Services.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg); setResults([]); setTotalResults(0);
      log(`Fehler: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const doGlobalBrowse = async (rtype: ResultType) => {
    setIsLoading(true);
    setBrowseType(rtype);
    setError(null);
    const activeProviders = ALL_PROVIDERS.filter(p => p !== 'Alle' && isProviderAvailable(p) && BROWSABLE_PROVIDERS.has(p));
    const typeLabel = rtype === 'albums' ? 'Alben' : rtype === 'artists' ? 'Künstler' : 'Titel';
    log(`Globaler Index: lade ${typeLabel} aus ${activeProviders.length} Services...`);
    try {
      const settled = await Promise.allSettled(
        activeProviders.map(p => mediaService.browse(p, rtype, 0, 10))
      );
      const allItems: MediaItem[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') allItems.push(...r.value.items);
      }
      const failed = settled.filter(r => r.status === 'rejected').length;
      setResults(allItems);
      setTotalResults(allItems.length);
      setCurrentOffset(0);
      setCoverFlowIndex(Math.floor(allItems.length / 2));
      log(`${allItems.length} ${typeLabel} aus ${activeProviders.length - failed}/${activeProviders.length} Services.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg); setResults([]); setTotalResults(0);
      log(`Fehler: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const doSearch = async (query: string, provider: string, rtype: ResultType, offset = 0) => {
    if (provider === 'Alle') { await doGlobalSearch(query, rtype); return; }
    setIsLoading(true);
    setError(null);
    const parsed = parseQuery(query);
    const effectiveQuery = parsed.nativeQuery || query;
    const pageInfo = offset > 0 ? ` (Seite ${Math.floor(offset / settings.searchLimit) + 1})` : '';
    const filterHint = parsed.hasFilters ? ' [Filter]' : '';
    log(`Suche nach "${query}" in ${provider} (${rtype})${pageInfo}${filterHint}...`);
    try {
      const { items, total } = await mediaService.search(effectiveQuery, provider, rtype, offset, settings.searchLimit);
      const filtered = parsed.hasFilters ? items.filter(parsed.matches) : items;
      setResults(filtered);
      setTotalResults(parsed.hasFilters ? filtered.length : total);
      setCurrentOffset(offset);
      setCoverFlowIndex(Math.floor(filtered.length / 2));
      log(`${filtered.length} von ${parsed.hasFilters ? filtered.length : total} Ergebnis${total !== 1 ? 'sen' : ''} geladen.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResults([]);
      setTotalResults(0);
      log(`Fehler: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Bei Provider-Wechsel: Suche/Browse wiederholen oder Home laden
  useEffect(() => {
    setBrowseType(null);
    setResults([]);
    setTotalResults(0);
    setCurrentOffset(0);
    setNavStack([]);
    setHubLetter(null);
    setHubSearch('');
    setArtistDetail(null);
    setError(null);
    if (activeProvider === 'Alle') {
      setHomeSections([]);
      return; // Kein Home für globalen Modus
    }
    if (lastSearched) {
      doSearch(lastSearched, activeProvider, activeResultType, 0);
    } else {
      setHomeSections([]);
      setHomeLoading(true);
      mediaService.getHomeData(activeProvider)
        .then(sections => {
          setHomeSections(sections);
          if (sections.length) log(`Home: ${sections.map(s => s.title).join(', ')}`);
        })
        .catch(() => {})
        .finally(() => setHomeLoading(false));
    }
  }, [activeProvider]);

  // Bei Ergebnistyp-Wechsel während aktiver Suche: erneut suchen
  useEffect(() => {
    if (lastSearched) {
      doSearch(lastSearched, activeProvider, activeResultType, 0);
    }
  }, [activeResultType]);

  // Discover-Lanes beim Tab-Wechsel auf Discover oder beim Provider-Wechsel laden.
  // Beim Provider-Wechsel: setDiscoverData({}) würde erst im nächsten Render greifen, deshalb
  // prüfen wir per Ref ob der Provider gewechselt hat und laden dann alle Lanes neu.
  useEffect(() => {
    if (activeView !== 'discover') return;
    const providerChanged = prevDiscoverProviderRef.current !== activeProvider;
    prevDiscoverProviderRef.current = activeProvider;
    if (providerChanged) {
      setDiscoverData({});
      settings.discoverLanes.filter(l => l.enabled && !discoverLoading.has(l.id)).forEach(loadDiscoverLane);
    } else {
      const unloaded = settings.discoverLanes.filter(l => l.enabled && !discoverData[l.id] && !discoverLoading.has(l.id));
      if (unloaded.length > 0) unloaded.forEach(loadDiscoverLane);
    }
  }, [activeView, activeProvider]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      // Suche leeren → zurück zur Startseite
      setLastSearched('');
      setResults([]);
      setTotalResults(0);
      setCurrentOffset(0);
      setNavStack([]);
      setError(null);
      setHomeSections([]);
      setHomeLoading(true);
      mediaService.getHomeData(activeProvider)
        .then(sections => { setHomeSections(sections); })
        .catch(() => {})
        .finally(() => setHomeLoading(false));
      return;
    }
    setLastSearched(searchQuery.trim());
    setCurrentOffset(0);
    setTotalResults(0);
    doSearch(searchQuery.trim(), activeProvider, activeResultType, 0);
  };

  const BROWSABLE_PROVIDERS = new Set(['SubSonic', 'Madsonic', 'Navidrome', 'Airsonic', 'Jellyfin', 'Spotify', 'Plex', 'Tidal']);

  const isHomeView = !lastSearched && browseType === null && navStack.length === 0 && activeProvider !== 'Alle';

  const goHome = () => {
    setBrowseType(null);
    setLastSearched('');
    setSearchQuery('');
    setResults([]);
    setTotalResults(0);
    setCurrentOffset(0);
    setNavStack([]);
    setError(null);
    if (activeView === 'discover') setActiveView('coverflow');
    setHomeSections([]);
    if (activeProvider === 'Alle') return; // kein Home für globalen Modus
    setHomeLoading(true);
    mediaService.getHomeData(activeProvider)
      .then(sections => setHomeSections(sections))
      .catch(() => {})
      .finally(() => setHomeLoading(false));
  };

  const doBrowse = async (type: ResultType, provider: string, offset = 0) => {
    setIsLoading(true);
    setBrowseType(type);
    setError(null);
    const typeLabel = type === 'albums' ? 'Alben' : type === 'artists' ? 'Künstler' : 'Titel';
    log(`Index: lade ${typeLabel} von ${provider}...`);
    try {
      const { items, total } = await mediaService.browse(provider, type, offset, settings.browseLimit);
      setResults(items);
      setTotalResults(total);
      setCurrentOffset(offset);
      setCoverFlowIndex(Math.floor(items.length / 2));
      log(`${items.length} ${typeLabel} geladen.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResults([]);
      log(`Fehler: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isProviderAvailable = (provider: string): boolean => {
    if (provider === 'Alle') {
      return !serviceStatus || Object.values(serviceStatus).filter(Boolean).length >= 2;
    }
    if (!serviceStatus) return true; // noch nicht geladen → alle zeigen
    const key = PROVIDER_SERVICE[provider];
    return serviceStatus[key] ?? false;
  };

  const ensureSpotifyPlayer = async () => {
    if (spotifyInitialized.current) return;
    spotifyInitialized.current = true;
    try {
      await spotifyPlayer.init(
        state => {
          setIsPlaying(!state.paused);
          setCurrentTime(state.position / 1000);
          setDuration(state.duration / 1000);
          setProgress(state.duration > 0 ? (state.position / state.duration) * 100 : 0);
        },
        msg => log(`[Spotify] ${msg}`),
      );
      log('[Spotify] Player bereit');
    } catch (e) {
      log(`[Spotify] ${e instanceof Error ? e.message : String(e)}`);
      spotifyInitialized.current = false;
    }
  };

  const startConsoleDrag = (e: React.MouseEvent) => {
    consoleDragRef.current = { startY: e.clientY, startH: consoleHeight };
    const onMove = (ev: MouseEvent) => {
      if (!consoleDragRef.current) return;
      const delta = consoleDragRef.current.startY - ev.clientY;
      setConsoleHeight(Math.max(80, Math.min(500, consoleDragRef.current.startH + delta)));
    };
    const onUp = () => {
      consoleDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const playTrack = (track: MediaItem, fromQueue = false) => {
    if (!fromQueue) {
      // Queue aus aktuellen Ergebnissen aufbauen wenn der Track darin vorkommt
      const tracks = results.filter(r => r.itemType === 'track');
      if (tracks.some(t => t.id === track.id)) {
        queueRef.current = tracks;
        setQueue(tracks);
      }
    }
    setCurrentTrack(track);
    setIsPlaying(true);
    setSpotifyFallback(false); // Reset bei jedem neuen Track
    log(`[Player] ${track.artist} – ${track.title}`);
    if (track.streamUrl) log(`[Stream] ${track.provider}: ${track.streamUrl}`);

    if (track.provider === 'spotify') {
      audioRef.current?.pause();
      ensureSpotifyPlayer()
        .then(() => spotifyPlayer.play(track.id))
        .catch(e => {
          const msg = e instanceof Error ? e.message : String(e);
          log(`[Spotify] ${msg}`);
          // Fallback auf previewUrl wenn kein Premium oder Device nicht verfügbar
          if (track.streamUrl && (spotifyPlayer.noPremium || msg.includes('Premium') || msg.includes('kein Device'))) {
            log('[Spotify] Fallback: Vorschau-URL (30 Sekunden)');
            setSpotifyFallback(true);
          }
        });
    } else {
      // Spotify SDK pausieren falls aktiv
      if (spotifyInitialized.current) spotifyPlayer.togglePlay().catch(() => {});
    }
  };

  const skipNext = () => {
    if (!currentTrack) return;
    const q = queueRef.current;
    const idx = q.findIndex(t => t.id === currentTrack.id);
    if (idx >= 0 && idx < q.length - 1) playTrack(q[idx + 1], true);
  };

  const skipPrev = () => {
    if (!currentTrack) return;
    if (currentTime > 3) {
      // Mehr als 3 Sekunden gespielt → aktuellen Track neu starten
      if (audioRef.current) audioRef.current.currentTime = 0;
      if (currentTrack.provider === 'spotify' && !spotifyFallback) {
        spotifyPlayer.seek(0).catch(() => {});
      }
      setCurrentTime(0); setProgress(0);
      return;
    }
    const q = queueRef.current;
    const idx = q.findIndex(t => t.id === currentTrack.id);
    if (idx > 0) playTrack(q[idx - 1], true);
  };

  const drillInto = (items: MediaItem[], total: number, label: string) => {
    setNavStack(prev => [...prev, { label, items: results, total: totalResults }]);
    setResults(items);
    setTotalResults(total);
    setCurrentOffset(0);
    setCoverFlowIndex(Math.floor(items.length / 2));
    if (activeView === 'discover') setActiveView('galerie');
  };

  const navBack = () => {
    setNavStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setResults(last.items);
      setTotalResults(last.total);
      setCurrentOffset(0);
      setCoverFlowIndex(Math.floor(last.items.length / 2));
      return prev.slice(0, -1);
    });
  };

  const resolveProvider = (item: MediaItem): string => {
    if (activeProvider !== 'Alle') return activeProvider;
    const target = item.provider ? SERVICE_TO_PROVIDER[item.provider] : undefined;
    if (target) setActiveProvider(target);
    return target ?? activeProvider;
  };

  const handleItemClick = async (item: MediaItem) => {
    const provider = resolveProvider(item);
    if (item.itemType === 'track') {
      playTrack(item);
    } else if (item.itemType === 'album') {
      setIsLoading(true);
      log(`Lade Titel für Album "${item.title}"...`);
      try {
        const page = await mediaService.getAlbumTracks(provider, item.id);
        drillInto(page.items, page.total, `${item.artist} – ${item.title}`);
        log(`${page.items.length} Titel in "${item.title}"`);
      } catch (e) {
        log(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsLoading(false);
      }
    } else if (item.itemType === 'artist') {
      setIsLoading(true);
      log(`Lade Alben von "${item.title}"...`);
      try {
        const page = await mediaService.getArtistAlbums(provider, item.id);
        drillInto(page.items, page.total, `${item.title}`);
        log(`${page.items.length} Alben von "${item.title}"`);
      } catch (e) {
        log(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsLoading(false);
      }
    } else if (item.itemType === 'playlist') {
      setIsLoading(true);
      log(`Lade Titel aus Playlist "${item.title}"...`);
      try {
        const page = await mediaService.getPlaylistTracks(provider, item.id);
        drillInto(page.items, page.total, item.title);
        log(`${page.items.length} Titel in "${item.title}"`);
      } catch (e) {
        log(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleArtistClick = async (artistName: string, itemProvider: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!artistName.trim()) return;
    const provider = (activeProvider === 'Alle' && itemProvider)
      ? SERVICE_TO_PROVIDER[itemProvider] ?? activeProvider
      : activeProvider;
    if (activeProvider === 'Alle' && itemProvider) {
      const target = SERVICE_TO_PROVIDER[itemProvider];
      if (target) setActiveProvider(target);
    }
    setIsLoading(true);
    log(`Suche Künstler "${artistName}"...`);
    try {
      const page = await mediaService.search(artistName, provider, 'artists', 0, 10);
      if (page.items.length === 0) {
        log(`Kein Künstler "${artistName}" gefunden`);
        return;
      }
      const exact  = page.items.find(a => a.title.toLowerCase() === artistName.toLowerCase());
      const artist = exact ?? (page.items.length === 1 ? page.items[0] : null);
      if (artist) {
        const albumPage = await mediaService.getArtistAlbums(provider, artist.id);
        drillInto(albumPage.items, albumPage.total, artist.title);
        log(`${albumPage.items.length} Alben von "${artist.title}"`);
      } else {
        drillInto(page.items, page.total, `Künstler: ${artistName}`);
      }
    } catch (err) {
      log(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (currentTrack?.provider === 'spotify' && !spotifyFallback) {
      spotifyPlayer.togglePlay().catch(e => log(`[Spotify] ${e}`));
    } else if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play().catch(e => log(`Playback-Fehler: ${e}`));
      setIsPlaying(!isPlaying);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay       = () => setIsPlaying(true);
    const onPause      = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / (audio.duration || 1)) * 100);
    };
    const onMeta  = () => setDuration(audio.duration);
    const onError = () => {
      const e = audio.error;
      const msg = e ? `MediaError ${e.code}` : 'Unbekannt';
      log(`[Stream] Fehler: ${msg} — ${audio.src}`);
      setIsPlaying(false);
    };
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('timeupdate',     onTimeUpdate);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('error',          onError);
    return () => {
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('timeupdate',     onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('error',          onError);
    };
  }, [currentTrack]);

  // Spotify-Position alle 500ms aktualisieren (SDK feuert keine kontinuierlichen Events)
  useEffect(() => {
    if (currentTrack?.provider !== 'spotify' || !isPlaying || spotifyFallback) return;
    const id = setInterval(async () => {
      const state = await spotifyPlayer.getCurrentState();
      if (state && !state.paused) {
        setCurrentTime(state.position / 1000);
        setProgress(state.duration > 0 ? (state.position / state.duration) * 100 : 0);
      }
    }, 500);
    return () => clearInterval(id);
  }, [currentTrack?.provider, isPlaying, spotifyFallback]);

  // Lautstärke synchronisieren + persistieren
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (currentTrack?.provider === 'spotify' && !spotifyFallback) {
      spotifyPlayer.setVolume(volume).catch(() => {});
    }
    saveSettings({ ...loadSettings(), volume });
  }, [volume, currentTrack?.provider, spotifyFallback]);

  useEffect(() => {
    saveSettings({ ...loadSettings(), hubColumns });
  }, [hubColumns]);

  const formatTime = (t: number) => {
    if (isNaN(t)) return '0:00';
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const b        = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - b.left) / b.width;
    if (currentTrack?.provider === 'spotify' && !spotifyFallback) {
      spotifyPlayer.seek(fraction * duration * 1000).catch(() => {});
    } else if (audioRef.current && duration) {
      audioRef.current.currentTime = fraction * duration;
    }
  };

  // ---- Views ----

  const renderPlaceholder = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 select-none">
      <Search size={48} className="opacity-30" />
      <p className="text-lg">Suche nach Musik, Alben oder Künstlern</p>
      <p className="text-sm">{isProviderAvailable(activeProvider) ? activeProvider : `${activeProvider} ist nicht aktiv`}</p>
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
      <AlertCircle size={40} />
      <p className="text-base font-medium">Fehler beim Laden</p>
      <p className="text-sm text-slate-400 max-w-md text-center">{error}</p>
    </div>
  );

  const DISCOVER_TYPES: DiscoverType[] = ['random', 'newest', 'frequent', 'recent', 'starred', 'byYear', 'byGenre'];
  const LANE_PROVIDERS = ['all', ...ALL_PROVIDERS.filter(p => p !== 'Alle' && isProviderAvailable(p))];

  const DECADES = [
    { label: '60er', from: 1960, to: 1969 },
    { label: '70er', from: 1970, to: 1979 },
    { label: '80er', from: 1980, to: 1989 },
    { label: '90er', from: 1990, to: 1999 },
    { label: '2000er', from: 2000, to: 2009 },
    { label: '2010er', from: 2010, to: 2019 },
    { label: '2020er', from: 2020, to: 2029 },
  ];

  const loadGenreSuggestions = async (lane: DiscoverLane) => {
    setGenresLoading(true);
    setGenreSuggestions([]);
    const providers = lane.service === 'all'
      ? ALL_PROVIDERS.filter(p => p !== 'Alle' && isProviderAvailable(p))
      : [lane.service];
    const results = await Promise.allSettled(providers.map(p => mediaService.getGenres(p)));
    const all = new Set<string>();
    for (const r of results) {
      if (r.status === 'fulfilled') r.value.forEach(g => all.add(g));
    }
    setGenreSuggestions([...all].sort((a, b) => a.localeCompare(b)));
    setGenresLoading(false);
  };

  const updateLane = (id: string, patch: Partial<DiscoverLane>) => {
    const lane = settings.discoverLanes.find(l => l.id === id);
    if (patch.type && patch.type !== lane?.type) {
      if (patch.type === 'byYear' && !patch.fromYear) { patch.fromYear = 1980; patch.toYear = 1989; }
      if (patch.type === 'byGenre') { patch.genre = undefined; setGenreSuggestions([]); }
    }
    const next = { ...settings, discoverLanes: settings.discoverLanes.map(l => l.id === id ? { ...l, ...patch } : l) };
    setSettings(next);
    saveSettings(next);
  };

  const addLane = () => {
    const id = `d${Date.now()}`;
    const lane: DiscoverLane = { id, type: 'random', label: 'Neue Lane', service: 'all', limit: 20, enabled: true };
    const next = { ...settings, discoverLanes: [...settings.discoverLanes, lane] };
    setSettings(next);
    saveSettings(next);
    setEditingLane(id);
  };

  const removeLane = (id: string) => {
    const next = { ...settings, discoverLanes: settings.discoverLanes.filter(l => l.id !== id) };
    setSettings(next);
    saveSettings(next);
    setDiscoverData(prev => { const d = { ...prev }; delete d[id]; return d; });
  };

  const renderDiscover = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 flex-shrink-0 bg-black/10">
        <span className="text-sm font-medium text-white flex items-center gap-2"><Compass size={15} className="text-primary" /> Entdecken</span>
        <div className="flex items-center gap-2">
          <button onClick={addLane} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
            <Plus size={13} /> Lane
          </button>
          <button onClick={loadAllDiscoverLanes} title="Alle neu laden" className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Lanes */}
      <div className="overflow-y-auto flex-1 py-3" style={{ scrollbarWidth: 'thin' }}>
        {settings.discoverLanes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2 text-sm">
            <Compass size={28} className="opacity-30" />
            <p>Keine Lanes konfiguriert</p>
            <button onClick={addLane} className="text-primary hover:underline text-xs">Lane hinzufügen</button>
          </div>
        )}

        {settings.discoverLanes.map(lane => {
          const items    = discoverData[lane.id] ?? [];
          const loading  = discoverLoading.has(lane.id);
          const isEditing = editingLane === lane.id;

          return (
            <div key={lane.id} className={`mb-5 ${!lane.enabled ? 'opacity-40' : ''}`}>
              {/* Lane Header */}
              <div className="flex items-center gap-2 px-4 mb-2">
                <span className="text-sm font-semibold text-white flex-1 truncate">{lane.label}</span>
                <span className="text-[10px] text-slate-600 bg-white/5 rounded px-1.5 py-0.5">{DISCOVER_TYPE_LABELS[lane.type]}</span>
                {lane.service !== 'all' && <span className="text-[10px] text-slate-600">{lane.service}</span>}
                <button onClick={() => setEditingLane(isEditing ? null : lane.id)} title="Konfigurieren" className="text-slate-500 hover:text-white transition-colors p-0.5"><Settings size={13} /></button>
                <button onClick={() => updateLane(lane.id, { enabled: !lane.enabled })} title={lane.enabled ? 'Deaktivieren' : 'Aktivieren'} className="text-slate-500 hover:text-white transition-colors p-0.5">
                  {lane.enabled ? <ToggleRight size={15} className="text-primary" /> : <ToggleLeft size={15} />}
                </button>
                <button onClick={() => { if (!loading && lane.enabled) loadDiscoverLane(lane); }} title="Neu laden" className="text-slate-500 hover:text-white transition-colors p-0.5 disabled:opacity-30" disabled={loading || !lane.enabled}>
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => removeLane(lane.id)} title="Entfernen" className="text-slate-600 hover:text-red-400 transition-colors p-0.5"><X size={13} /></button>
              </div>

              {/* Edit Panel */}
              {isEditing && (
                <div className="mx-4 mb-3 p-3 bg-white/4 border border-white/10 rounded-lg grid grid-cols-2 gap-2 text-xs">
                  <div className="col-span-2 flex gap-2">
                    <div className="flex-1">
                      <label className="text-slate-500 block mb-1">Bezeichnung</label>
                      <input value={lane.label} onChange={e => updateLane(lane.id, { label: e.target.value })}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">Limit</label>
                      <input type="number" min={5} max={50} value={lane.limit} onChange={e => updateLane(lane.id, { limit: parseInt(e.target.value) || 20 })}
                        className="w-16 bg-black/30 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-primary/50 [appearance:textfield]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Typ</label>
                    <select value={lane.type} onChange={e => updateLane(lane.id, { type: e.target.value as DiscoverType })}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white focus:outline-none">
                      {DISCOVER_TYPES.map(t => <option key={t} value={t}>{DISCOVER_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Service</label>
                    <select value={lane.service} onChange={e => updateLane(lane.id, { service: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white focus:outline-none">
                      <option value="all">Alle Services</option>
                      {LANE_PROVIDERS.filter(p => p !== 'all').map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  {lane.type === 'byYear' && (
                    <div className="col-span-2">
                      <label className="text-slate-500 block mb-1">Jahrzehnt</label>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {DECADES.map(d => (
                          <button key={d.label}
                            onClick={() => updateLane(lane.id, { fromYear: d.from, toYear: d.to, label: `${d.label} Jahre` })}
                            className={`px-2 py-0.5 rounded text-[11px] border transition-colors
                              ${lane.fromYear === d.from && lane.toYear === d.to
                                ? 'bg-primary/20 border-primary/50 text-primary'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/30'}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-slate-600 block mb-1 text-[10px]">Von</label>
                          <input type="number" value={lane.fromYear ?? 1980} onChange={e => updateLane(lane.id, { fromYear: parseInt(e.target.value) })}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-primary/50 [appearance:textfield]" />
                        </div>
                        <div className="flex-1">
                          <label className="text-slate-600 block mb-1 text-[10px]">Bis</label>
                          <input type="number" value={lane.toYear ?? 1989} onChange={e => updateLane(lane.id, { toYear: parseInt(e.target.value) })}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-primary/50 [appearance:textfield]" />
                        </div>
                      </div>
                    </div>
                  )}
                  {lane.type === 'byGenre' && (
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-500">Genre</label>
                        <button onClick={() => loadGenreSuggestions(lane)}
                          className="text-[10px] text-slate-500 hover:text-primary transition-colors flex items-center gap-1">
                          <RefreshCw size={10} className={genresLoading ? 'animate-spin' : ''} />
                          Genres laden
                        </button>
                      </div>
                      <input value={lane.genre ?? ''} onChange={e => updateLane(lane.id, { genre: e.target.value })}
                        placeholder="z. B. Rock, Pop, Jazz"
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 mb-2" />
                      {genreSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          {genreSuggestions.map(g => (
                            <button key={g} onClick={() => updateLane(lane.id, { genre: g, label: g })}
                              className={`px-2 py-0.5 rounded text-[11px] border transition-colors
                                ${lane.genre === g
                                  ? 'bg-primary/20 border-primary/50 text-primary'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/30'}`}>
                              {g}
                            </button>
                          ))}
                        </div>
                      )}
                      {!lane.genre && (
                        <p className="text-[10px] text-amber-500/70 mt-1">Genre erforderlich — bitte auswählen oder eingeben</p>
                      )}
                    </div>
                  )}
                  <div className="col-span-2 flex justify-end gap-2 pt-1">
                    <button onClick={() => { loadDiscoverLane(lane); setEditingLane(null); }}
                      className="text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded px-3 py-1 transition-colors">
                      Laden & Schließen
                    </button>
                    <button onClick={() => setEditingLane(null)} className="text-xs text-slate-400 hover:text-white px-2 py-1">Schließen</button>
                  </div>
                </div>
              )}

              {/* Items */}
              {lane.enabled && (
                lane.type === 'byGenre' && !lane.genre ? (
                  <div className="px-4 flex items-center gap-1.5 text-amber-500/60 text-xs">
                    <AlertCircle size={12} />
                    <span>Kein Genre konfiguriert — Zahnrad öffnen und Genre auswählen</span>
                  </div>
                ) : loading ? (
                  <div className="flex items-center gap-2 px-4 text-slate-600 text-xs"><RefreshCw size={12} className="animate-spin" /> Lade…</div>
                ) : items.length === 0 ? (
                  <div className="px-4 text-slate-600 text-xs">
                    <button onClick={() => loadDiscoverLane(lane)} className="hover:text-slate-400 underline underline-offset-2">Laden</button>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'thin' }}>
                    {items.map((item, i) => (
                      <div
                        key={`${item.id}-${i}`}
                        onClick={() => handleItemClick(item)}
                        className="flex-shrink-0 w-36 cursor-pointer group"
                      >
                        <div className="w-36 h-36 rounded-lg overflow-hidden bg-black/40 border border-white/8 group-hover:border-white/20 transition-colors shadow-md">
                          <CoverImage
                            src={item.coverUrl} alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            placeholder={<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900"><ListMusic size={24} className="text-slate-600" /></div>}
                          />
                        </div>
                        <div className="mt-1.5 px-0.5">
                          <div className="text-xs font-medium text-white truncate group-hover:text-primary transition-colors">{item.title}</div>
                          <div className="text-[10px] text-slate-500 truncate">{item.artist}</div>
                          {item.year && <div className="text-[10px] text-slate-700">{item.year}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderArtistHub = () => {
    const artists = results.filter(r => r.itemType === 'artist' || !r.itemType);

    const availableLetters = new Set(artists.map(a => hubFirstLetter(a.title)));

    let filtered = artists;
    if (hubLetter) {
      filtered = filtered.filter(a => hubFirstLetter(a.title) === hubLetter);
    }
    if (hubSearch.trim()) {
      const needle = hubFold(hubSearch.trim());
      filtered = filtered.filter(a => hubFold(a.title).includes(needle));
    }
    filtered = [...filtered].sort((a, b) =>
      a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }),
    );

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Alphabet bar */}
        <div className="flex flex-wrap gap-px px-3 py-2 border-b border-white/5 flex-shrink-0 bg-black/20">
          {HUB_ALPHABET.map(letter => {
            const available = availableLetters.has(letter);
            const active = hubLetter === letter;
            return (
              <button
                key={letter}
                onClick={() => setHubLetter(active ? null : letter)}
                disabled={!available}
                title={letter}
                className={`w-7 h-7 text-xs font-mono rounded transition-colors
                  ${active
                    ? 'bg-primary text-black font-bold'
                    : available
                      ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                      : 'text-slate-700 cursor-default'}`}
              >{letter}</button>
            );
          })}
        </div>

        {/* Search + count */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={hubSearch}
              onChange={e => setHubSearch(e.target.value)}
              placeholder="Künstler filtern..."
              className="w-full bg-black/30 border border-white/10 rounded py-1.5 pl-8 pr-7 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50"
            />
            {hubSearch && (
              <button onClick={() => setHubSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
            )}
          </div>
          <span className="text-xs text-slate-600 flex-shrink-0">
            {filtered.length} Künstler{(hubLetter || hubSearch) ? ' (gefiltert)' : ''}
          </span>
          {/* Spalten-Picker */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            <span className="text-xs text-slate-600 mr-1">Spalten</span>
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setHubColumns(n)}
                className={`w-6 h-6 text-xs rounded transition-colors ${hubColumns === n ? 'bg-primary text-black font-bold' : 'text-slate-400 hover:bg-white/10'}`}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Artist grid */}
        <div className="overflow-y-auto flex-1 px-4 py-3" style={{ scrollbarWidth: 'thin' }}>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Keine Künstler gefunden</div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${hubColumns}, minmax(0, 1fr))` }}>
              {filtered.map((item, i) => (
                <div
                  key={`${item.id}-${i}`}
                  onClick={() => setArtistDetail(item)}
                  className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/6 border border-white/8 hover:border-white/20 rounded-xl cursor-pointer transition-all group"
                >
                  {/* Artist photo */}
                  <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/10 shadow-inner">
                    <CoverImage
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      placeholder={
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                          <span className="text-2xl font-bold text-slate-600 select-none">
                            {item.title[0]?.toUpperCase()}
                          </span>
                        </div>
                      }
                    />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate leading-snug">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.provider && (
                        <span className="text-[10px] text-slate-500">
                          {SERVICE_TO_PROVIDER[item.provider] ?? item.provider}
                        </span>
                      )}
                      {item.albumCount != null && (
                        <span className="text-[10px] text-slate-600">
                          {item.albumCount} {item.albumCount === 1 ? 'Album' : 'Alben'}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-700 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGalerie = () => (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {results.map((item) => (
        <div
          key={item.id}
          className="bg-[#252526] border border-white/10 hover:border-white/30 cursor-pointer group flex flex-col"
          onClick={() => handleItemClick(item)}
        >
          <div className="aspect-square w-full bg-[#1e1e1e] relative overflow-hidden flex-shrink-0">
            <CoverImage
              src={item.coverUrl} alt={item.title} className="w-full h-full object-cover"
              placeholder={<div className="w-full h-full flex items-center justify-center text-white/20 text-xs text-center p-2 bg-slate-800">{item.title}</div>}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div className="w-12 h-12 rounded-full bg-black/60 border border-white/30 flex items-center justify-center hover:scale-110 transition-transform">
                <Play fill="white" size={20} className="ml-1 text-white" />
              </div>
            </div>
            {activeProvider === 'Alle' && item.provider && (
              <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-slate-300 pointer-events-none">
                {SERVICE_TO_PROVIDER[item.provider] ?? item.provider}
              </div>
            )}
          </div>
          <div className="flex flex-col flex-1 p-3 border-t border-white/10">
            <h3 className="text-white font-medium text-sm truncate" title={item.title}>{item.title}</h3>
            <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
            <p
              className="text-slate-400 text-xs truncate hover:text-slate-200 cursor-pointer flex-1 min-w-0"
              title={item.artist}
              onClick={e => { if (item.artist) handleArtistClick(item.artist, item.provider, e); }}
            >
              {item.artist}
            </p>
            {item.year && <span className="text-slate-600 text-xs flex-shrink-0">{item.year}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderListe = () => (
    <div className="bg-[#1e1e1e] rounded-lg border border-white/10 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-black/40 text-slate-400 text-xs uppercase tracking-wider">
            <th className="p-3 w-12 text-center">#</th>
            <th className="p-3 w-16"></th>
            <th className="p-3">Titel</th>
            <th className="p-3 hidden md:table-cell">Künstler</th>
            <th className="p-3 hidden lg:table-cell">{browseType === 'albums' ? 'Jahr' : 'Album'}</th>
            <th className="p-3 w-20 text-center"><Clock size={14} className="inline-block" /></th>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => (
            <tr
              key={item.id}
              className={`border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${currentTrack?.id === item.id ? 'bg-primary/20' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              <td className="p-3 text-center text-slate-500 text-sm">
                {currentTrack?.id === item.id && isPlaying
                  ? <div className="w-3 h-3 bg-primary rounded-full animate-pulse mx-auto" />
                  : index + 1}
              </td>
              <td className="p-3">
                <div className="w-10 h-10 bg-black/40 rounded overflow-hidden">
                  <CoverImage
                    src={item.coverUrl} className="w-full h-full object-cover"
                    placeholder={<ListMusic size={20} className="m-auto mt-2 text-slate-500" />}
                  />
                </div>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-white">{item.title}</span>
                  {activeProvider === 'Alle' && item.provider && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-slate-400 whitespace-nowrap flex-shrink-0">
                      {SERVICE_TO_PROVIDER[item.provider] ?? item.provider}
                    </span>
                  )}
                </div>
                <div
                  className="text-xs text-slate-500 md:hidden hover:text-slate-300 cursor-pointer inline-block"
                  onClick={e => { if (item.artist) handleArtistClick(item.artist, item.provider, e); }}
                >
                  {item.artist}
                </div>
              </td>
              <td className="p-3 hidden md:table-cell">
                <span
                  className="text-slate-300 hover:text-white hover:underline cursor-pointer"
                  onClick={e => { if (item.artist) handleArtistClick(item.artist, item.provider, e); }}
                >
                  {item.artist}
                </span>
              </td>
              <td className="p-3 text-slate-400 hidden lg:table-cell">
                {item.itemType === 'album'
                  ? (item.year ?? '–')
                  : (item.album || '–')}
              </td>
              <td className="p-3 text-center text-slate-400 text-sm">{formatTime(item.duration ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCoverFlow = () => {
    if (results.length === 0) return null;

    const handleWheel = (e: React.WheelEvent) => {
      const now = Date.now();
      if (now - lastWheelTime.current < 200) return;
      if (e.deltaY > 0) setCoverFlowIndex(prev => Math.min(results.length - 1, prev + 1));
      else              setCoverFlowIndex(prev => Math.max(0, prev - 1));
      lastWheelTime.current = now;
    };

    return (
      <div
        className="w-full h-full min-h-[400px] flex items-center justify-center coverflow-container relative overflow-hidden"
        onWheel={handleWheel}
      >
        {results.map((item, i) => {
          const offset    = i - coverFlowIndex;
          const isCenter  = offset === 0;
          const absOffset = Math.abs(offset);
          const scale     = isCenter ? 1 : Math.max(0.5, 1 - absOffset * 0.1);
          const rotateY   = isCenter ? 0 : offset > 0 ? -45 : 45;
          const opacity   = absOffset > 5 ? 0 : Math.max(0, 1 - absOffset * 0.15);

          return (
            <div
              key={item.id}
              className={`absolute coverflow-item cursor-pointer flex flex-col items-center ${absOffset > 5 ? 'pointer-events-none' : ''}`}
              style={{
                transform: `translateX(calc(${offset} * 80vw / 10)) scale(${scale}) rotateY(${rotateY}deg)`,
                zIndex: 100 - absOffset,
                opacity,
              }}
              onClick={() => { if (isCenter) handleItemClick(item); else setCoverFlowIndex(i); }}
            >
              <div className="w-48 h-48 sm:w-64 sm:h-64 rounded-xl shadow-2xl overflow-hidden border-2 border-white/10 bg-black/50 group">
                <CoverImage
                  src={item.coverUrl} className="w-full h-full object-cover"
                  placeholder={<div className="w-full h-full flex items-center justify-center text-white/20 text-xl bg-slate-800">{item.title}</div>}
                />
                {isCenter && (
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-16 h-16 rounded-full bg-black/60 border border-white/50 flex items-center justify-center hover:scale-110 transition-transform hover:bg-primary">
                      <Play fill="white" size={24} className="ml-1 text-white" />
                    </div>
                  </div>
                )}
              </div>
              <div className={`mt-8 text-center transition-opacity duration-300 w-64 ${isCenter ? 'opacity-100' : 'opacity-0'}`}>
                <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{item.title}</h2>
                <p className="text-sm text-slate-300 truncate drop-shadow-md">
                  <span
                    className="hover:underline cursor-pointer"
                    onClick={e => { e.stopPropagation(); if (item.artist) handleArtistClick(item.artist, item.provider, e); }}
                  >
                    {item.artist}
                  </span>
                  {item.year ? ` • ${item.year}` : (item.album ? ` • ${item.album}` : '')}
                </p>
              </div>
            </div>
          );
        })}

        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50 disabled:opacity-20"
          onClick={() => setCoverFlowIndex(Math.max(0, coverFlowIndex - 1))}
          disabled={coverFlowIndex === 0}
        >
          <SkipBack size={32} />
        </button>
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50 disabled:opacity-20"
          onClick={() => setCoverFlowIndex(Math.min(results.length - 1, coverFlowIndex + 1))}
          disabled={coverFlowIndex === results.length - 1}
        >
          <SkipForward size={32} />
        </button>
      </div>
    );
  };

  const renderHome = () => {
    if (homeLoading) return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
    if (homeSections.length === 0) return renderPlaceholder();
    return (
      <div className="flex flex-col gap-8 pb-4">
        {homeSections.map(section => (
          <div key={section.id}>
            <h2 className="text-white font-semibold text-base mb-3 px-1">{section.title}</h2>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {section.items.map(item => (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-36 bg-[#252526] border border-white/10 hover:border-white/30 cursor-pointer group rounded overflow-hidden"
                  onClick={() => handleItemClick(item)}
                >
                  <div className="w-36 h-36 bg-[#1e1e1e] relative overflow-hidden">
                    <CoverImage
                      src={item.coverUrl} alt={item.title} className="w-full h-full object-cover"
                      placeholder={<div className="w-full h-full flex items-center justify-center bg-slate-800"><ListMusic size={32} className="text-white/20" /></div>}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-primary/80 border border-white/30 flex items-center justify-center hover:scale-110 transition-transform">
                        <Play fill="white" size={16} className="ml-0.5 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-white text-xs font-medium truncate" title={item.title}>{item.title}</p>
                    <p className="text-slate-400 text-xs truncate mt-0.5" title={item.artist}>{item.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) return <div className="w-full h-full flex items-center justify-center"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
    if (activeView === 'discover') return renderDiscover();
    if (error)     return renderError();
    if (isHomeView) return renderHome();
    if (activeProvider === 'Alle' && !lastSearched && results.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
          <Search size={40} className="opacity-20" />
          <p className="text-lg">Globale Suche über alle aktiven Services</p>
          <p className="text-sm">Suchbegriff eingeben oder Titel / Alben / Künstler wählen zum Browsen</p>
        </div>
      );
    }
    if (results.length === 0 && lastSearched) {
      return <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2"><Search size={32} className="opacity-30" /><p>Keine Ergebnisse für „{lastSearched}"</p></div>;
    }
    if (activeView === 'artisthub') {
      if (artistDetail) {
        return (
          <ArtistDetailView
            item={artistDetail}
            provider={resolveProvider(artistDetail)}
            onBack={() => setArtistDetail(null)}
            onAlbumClick={async (album: MediaItem) => { setArtistDetail(null); await handleItemClick(album); }}
            onTrackPlay={(track: MediaItem) => playTrack(track)}
            onSimilarArtistClick={(artist: MediaItem) => setArtistDetail(artist)}
          />
        );
      }
      const hasArtists = results.some(r => r.itemType === 'artist');
      return hasArtists ? renderArtistHub() : renderGalerie();
    }
    if (activeView === 'galerie')   return renderGalerie();
    if (activeView === 'liste')     return renderListe();
    if (activeView === 'coverflow') return renderCoverFlow();
    return null;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#121212]">
      {/* Background glow */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between p-3 bg-[#1e1e1e] border-b border-black z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold shadow-lg">A</div>
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold tracking-wide">ahs2000 Media Server Portal</h1>
            <span className="text-[10px] text-slate-500 font-mono">v{__APP_VERSION__}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-white/10 rounded text-slate-300 transition-colors" onClick={() => setShowSettings(true)}><Settings size={18} /></button>
          <button className="p-2 hover:bg-white/10 rounded text-slate-300 transition-colors" onClick={() => getServiceStatus().then(s => { setServiceStatus(s); log('Status aktualisiert.'); })}><RefreshCw size={18} /></button>
        </div>
      </header>

      {/* Provider Tabs */}
      <div className="flex bg-[#252526] text-slate-300 px-2 pt-2 border-b border-black overflow-x-auto z-20">
        {ALL_PROVIDERS.map(provider => {
          const available = isProviderAvailable(provider);
          return (
            <button
              key={provider}
              onClick={() => available && setActiveProvider(provider)}
              className={`px-4 py-1.5 text-sm rounded-t-md transition-colors whitespace-nowrap relative
                ${activeProvider === provider ? 'bg-[#1e1e1e] text-white font-medium border-t-2 border-primary' : 'hover:bg-white/5 hover:text-white border-t-2 border-transparent'}
                ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {provider}
              {available && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />}
            </button>
          );
        })}
      </div>

      {/* View Mode + Result Type + Search */}
      <div className="flex justify-between items-center px-4 py-2 bg-[#1e1e1e] border-b border-black z-20">
        <div className="flex gap-1">
          <button
            onClick={goHome}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${isHomeView ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Home size={16} /> <span className="hidden sm:inline">Home</span>
          </button>
          <div className="w-px bg-white/10 mx-1" />
          {VIEWS.map(view => {
            const hubDisabled = view.id === 'artisthub' && activeResultType !== 'artists';
            const disabled = view.id === 'discover' ? false : ((isHomeView && activeView !== 'discover') || hubDisabled);
            return (
              <button
                key={view.id}
                onClick={() => !disabled && setActiveView(view.id)}
                title={hubDisabled ? 'Nur in der Künstler-Ansicht verfügbar' : view.label}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors
                  ${!disabled && activeView === view.id ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'}
                  ${disabled ? 'opacity-30 cursor-not-allowed hover:text-slate-400 hover:bg-transparent' : ''}`}
              >
                <view.icon size={16} /> <span className="hidden sm:inline">{view.label}</span>
              </button>
            );
          })}
          <div className="w-px bg-white/10 mx-1" />
          {RESULT_TYPES.map(rt => {
            const canBrowse = activeProvider === 'Alle' || BROWSABLE_PROVIDERS.has(activeProvider);
            const needsSearch = !lastSearched && !canBrowse;
            return (
              <button
                key={rt.id}
                title={needsSearch ? `Suche starten um nach ${rt.label} zu filtern` : undefined}
                onClick={() => {
                  setActiveResultType(rt.id);
                  if (!lastSearched) {
                    if (activeProvider === 'Alle') doGlobalBrowse(rt.id);
                    else if (BROWSABLE_PROVIDERS.has(activeProvider)) doBrowse(rt.id, activeProvider, 0);
                    else log(`Tipp: Suche starten um Ergebnisse nach "${rt.label}" zu filtern`);
                  }
                }}
                className={`px-3 py-1.5 rounded text-sm transition-colors
                  ${needsSearch ? 'opacity-40 cursor-default' : ''}
                  ${activeResultType === rt.id && (lastSearched || browseType) ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {rt.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSearch} className="relative w-48 sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suchen..."
            className="w-full bg-black/40 border border-white/10 rounded py-1 pl-8 pr-2 text-sm text-white focus:outline-none focus:border-primary transition-colors"
          />
        </form>
      </div>

      {/* Breadcrumb */}
      {navStack.length > 0 && (
        <div className="bg-[#252526] border-b border-black flex items-center gap-2 px-4 py-1.5 text-sm z-20 overflow-x-auto">
          <button onClick={navBack} className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors shrink-0">
            <ChevronLeft size={14} /> Zurück
          </button>
          <span className="text-slate-600 shrink-0">|</span>
          {navStack.map((frame, i) => (
            <React.Fragment key={i}>
              <button
                className="text-slate-400 hover:text-white transition-colors truncate max-w-[160px] shrink-0"
                onClick={() => setNavStack(prev => {
                  const f = prev[i];
                  setResults(f.items);
                  setTotalResults(f.total);
                  setCurrentOffset(0);
                  return prev.slice(0, i);
                })}
              >
                {frame.label || 'Suche'}
              </button>
              <span className="text-slate-600 shrink-0">/</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative p-4 pb-0 bg-gradient-to-b from-[#1e1e1e] to-[#121212]">
        <div className="pb-32 h-full">{renderContent()}</div>
      </main>

      {/* Pagination (Suche oder Browse, nicht im Drill-Down) */}
      {navStack.length === 0 && (lastSearched || browseType) && !isLoading && !error && (() => {
        const ps          = lastSearched ? settings.searchLimit : settings.browseLimit;
        if (totalResults <= ps) return null;
        const totalPages  = Math.ceil(totalResults / ps);
        const currentPage = Math.floor(currentOffset / ps) + 1;
        const atStart     = currentOffset === 0;
        const atEnd       = currentOffset + ps >= totalResults;
        const goTo = (offset: number) => lastSearched
          ? doSearch(lastSearched, activeProvider, activeResultType, offset)
          : doBrowse(browseType!, activeProvider, offset);
        const btnCls = 'flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-slate-300';
        return (
          <div className="bg-[#1e1e1e] border-t border-black flex items-center justify-between px-3 py-2 z-20 select-none gap-2">
            {/* First + Prev */}
            <div className="flex items-center gap-0.5">
              <button disabled={atStart} onClick={() => goTo(0)} title="Erste Seite" className={btnCls}>
                <ChevronsLeft size={16} />
              </button>
              <button disabled={atStart} onClick={() => goTo(currentOffset - ps)} className={btnCls}>
                <ChevronLeft size={16} /> Zurück
              </button>
            </div>

            {/* Center: page input + info */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span>Seite</span>
              <input
                key={currentPage}
                type="number"
                defaultValue={currentPage}
                min={1}
                max={totalPages}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const p = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) goTo((p - 1) * ps);
                  }
                }}
                className="w-12 text-center bg-black/40 border border-white/10 rounded py-0.5 text-white focus:outline-none focus:border-primary/50 [appearance:textfield]"
              />
              <span className="text-slate-600">von {totalPages}</span>
              <span className="text-slate-700 mx-0.5">·</span>
              <span>{currentOffset + 1}–{Math.min(currentOffset + ps, totalResults)} von {totalResults}</span>
            </div>

            {/* Next + Last */}
            <div className="flex items-center gap-0.5">
              <button disabled={atEnd} onClick={() => goTo(currentOffset + ps)} className={btnCls}>
                Weiter <ChevronRight size={16} />
              </button>
              <button disabled={atEnd} onClick={() => goTo((totalPages - 1) * ps)} title="Letzte Seite" className={btnCls}>
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* System Console — resizable nach oben ziehen */}
      <div
        className="bg-[#1e1e1e] text-slate-300 border-t border-black flex flex-col mb-[72px] z-20 relative"
        style={{ height: `${consoleHeight}px` }}
      >
        {/* Drag Handle */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 cursor-row-resize bg-transparent hover:bg-primary/40 transition-colors group"
          onMouseDown={startConsoleDrag}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 mt-0.5 rounded-full bg-white/20 group-hover:bg-primary/60 transition-colors" />
        </div>
        <div className="bg-[#252526] border-b border-black px-3 py-1 text-xs font-medium text-slate-400 flex justify-between items-center mt-1.5">
          <span>System Output</span>
          <span className="text-primary cursor-pointer hover:underline" onClick={() => setConsoleLog([])}>Clear</span>
        </div>
        <div className="flex-1 p-2 font-mono text-[11px] overflow-y-auto">
          {consoleLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </div>

      {/* Queue Panel */}
      {showQueue && queue.length > 0 && (
        <div className="fixed bottom-[90px] right-0 w-80 max-h-[50vh] bg-[#1e1e1e] border border-white/10 border-b-0 rounded-tl-xl shadow-2xl flex flex-col z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0">
            <span className="text-white font-medium text-sm">Warteschlange <span className="text-slate-400 font-normal">({queue.length})</span></span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearQueue}
                title="Warteschlange leeren"
                className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
              ><Trash2 size={13} /></button>
              <button onClick={() => setShowQueue(false)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
            {queue.map((track, i) => {
              const isCurrent = track.id === currentTrack?.id;
              return (
                <div
                  key={`${track.id}-${i}`}
                  draggable
                  onDragStart={() => { dragIndexRef.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setQueueDragOver(i); }}
                  onDrop={() => {
                    if (dragIndexRef.current !== null) reorderQueue(dragIndexRef.current, i);
                    dragIndexRef.current = null;
                    setQueueDragOver(null);
                  }}
                  onDragEnd={() => { dragIndexRef.current = null; setQueueDragOver(null); }}
                  onClick={() => playTrack(track, true)}
                  className={`flex items-center gap-2 px-2 py-2 cursor-pointer transition-colors border-b border-white/5 last:border-0 group
                    ${isCurrent ? 'bg-primary/20' : 'hover:bg-white/5'}
                    ${queueDragOver === i ? 'border-t-2 border-t-primary' : ''}`}
                >
                  <GripVertical size={12} className="text-slate-700 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                  <div className="w-4 flex-shrink-0 text-center">
                    {isCurrent && isPlaying
                      ? <div className="w-2 h-2 rounded-full bg-primary animate-pulse mx-auto" />
                      : <span className="text-[10px] text-slate-600">{i + 1}</span>
                    }
                  </div>
                  <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-black/40">
                    <CoverImage
                      src={track.coverUrl} className="w-full h-full object-cover"
                      placeholder={<ListMusic size={14} className="m-auto mt-1.5 text-slate-600" />}
                    />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className={`text-xs font-medium truncate ${isCurrent ? 'text-primary' : 'text-white'}`}>{track.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">{track.artist}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {track.provider && (
                      <span className="text-[9px] text-slate-600">{SERVICE_TO_PROVIDER[track.provider] ?? track.provider}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}
                      title="Entfernen"
                      className="text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 ml-1"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#252526] border-t border-black p-3 flex items-center justify-between z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 w-1/3 min-w-[200px]">
          <div className="w-14 h-14 bg-black/40 rounded flex items-center justify-center overflow-hidden border border-white/10 shadow-inner">
            <CoverImage
              src={currentTrack?.coverUrl} alt="Cover" className="w-full h-full object-cover"
              placeholder={<ListMusic className="text-slate-500" />}
            />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-white font-medium text-sm truncate">{currentTrack?.title || 'Wiedergabe pausiert'}</h4>
            <p className="text-slate-400 text-xs truncate">{currentTrack?.artist || 'Wähle einen Titel zum Abspielen'}</p>
          </div>
        </div>

        <div className="flex flex-col items-center flex-1 max-w-xl px-4">
          <div className="flex items-center gap-6 mb-2">
            <button
              className={`transition-colors hover:scale-110 active:scale-95 ${queue.findIndex(t => t.id === currentTrack?.id) > 0 || (currentTrack && currentTime > 3) ? 'text-slate-400 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`}
              onClick={skipPrev}
              disabled={!currentTrack}
            ><SkipBack size={20} /></button>
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95 ${currentTrack ? 'bg-primary text-white hover:bg-primary-hover shadow-primary/20' : 'bg-[#1e1e1e] text-slate-500 cursor-not-allowed border border-white/10'}`}
              onClick={togglePlay}
              disabled={!currentTrack}
            >
              {isPlaying ? <Pause fill="white" size={16} /> : <Play fill="white" size={16} className="ml-0.5" />}
            </button>
            <button
              className={`transition-colors hover:scale-110 active:scale-95 ${(() => { const idx = queue.findIndex(t => t.id === currentTrack?.id); return idx >= 0 && idx < queue.length - 1; })() ? 'text-slate-400 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`}
              onClick={skipNext}
              disabled={!currentTrack}
            ><SkipForward size={20} /></button>
          </div>
          <div className="w-full flex items-center gap-3 text-xs text-slate-400 font-medium">
            <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
            <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden cursor-pointer relative group" onClick={handleProgressClick}>
              <div className="h-full bg-primary rounded-full absolute left-0 top-0 transition-all duration-100" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="w-10 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex justify-end items-center gap-3 w-1/3 min-w-[150px]">
          <button
            onClick={() => setShowQueue(v => !v)}
            title="Warteschlange"
            className={`transition-colors hover:scale-110 active:scale-95 ${showQueue ? 'text-primary' : 'text-slate-400 hover:text-white'} ${queue.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            disabled={queue.length === 0}
          ><ListMusic size={18} /></button>
          <button
            onClick={() => {
              if (volume > 0) { prevVolumeRef.current = volume; setVolume(0); }
              else setVolume(prevVolumeRef.current || 0.7);
            }}
            className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title={volume === 0 ? 'Stummschaltung aufheben' : 'Stummschalten'}
          >
            {volume === 0    ? <VolumeX size={18} /> :
             volume < 0.35  ? <Volume  size={18} /> :
             volume < 0.7   ? <Volume1 size={18} /> :
                               <Volume2 size={18} />}
          </button>
          <input
            type="range" min="0" max="1" step="0.01"
            value={volume}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (v > 0) prevVolumeRef.current = v;
              setVolume(v);
            }}
            className="w-24 accent-primary cursor-pointer"
          />
        </div>

        {currentTrack?.streamUrl && (currentTrack.provider !== 'spotify' || spotifyFallback) && (
          <audio
            key={currentTrack.id}
            ref={audioRef}
            src={currentTrack.streamUrl}
            autoPlay={true}
            controls={false}
            onCanPlay={e => { (e.target as HTMLAudioElement).play().catch(() => {}); }}
            onEnded={skipNext}
          />
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettings(false)} />
          <div className="relative w-80 bg-[#1e1e1e] border-l border-black flex flex-col h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-white font-semibold">Einstellungen</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="p-4 flex flex-col gap-6">
              <section>
                <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Browse &amp; Suche</h3>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-white text-sm">Such-Ergebnisse pro Seite</span>
                    <select
                      value={settings.searchLimit}
                      onChange={e => { const s = { ...settings, searchLimit: Number(e.target.value) }; setSettings(s); saveSettings(s); }}
                      className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
                    >
                      {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-white text-sm">Browse-Einträge pro Seite</span>
                    <select
                      value={settings.browseLimit}
                      onChange={e => { const s = { ...settings, browseLimit: Number(e.target.value) }; setSettings(s); saveSettings(s); }}
                      className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
                    >
                      {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Dienste konfigurieren</h3>
                {serviceConfig === null ? (
                  <p className="text-slate-500 text-sm">Laden...</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {SVC_DEFS.map(({ key, label, fields, hasMusicFolders, hasOAuth }) => (
                      <div key={key} className="border border-white/10 rounded overflow-hidden">
                        <button
                          onClick={() => setExpandedSvc(expandedSvc === key ? null : key)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-black/20 hover:bg-black/30 text-white text-sm transition-colors"
                        >
                          <span>{label}</span>
                          <span className="text-slate-400 text-xs">{expandedSvc === key ? '▲' : '▼'}</span>
                        </button>
                        {expandedSvc === key && (
                          <div className="p-3 flex flex-col gap-2 bg-black/10">
                            {fields.map(field => (
                              <label key={field} className="flex flex-col gap-1">
                                <span className="text-slate-400 text-xs">{FIELD_LABELS[field] ?? field}</span>
                                <input
                                  type={PASSWORD_FIELDS.has(field) ? 'password' : 'text'}
                                  value={getSvcField(serviceConfig, key, field)}
                                  onChange={e => setServiceConfig(prev => prev ? setSvcField(prev, key, field, e.target.value) : prev)}
                                  className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-primary font-mono"
                                />
                              </label>
                            ))}
                            {hasOAuth && authStatus && (
                              <div className="pt-2 border-t border-white/5 mt-1 flex flex-col gap-2">
                                {/* Auth-Status */}
                                {(() => {
                                  const isLoggedIn = key === 'spotify' ? authStatus.spotify : authStatus.tidal;
                                  return (
                                    <div className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${isLoggedIn ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                      <span>{isLoggedIn ? '●' : '○'}</span>
                                      <span>{isLoggedIn ? 'Angemeldet — Token vorhanden' : 'Nicht angemeldet'}</span>
                                    </div>
                                  );
                                })()}
                                {/* Login-Buttons */}
                                <div className="flex flex-col gap-1.5">
                                  <a
                                    href={`/api/auth/${key}/login`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setTimeout(() => getAuthStatus().then(setAuthStatus), 3000)}
                                    className="flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs rounded px-3 py-1.5 transition-colors"
                                  >
                                    {key === 'spotify' ? '🎵' : '🎵'} Bei {key === 'spotify' ? 'Spotify' : 'Tidal'} anmelden (OAuth)
                                  </a>
                                  {key === 'tidal' && (
                                    <a
                                      href="/api/auth/tidal/stream/login"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded px-3 py-1.5 transition-colors"
                                    >
                                      🔓 Tidal Streaming-Vollzugriff einrichten
                                    </a>
                                  )}
                                  <button
                                    onClick={() => getAuthStatus().then(setAuthStatus)}
                                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-center"
                                  >
                                    Status aktualisieren
                                  </button>
                                </div>
                              </div>
                            )}
                            {hasMusicFolders && (
                              <div className="flex flex-col gap-1 pt-1 border-t border-white/5 mt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 text-xs">Musikbibliothek</span>
                                  <button
                                    onClick={async () => {
                                      setMusicFoldersLoading(prev => new Set(prev).add(key));
                                      const svcName = ({ subsonic: 'SubSonic', navidrome: 'Navidrome', madsonic: 'Madsonic', airsonic: 'Airsonic' } as Record<string, string>)[key as string] ?? key;
                                      const folders = await mediaService.getMusicFolders(svcName);
                                      setMusicFolders(prev => ({ ...prev, [key]: folders }));
                                      setMusicFoldersLoading(prev => { const s = new Set(prev); s.delete(key); return s; });
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-primary flex items-center gap-1 transition-colors"
                                  >
                                    <RefreshCw size={9} className={musicFoldersLoading.has(key) ? 'animate-spin' : ''} />
                                    Laden
                                  </button>
                                </div>
                                {musicFolders[key] ? (
                                  <select
                                    value={getSvcField(serviceConfig, key, 'musicFolderId')}
                                    onChange={e => setServiceConfig(prev => prev ? setSvcField(prev, key, 'musicFolderId', e.target.value) : prev)}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-primary"
                                  >
                                    <option value="">Alle Bibliotheken</option>
                                    {musicFolders[key].map(f => (
                                      <option key={f.id} value={f.id}>{f.name} (ID: {f.id})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-[10px] text-slate-600">→ "Laden" um verfügbare Bibliotheken abzurufen</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={async () => {
                        if (!serviceConfig) return;
                        setSvcSaveStatus('saving');
                        try {
                          await serviceSettings.save(serviceConfig);
                          setSvcSaveStatus('saved');
                        } catch { setSvcSaveStatus('error'); }
                      }}
                      disabled={svcSaveStatus === 'saving'}
                      className="mt-2 bg-primary hover:bg-primary/80 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5 transition-colors"
                    >
                      {svcSaveStatus === 'saving' ? 'Speichern...' : 'Speichern'}
                    </button>
                    {svcSaveStatus === 'saved'  && <p className="text-xs text-yellow-400">Gespeichert — Backend neu starten damit Änderungen aktiv werden.</p>}
                    {svcSaveStatus === 'error'  && <p className="text-xs text-red-400">Fehler beim Speichern.</p>}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
