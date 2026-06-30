import React, { useState, useEffect } from 'react';
import { ChevronLeft, Music, BookOpen, Users, BarChart2, Play, Loader2 } from 'lucide-react';
import { mediaService, getLastFmArtistData } from '../services/api';
import type { MediaItem, LastFmArtistData } from '../services/api';

function CoverImage({ src, alt, className, placeholder }: {
  src?: string; alt?: string; className?: string; placeholder: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{placeholder}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function formatNumber(n: number): string {
  return n.toLocaleString('de-DE');
}

type Tab = 'discography' | 'toptracks' | 'similar' | 'biography';

interface Props {
  item: MediaItem;
  provider: string;
  onBack: () => void;
  onAlbumClick: (album: MediaItem) => void;
  onTrackPlay?: (track: MediaItem) => void;
  onSimilarArtistClick?: (artist: MediaItem) => void;
}

export function ArtistDetailView({ item, provider, onBack, onAlbumClick, onTrackPlay, onSimilarArtistClick }: Props) {
  const [activeTab, setActiveTab]         = useState<Tab>('discography');
  const [lastfm, setLastfm]               = useState<LastFmArtistData | null>(null);
  const [lfmLoading, setLfmLoading]       = useState(false);
  const [albums, setAlbums]               = useState<MediaItem[]>([]);
  const [albumsTotal, setAlbumsTotal]     = useState(0);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [loadingItem, setLoadingItem]     = useState<string | null>(null);

  useEffect(() => {
    setAlbumsLoading(true);
    mediaService.getArtistAlbums(provider, item.id)
      .then(page => { setAlbums(page.items); setAlbumsTotal(page.total); })
      .catch(() => {})
      .finally(() => setAlbumsLoading(false));
  }, [item.id, provider]);

  useEffect(() => {
    setLfmLoading(true);
    getLastFmArtistData(item.title)
      .then(setLastfm)
      .catch(() => {})
      .finally(() => setLfmLoading(false));
  }, [item.title]);

  const handleTopTrackPlay = async (trackName: string) => {
    if (!onTrackPlay || loadingItem) return;
    setLoadingItem(trackName);
    try {
      const page = await mediaService.search(trackName, provider, 'tracks', 0, 5);
      const exact = page.items.find(t => t.title.toLowerCase() === trackName.toLowerCase());
      const track = exact ?? page.items[0];
      if (track) onTrackPlay(track);
    } catch {}
    setLoadingItem(null);
  };

  const handleSimilarArtistClick = async (artistName: string) => {
    if (!onSimilarArtistClick || loadingItem) return;
    setLoadingItem(artistName);
    try {
      const page = await mediaService.search(artistName, provider, 'artists', 0, 10);
      const exact = page.items.find(a => a.title.toLowerCase() === artistName.toLowerCase());
      const artist = exact ?? page.items[0];
      if (artist) onSimilarArtistClick(artist);
    } catch {}
    setLoadingItem(null);
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'discography', label: 'Diskografie',        icon: Music     },
    { id: 'toptracks',   label: 'Top-Titel',          icon: BarChart2 },
    { id: 'similar',     label: 'Ähnliche Künstler',  icon: Users     },
    { id: 'biography',   label: 'Biografie',          icon: BookOpen  },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft size={16} />
          Zurück zum Künstler-Hub
        </button>
      </div>

      {/* Artist header */}
      <div className="flex-shrink-0 flex items-start gap-6 px-6 py-5 border-b border-white/8">
        <div className="w-28 h-28 rounded-full overflow-hidden bg-white/5 flex-shrink-0 ring-2 ring-white/10 shadow-lg">
          <CoverImage
            src={item.coverUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            placeholder={
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                <Users size={36} className="text-slate-600" />
              </div>
            }
          />
        </div>
        <div className="flex flex-col justify-center gap-2 min-w-0 pt-1">
          <h1 className="text-3xl font-bold text-white leading-tight">{item.title}</h1>
          {lastfm && lastfm.listeners > 0 && (
            <p className="text-slate-400 text-sm">{formatNumber(lastfm.listeners)} Fans</p>
          )}
          {lastfm && lastfm.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lastfm.tags.map(tag => (
                <span key={tag} className="px-2.5 py-0.5 bg-white/6 border border-white/10 rounded-full text-xs text-slate-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/8 px-4 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap -mb-px flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-primary text-white font-medium'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>

        {/* Diskografie */}
        {activeTab === 'discography' && (
          albumsLoading ? (
            <p className="text-slate-500 text-sm">Lade Alben…</p>
          ) : albums.length === 0 ? (
            <p className="text-slate-500 text-sm">Keine Alben gefunden.</p>
          ) : (
            <div>
              <p className="text-xs text-slate-500 mb-3">{albumsTotal} Album{albumsTotal !== 1 ? 'en' : ''}</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {albums.map(album => (
                  <div key={album.id} onClick={() => onAlbumClick(album)} className="cursor-pointer group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/8 group-hover:border-white/25 transition-all shadow-md mb-2">
                      <CoverImage
                        src={album.coverUrl}
                        alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        placeholder={
                          <div className="w-full h-full flex items-center justify-center">
                            <Music size={28} className="text-slate-700" />
                          </div>
                        }
                      />
                    </div>
                    <p className="text-xs text-white truncate group-hover:text-primary transition-colors leading-snug">{album.title}</p>
                    {album.year && <p className="text-xs text-slate-500 mt-0.5">{album.year}</p>}
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* Top-Titel */}
        {activeTab === 'toptracks' && (
          lfmLoading ? (
            <p className="text-slate-500 text-sm">Lade Top-Titel…</p>
          ) : !lastfm || lastfm.topTracks.length === 0 ? (
            <p className="text-slate-500 text-sm">Keine Top-Titel verfügbar.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {lastfm.topTracks.map((track, i) => {
                const isLoading = loadingItem === track.name;
                return (
                  <div
                    key={track.name}
                    onClick={() => handleTopTrackPlay(track.name)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                      onTrackPlay ? 'cursor-pointer hover:bg-white/5' : ''
                    }`}
                  >
                    <span className="w-6 text-center text-slate-600 text-sm flex-shrink-0 group-hover:text-slate-400">{i + 1}</span>
                    <div className="relative flex-shrink-0">
                      {track.imageUrl ? (
                        <img src={track.imageUrl} alt={track.name} className="w-9 h-9 rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-white/5 flex items-center justify-center">
                          <Music size={14} className="text-slate-700" />
                        </div>
                      )}
                      {onTrackPlay && (
                        <div className="absolute inset-0 rounded flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isLoading
                            ? <Loader2 size={14} className="text-white animate-spin" />
                            : <Play size={14} fill="white" className="text-white ml-0.5" />
                          }
                        </div>
                      )}
                    </div>
                    <span className="flex-1 text-sm text-white truncate">{track.name}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">{formatNumber(track.playcount)}</span>
                  </div>
                );
              })}
              <p className="text-xs text-slate-700 mt-3 text-center">Quelle: Last.fm</p>
            </div>
          )
        )}

        {/* Ähnliche Künstler */}
        {activeTab === 'similar' && (
          lfmLoading ? (
            <p className="text-slate-500 text-sm">Lade ähnliche Künstler…</p>
          ) : !lastfm || lastfm.similar.length === 0 ? (
            <p className="text-slate-500 text-sm">Keine ähnlichen Künstler verfügbar.</p>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lastfm.similar.map(artist => {
                  const isLoading = loadingItem === artist.name;
                  return (
                    <div
                      key={artist.name}
                      onClick={() => handleSimilarArtistClick(artist.name)}
                      className={`flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-xl transition-all ${
                        onSimilarArtistClick ? 'cursor-pointer hover:bg-white/6 hover:border-white/20' : ''
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {artist.imageUrl ? (
                          <img
                            src={artist.imageUrl}
                            alt={artist.name}
                            className="w-11 h-11 rounded-full object-cover ring-1 ring-white/10"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center">
                            <Users size={18} className="text-slate-600" />
                          </div>
                        )}
                        {isLoading && (
                          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/70">
                            <Loader2 size={14} className="text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-white truncate flex-1">{artist.name}</span>
                      {onSimilarArtistClick && !isLoading && (
                        <ChevronLeft size={14} className="text-slate-600 flex-shrink-0 rotate-180" />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-700 mt-4 text-center">Quelle: Last.fm</p>
            </div>
          )
        )}

        {/* Biografie */}
        {activeTab === 'biography' && (
          lfmLoading ? (
            <p className="text-slate-500 text-sm">Lade Biografie…</p>
          ) : !lastfm || !lastfm.bio ? (
            <p className="text-slate-500 text-sm">Keine Biografie verfügbar.</p>
          ) : (
            <div className="max-w-3xl">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{lastfm.bio}</p>
              <p className="text-xs text-slate-700 mt-4">Quelle: Last.fm</p>
            </div>
          )
        )}

      </div>
    </div>
  );
}
