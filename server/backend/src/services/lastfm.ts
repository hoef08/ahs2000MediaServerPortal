import { config } from '../config.js';
import { logFetch } from '../utils/logFetch.js';

const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lfmGet<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', config.lastfm.apiKey);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await logFetch(url.toString(), {});
  if (!resp.ok) throw new Error(`Last.fm API error: HTTP ${resp.status} ${method}`);
  return resp.json() as Promise<T>;
}

interface LfmImage { '#text': string; size: string }

interface LfmArtistInfoResponse {
  artist?: {
    name?: string;
    listeners?: string;
    playcount?: string;
    bio?: { summary?: string; content?: string };
    similar?: { artist?: Array<{ name: string; image?: LfmImage[] }> };
    tags?: { tag?: Array<{ name: string }> };
  };
}

interface LfmTopTracksResponse {
  toptracks?: {
    track?: Array<{
      name: string;
      playcount?: string;
      listeners?: string;
      image?: LfmImage[];
    }>;
  };
}

export interface LastFmArtistData {
  name: string;
  listeners: number;
  playcount: number;
  bio: string;
  tags: string[];
  similar: Array<{ name: string; imageUrl: string }>;
  topTracks: Array<{ name: string; playcount: number; imageUrl: string }>;
}

function bestImage(images?: LfmImage[]): string {
  if (!images?.length) return '';
  return (
    images.find(i => i.size === 'extralarge')?.['#text'] ||
    images.find(i => i.size === 'large')?.['#text'] ||
    images[images.length - 1]?.['#text'] ||
    ''
  );
}

function stripHtml(s: string): string {
  return s.replace(/<a [^>]*>.*?<\/a>/gs, '').replace(/<[^>]+>/g, '').trim();
}

export async function getLastFmArtistData(name: string): Promise<LastFmArtistData> {
  const [infoRes, tracksRes] = await Promise.allSettled([
    lfmGet<LfmArtistInfoResponse>('artist.getInfo', { artist: name, autocorrect: '1' }),
    lfmGet<LfmTopTracksResponse>('artist.getTopTracks', { artist: name, autocorrect: '1', limit: '10' }),
  ]);

  const info = infoRes.status === 'fulfilled' ? infoRes.value.artist : undefined;
  const tracks = tracksRes.status === 'fulfilled' ? (tracksRes.value.toptracks?.track ?? []) : [];

  const rawBio = info?.bio?.summary ?? info?.bio?.content ?? '';

  return {
    name:      info?.name ?? name,
    listeners: parseInt(info?.listeners ?? '0', 10) || 0,
    playcount: parseInt(info?.playcount ?? '0', 10) || 0,
    bio:       stripHtml(rawBio),
    tags:      (info?.tags?.tag ?? []).slice(0, 5).map(t => t.name),
    similar:   (info?.similar?.artist ?? []).slice(0, 6).map(a => ({
      name:     a.name,
      imageUrl: bestImage(a.image),
    })),
    topTracks: tracks.slice(0, 10).map(t => ({
      name:     t.name,
      playcount: parseInt(t.playcount ?? '0', 10) || 0,
      imageUrl: bestImage(t.image),
    })),
  };
}
