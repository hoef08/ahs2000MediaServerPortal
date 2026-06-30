export type DiscoverType =
  | 'random' | 'newest' | 'frequent' | 'recent' | 'starred'
  | 'byYear' | 'byGenre';

export interface DiscoverLane {
  id:       string;
  type:     DiscoverType;
  label:    string;
  service:  string;   // provider name or 'all'
  limit:    number;
  enabled:  boolean;
  fromYear?: number;
  toYear?:   number;
  genre?:    string;
}

export interface AppSettings {
  searchLimit:   number;
  browseLimit:   number;
  volume:        number;
  discoverLanes: DiscoverLane[];
  hubColumns:    number;
}

export const DISCOVER_TYPE_LABELS: Record<DiscoverType, string> = {
  random:   'Zufällig',
  newest:   'Neu hinzugefügt',
  frequent: 'Meistgehört',
  recent:   'Zuletzt gehört',
  starred:  'Favoriten',
  byYear:   'Nach Jahrzehnt',
  byGenre:  'Nach Genre',
};

const DEFAULT_LANES: DiscoverLane[] = [
  { id: 'd1', type: 'random',   label: 'Zufällige Alben', service: 'all', limit: 20, enabled: true },
  { id: 'd2', type: 'newest',   label: 'Neu hinzugefügt', service: 'all', limit: 20, enabled: true },
  { id: 'd3', type: 'frequent', label: 'Meistgehört',     service: 'all', limit: 20, enabled: true },
  { id: 'd4', type: 'recent',   label: 'Zuletzt gehört',  service: 'all', limit: 20, enabled: true },
  { id: 'd5', type: 'starred',  label: 'Favoriten',       service: 'all', limit: 20, enabled: true },
];

const DEFAULTS: AppSettings = {
  searchLimit:   20,
  browseLimit:   50,
  volume:        0.7,
  discoverLanes: DEFAULT_LANES,
  hubColumns:    3,
};

const KEY = 'mediaserver_settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULTS,
      ...parsed,
      discoverLanes: parsed.discoverLanes?.length ? parsed.discoverLanes : DEFAULT_LANES,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
