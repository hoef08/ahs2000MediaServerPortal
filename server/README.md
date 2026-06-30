# ahs2000 Media Server Portal

Unified Media-Player-Webapplikation, die Inhalte aus mehreren Streaming-Diensten und selbst gehosteten Mediaservern in einer einheitlichen Oberfläche zusammenfasst.

## Unterstützte Services

| Service | Typ | Authentifizierung |
|---|---|---|
| **Spotify** | Cloud-Streaming | OAuth2 PKCE |
| **Tidal** | Cloud-Streaming | OAuth2 PKCE |
| **Plex** | Self-hosted | Token |
| **Jellyfin** | Self-hosted | API-Token + User-ID |
| **Subsonic** | Self-hosted | MD5-Token-Auth |
| **Navidrome** | Self-hosted (Subsonic-kompatibel) | MD5-Token-Auth |
| **Madsonic** | Self-hosted (Subsonic-kompatibel) | MD5-Token-Auth |
| **Airsonic** | Self-hosted (Subsonic-kompatibel) | Plain-Password-Auth |

---

## Architektur

```
┌─────────────────────────────────────────────┐
│  React Frontend (Port 80/443)               │
│  Vite · React 19 · Tailwind CSS 4           │
│  Nginx-Reverse-Proxy → /api/* → Backend     │
└─────────────────────┬───────────────────────┘
                      │ /api/*
┌─────────────────────▼───────────────────────┐
│  Node.js Backend (Port 3000)                │
│  Fastify 4 · TypeScript · ESM               │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Spotify  │  │  Tidal   │  │   Plex   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Jellyfin │  │ Subsonic │  │Navidrome │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐                 │
│  │ Madsonic │  │ Airsonic │                 │
│  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────┘
```

### Verzeichnisstruktur

```
server/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Fastify-Einstiegspunkt
│   │   ├── config.ts             # Konfiguration (.env + JSON-Override)
│   │   ├── routes/
│   │   │   ├── health.ts         # GET /health
│   │   │   ├── auth.ts           # OAuth-Callbacks (Spotify, Tidal)
│   │   │   ├── spotify.ts        # GET /spotify/...
│   │   │   ├── tidal.ts          # GET /tidal/...
│   │   │   ├── plex.ts           # GET /plex/...
│   │   │   ├── jellyfin.ts       # GET /jellyfin/...
│   │   │   ├── subsonic.ts       # GET /subsonic/...
│   │   │   ├── navidrome.ts      # GET /navidrome/...
│   │   │   ├── madsonic.ts       # GET /madsonic/...
│   │   │   ├── airsonic.ts       # GET /airsonic/...
│   │   │   ├── settings.ts       # GET/POST /settings/services
│   │   │   └── artistImage.ts    # GET /artist-image?name=...
│   │   ├── services/
│   │   │   ├── subsonic.ts       # Factory createSubsonicService (shared)
│   │   │   ├── madsonic.ts       # Dispatcher: wählt madsonicV1 oder madsonicV2
│   │   │   ├── madsonicV1.ts     # Madsonic ≤ 1.x (Subsonic-Factory-basiert, /rest/)
│   │   │   ├── madsonicV2.ts     # Madsonic ≥ 2.x (eigene Impl., /rest2/)
│   │   │   ├── airsonic.ts       # Airsonic-Instanz der Factory
│   │   │   ├── deezer.ts         # Deezer-Fallback für Artist-Cover
│   │   │   └── ...
│   │   ├── types/
│   │   │   └── media.ts          # Normalisierte Typen (MediaTrack, MediaAlbum, ...)
│   │   └── utils/
│   │       └── logFetch.ts       # Fetch mit Logging
│   ├── .env                      # Nicht im Repository – siehe .env.example
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Haupt-Komponente (Player, Navigation, Views)
│   │   ├── vite-env.d.ts         # Globale Typen (u. a. __APP_VERSION__)
│   │   └── services/
│   │       ├── api.ts            # API-Client (mediaService, serviceSettings)
│   │       ├── settings.ts       # Lokale App-Einstellungen (localStorage)
│   │       └── spotifyPlayer.ts  # Spotify Web Playback SDK Wrapper
│   ├── index.html
│   ├── vite.config.ts            # Vite-Konfiguration + Build-Versionierung
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Versionierung

Die Applikation verwendet ein dreiteiliges Versionsschema `Major.Minor.Build-Hash`:

| Segment | Bedeutung | Beispiel |
|---|---|---|
| `Major` | Hauptversion — manuell in `frontend/vite.config.ts` | `1` |
| `Minor` | Nebenversion — manuell in `frontend/vite.config.ts` | `0` |
| `Build` | Git-Commit-Count — automatisch beim Build ermittelt | `152` |
| `Hash` | Kurzer Git-Commit-Hash — automatisch beim Build | `9eaa5a7` |

**Beispiel:** `v1.0.152-9eaa5a7`

Die Version wird beim Vite-Build via `execSync('git rev-list --count HEAD')` und `git rev-parse --short HEAD` ermittelt und als globale Konstante `__APP_VERSION__` in das Bundle eingebettet. Sie erscheint:

- Im **Seitenkopf** unterhalb des Applikationstitels (klein, grau, Monospace)
- Im **Debug-Konsolenlog** beim Start (`> ahs2000 Media Server Portal vX.Y.Z gestartet.`)
- Im **Browser-Tab** (Seitentitel)

So lassen sich lokale Instanz und NAS-Deployment durch einen Blick auf den Header unterscheiden. Major und Minor werden manuell in `frontend/vite.config.ts` in der Funktion `buildVersion()` gesetzt.

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- npm

### Backend starten

```bash
cd backend
cp .env.example .env
# .env befüllen (mindestens einen Service konfigurieren)
npm install
npm run dev
# Backend läuft auf http://localhost:3000
```

### Frontend starten

```bash
cd ../frontend   # relativ zum server/-Verzeichnis
npm install
npm run dev
# Frontend läuft auf http://localhost:5173
# /api/* wird automatisch an Port 3000 proxied
```

---

## Docker-Deployment

```bash
cd server
cp backend/.env.example backend/.env
# backend/.env befüllen

docker compose up -d
```

- Frontend: `http://host:80` / `https://host:443`
- Backend: `http://host:3000` (intern)
- Token-/Konfig-Daten werden im Docker-Volume `token-cache` unter `/app/data/` persistiert

### QNAP NAS (Ports 80/443 belegt)

Auf QNAP belegt der integrierte Web-Server die Standard-Ports. Für diesen Fall gibt es `docker-compose.nas.yml`:

```bash
# Source auf NAS kopieren (von Windows aus)
scp -r server admin@192.168.0.244:/share/Public/mediaserver/
scp -r frontend admin@192.168.0.244:/share/Public/mediaserver/

# Auf der NAS
ssh admin@192.168.0.244
cd /share/Public/mediaserver/server
cp backend/.env.nas-example backend/.env
# backend/.env befüllen
docker compose -f docker-compose.nas.yml up -d --build
```

- Frontend: `https://nas-ip:9443`
- Backend: `http://nas-ip:3001`
- Belegte Ports auf QNAP (nicht verwenden): 80, 443, 8080, 8081, 8444, 8484

---

## Konfiguration

### Umgebungsvariablen (`backend/.env`)

```env
PORT=3000

# Spotify (PKCE – kein Client Secret benötigt)
SPOTIFY_CLIENT_ID=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_MARKET=DE
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback

# Tidal (PKCE)
TIDAL_CLIENT_ID=
TIDAL_REFRESH_TOKEN=
TIDAL_COUNTRY_CODE=DE
TIDAL_REDIRECT_URI=http://127.0.0.1:3000/auth/tidal/callback

# Plex
PLEX_BASE_URL=http://192.168.x.x:32400
PLEX_TOKEN=

# Jellyfin
JELLYFIN_BASE_URL=http://192.168.x.x:8096
JELLYFIN_API_TOKEN=
JELLYFIN_USER_ID=

# Subsonic
SUBSONIC_BASE_URL=http://musik-server:4041
SUBSONIC_USERNAME=
SUBSONIC_PASSWORD=
SUBSONIC_CLIENT_NAME=MediaServer
SUBSONIC_API_VERSION=1.16.1
SUBSONIC_MUSIC_FOLDER_ID=   # optional – leer = alle Bibliotheken

# Navidrome (Subsonic-kompatibel)
NAVIDROME_BASE_URL=
NAVIDROME_USERNAME=
NAVIDROME_PASSWORD=
NAVIDROME_CLIENT_NAME=MediaServer
NAVIDROME_MUSIC_FOLDER_ID=

# Madsonic (Subsonic-kompatibel)
MADSONIC_BASE_URL=
MADSONIC_USERNAME=
MADSONIC_PASSWORD=
MADSONIC_CLIENT_NAME=MediaServer
MADSONIC_API_VERSION=1.16.1  # >= 2.0 aktiviert den v2-Modus (/rest2/)
MADSONIC_MUSIC_FOLDER_ID=

# Airsonic (Subsonic-kompatibel)
AIRSONIC_BASE_URL=
AIRSONIC_USERNAME=
AIRSONIC_PASSWORD=
AIRSONIC_CLIENT_NAME=MediaServer
AIRSONIC_API_VERSION=1.15.0
AIRSONIC_MUSIC_FOLDER_ID=

# Last.fm (kostenloser API-Key unter https://www.last.fm/api/account/create)
LASTFM_API_KEY=
```

### Laufzeit-Konfiguration (UI)

Über **Einstellungen → Dienste konfigurieren** können alle Service-Parameter (URL, Benutzername, Passwort, API-Version) ohne Neustart der Applikation geändert werden. Die Werte werden in `data/services-config.json` gespeichert und beim nächsten Start geladen (überschreiben die `.env`-Werte).

### OAuth-Login (Spotify / Tidal)

Beim ersten Start muss ein OAuth-Flow durchgeführt werden:

```
http://localhost:3000/auth/spotify/login
http://localhost:3000/auth/tidal/login
```

Nach erfolgreichem Login werden die Tokens in `data/spotify-token.json` bzw. `data/tidal-token.json` gespeichert und automatisch erneuert.

---

## Backend-API

Alle Routen sind unter `/api/` erreichbar (via Frontend-Proxy) bzw. direkt auf Port 3000.

### Allgemein

| Methode | Route | Beschreibung |
|---|---|---|
| `GET` | `/health` | Service-Status aller konfigurierten Dienste |
| `GET` | `/artist-image?name=...` | Artist-Cover via Deezer (24h Cache, kein API-Key) |
| `GET` | `/lastfm/artist?name=...` | Last.fm Künstlerdaten (Info, Top-Titel, Ähnliche, Biografie) |
| `GET` | `/settings/services` | Aktuelle Service-Konfiguration (Passwörter maskiert) |
| `POST` | `/settings/services` | Service-Konfiguration speichern |

### Pro Service (`{svc}` = subsonic | navidrome | madsonic | airsonic | plex | jellyfin | spotify | tidal)

| Methode | Route | Beschreibung |
|---|---|---|
| `GET` | `/{svc}/search?q=&offset=&limit=` | Suche nach Titeln, Alben, Künstlern |
| `GET` | `/{svc}/browse?type=&offset=&limit=` | Index: Künstler / Alben / Titel |
| `GET` | `/{svc}/artists/{id}/albums` | Alben eines Künstlers |
| `GET` | `/{svc}/albums/{id}/tracks` | Titel eines Albums |
| `GET` | `/{svc}/playlists/{id}/tracks` | Titel einer Playlist |
| `GET` | `/{svc}/home` | Home-Sections (Neu, Meistgespielt, Zufällig, …) |
| `GET` | `/{svc}/stream/{id}` | Audio-Stream (Redirect auf Service-URL) |
| `GET` | `/{svc}/cover/{id}` | Cover-Art (Proxy mit 24h Cache) |
| `GET` | `/{svc}/discover?type=&limit=&fromYear=&toYear=&genre=` | Entdecken-Alben (Subsonic-Familie + Jellyfin) |
| `GET` | `/{svc}/genres` | Verfügbare Genres der Library (Subsonic-Familie + Jellyfin) |
| `GET` | `/{svc}/musicfolders` | Konfigurierte Musikbibliotheken mit ID und Name (Subsonic-Familie) |
| `GET` | `/auth/status` | OAuth-Status: `{ spotify, tidal, tidalStreaming }` |

### Normalisierte Antworttypen

Alle Endpunkte antworten mit einem einheitlichen Envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Die Daten enthalten normalisierte Objekte (`MediaTrack`, `MediaAlbum`, `MediaArtist`, `MediaPlaylist`) unabhängig vom jeweiligen Service. `MediaArtist` enthält optional `albumCount` (Subsonic-Familie und Jellyfin; Details siehe Abschnitte unten).

---

## Frontend-Features

### Navigation

- **Provider-Tabs** — Wechsel zwischen den konfigurierten Services; grüner Punkt = aktiv
- **Provider "Alle"** — Globale Suche/Browse über alle aktiven Services gleichzeitig (erscheint automatisch ab 2 aktiven Services)
- **Breadcrumb-Navigation** — Drilldown: Künstler → Alben → Titel mit Zurück-Navigation
- **Artist-Drilldown aus Track** — Klick auf Künstlernamen in der Trackliste navigiert direkt zu diesem Künstler (via Search-Lookup)

### Ansichten

| Ansicht | Beschreibung |
|---|---|
| **Cover Flow** | Visuell animierter Cover-Browser (Mausrad oder Pfeiltasten); zeigt Künstler • Jahr im Center-Panel |
| **Galerie** | Grid-Ansicht mit Cover-Art; zeigt Erscheinungsjahr neben dem Künstlernamen |
| **Liste** | Tabellarische Ansicht mit Titel, Künstler, Album/Jahr, Dauer; Spaltenheader "Jahr" bei Album-Ansicht |
| **Künstler-Hub** | Dedizierte Künstler-Ansicht (nur aktiv bei Ergebnistyp "Künstler"): Alphabet-Navigation (#..Z), lokaler Textfilter, konfigurierbares Karten-Grid (2–6 Spalten) mit Foto, Provider-Badge und Albumanzahl; Klick öffnet die **Künstlerseite** |
| **Künstlerseite** | Detailansicht aus dem Hub: Künstlerfoto, Name, Fans-Anzahl (Last.fm), Genre-Tags; Tabs: **Diskografie** (lokale Alben, Klick öffnet Tracks), **Top-Titel** (Last.fm, Playcount; Klick sucht Track im aktuellen Provider und startet Wiedergabe), **Ähnliche Künstler** (Last.fm; Klick sucht Künstler im Provider und öffnet dessen Künstlerseite), **Biografie** (Last.fm) |
| **Entdecken** | Konfigurierbare Netflix-artige Lanes mit horizontalem Scroll; automatisch geladen beim ersten Tab-Besuch und beim Provider-Wechsel; Drilldown auf Alben und Titel möglich |

### Suche & Browse

- Freitextsuche pro Service oder global (Provider "Alle")
- Browse-Modi: Künstler / Alben / Titel (Index ohne Suchbegriff, nur bei unterstützten Services)
- Ergebnistyp-Auswahl: Titel / Alben / Künstler — Buttons ausgegraut mit Tooltip wenn kein Browse-Support ohne aktive Suche (z. B. Tidal)
- Paginierung mit Vor/Zurück, Sprung zur ersten/letzten Seite (⏮⏭) und direktem Seiten-Sprung per Zahlen-Input

### Erweiterte Suchsyntax

Der Suchbegriff unterstützt Boolean-Operatoren und Feldfilter. Die Operatoren werden client-seitig auf die API-Ergebnisse angewendet. Im Konsolen-Log erscheint `[Filter]` wenn Operatoren aktiv sind.

| Syntax | Funktion | Beispiel |
|---|---|---|
| `A B` / `A AND B` | Beide Begriffe müssen vorkommen (Standard) | `Jason Derulo` |
| `A OR B` / `A ; B` | Einer der Begriffe muss vorkommen | `Pop OR Rock` |
| `A NOT B` / `A -B` | A, aber ohne B | `Pop -Christmas` |
| `"A B"` | Exakter Phrasen-Match | `"The The"` |
| `+A` | Kein Akzent-Folding (ü ≠ u, case-sensitiv) | `+Derulo` |
| `Artist:X` | Nur im Künstlerfeld suchen | `Artist:Queen` |
| `Album:X` | Nur im Albumfeld suchen | `Album:Innuendo` |
| `Title:X` | Nur im Titelfeld suchen | `Title:Bohemian` |
| `Year:X` | Exaktes Erscheinungsjahr | `Year:1991` |
| `Year:X..Y` | Jahresbereich | `Year:1970..1980` |

Komplexe Verknüpfungen möglich: `A OR B C OR D -E` entspricht `(A OR B) AND (C OR D) NOT E` — OR hat Vorrang vor AND und NOT.

> **Hinweis:** Da die Filterung nach dem API-Abruf erfolgt, kann Paginierung bei aktiven Filtern unvollständig sein (API-Seite enthält ggf. mehr Treffer als angezeigt).

### Player

- **Wiedergabe** — HTML5 Audio für alle Subsonic-kompatiblen und Proxy-Services; Spotify Web Playback SDK für Spotify Premium
- **Skip / Previous** — Vor/Zurück innerhalb der aktuellen Queue; Zurück < 3s: Track neu starten
- **Auto-Advance** — Nächster Track wird automatisch gestartet wenn der aktuelle endet
- **Warteschlange** — Queue-Button (ListMusic-Icon) zeigt alle Tracks in der aktuellen Wiedergabeliste; Klick springt direkt zum gewählten Track; Tracks per Drag & Drop umsortierbar; einzelne Tracks per X-Button entfernbar; komplette Queue per Trash-Icon leerbar
- **Fortschrittsbalken** — Klickbar zum Springen
- **Volume-Slider** — Lautstärkeregelung; Wert wird in localStorage persistiert; Icon-Klick schaltet stumm/hebt Stummschaltung auf; dynamisches Icon (VolumeX / Volume / Volume1 / Volume2)

### Entdecken-Tab

Konfigurierbare Lanes, jede mit eigenem Typ, Service-Filter, Limit und optionalen Parametern:

| Lane-Typ | Beschreibung | Parameter |
|---|---|---|
| `random` | Zufällige Alben | — |
| `newest` | Neu hinzugefügt | — |
| `frequent` | Meistgehört | — |
| `recent` | Zuletzt gehört | — |
| `starred` | Favoriten / Bewertungen | — |
| `byYear` | Alben eines Jahrzehntbereichs | Von/Bis-Jahr; Jahrzehnt-Presets (60er–2020er) |
| `byGenre` | Alben eines Genres | Genre-Name; Vorschläge aus der Library ladbar |

Lanes sind einzeln aktivierbar/deaktivierbar, neu beladbar und per `+`-Button erweiterbar. Genre-Vorschläge und Jahrzehnt-Presets werden direkt aus der Library des gewählten Services abgerufen.

**Auto-Load-Verhalten:** Lanes werden automatisch geladen beim ersten Besuch des Tabs und beim Provider-Wechsel (bereits geladene Lanes werden beim Provider-Wechsel verworfen und neu abgerufen). Implementierungsdetail: `setDiscoverData({})` und das Neuladen passieren im selben `useEffect` via `useRef`-Provider-Vergleich, um einen React-Batching-Race zu vermeiden (parallele Effects lesen sonst veraltete Closure-Werte).

### Einstellungen

- Suchresultate- und Browse-Limit konfigurierbar
- **Künstler-Hub Spalten** — Spaltenanzahl (2–6) direkt im Hub-Header wählbar; Wert wird in localStorage gespeichert
- Service-Parameter (URL, Credentials, API-Version) direkt im UI bearbeitbar und speicherbar
- **Musikbibliothek** (Subsonic-Familie): Auswahl einer bestimmten Library per Dropdown; Bibliotheken werden per "Laden"-Button direkt vom Service abgerufen; ID fließt in alle API-Calls (Browse, Suche, Discover, Home)
- **Spotify / Tidal**: Client ID und Redirect URI konfigurierbar; Auth-Status (angemeldet/nicht angemeldet) wird direkt angezeigt; "Anmelden"-Button startet den OAuth-Flow in einem neuen Tab; Tidal-Streaming-Vollzugriff separat einrichtbar
- **Last.fm**: API Key konfigurierbar (maskiert); wird für die Künstlerseite (Top-Titel, Ähnliche Künstler, Biografie, Fans) verwendet
- Änderungen werden in `data/services-config.json` persistiert (überschreiben `.env`-Werte)

### Browse-Support pro Service

| Service | Browse Künstler/Alben/Titel | Suche Titel/Alben/Künstler |
|---|---|---|
| Spotify | ✓ | ✓ |
| Tidal | ✓ (Favoriten-Sammlung) | ✓ |
| Plex | ✓ | ✓ |
| Jellyfin | ✓ (albumCount via parallele Album-Requests) | ✓ |
| Subsonic | ✓ (ID3) | ✓ |
| Navidrome | ✓ (ID3, albumCount aus getArtists) | ✓ |
| Madsonic | ✓ (Filesystem; albumCount via getMusicDirectory) | ✓ |
| Airsonic | ✓ | ✓ |

Tidal nutzt für Browse die v2-Favoriten-Endpunkte (`/userCollectionTracks|Albums|Artists/me/relationships/items`), da keine generische Katalog-Browse-API verfügbar ist.

### Artist-Cover-Fallback

Fehlt ein Artist-Cover im jeweiligen Service, wird automatisch die **Deezer Public API** als Fallback verwendet (`api.deezer.com/search/artist`) — kein API-Key erforderlich, 24h In-Memory-Cache.

---

## Subsonic-Factory-Pattern

Subsonic, Navidrome, Madsonic und Airsonic teilen sich eine gemeinsame Service-Factory (`createSubsonicService`). Die Unterschiede werden über Optionen konfiguriert:

| Option | Beschreibung |
|---|---|
| `useArtistsEndpoint` | `true` → ID3-Modus (`getArtists`/`getArtist`/`getAlbum`); `false` → Filesystem-Modus (`getIndexes`/`getMusicDirectory`) |
| `usePlainAuth` | `true` → Klartext-Passwort (`p=`); `false` → MD5-Token (`t=`+`s=`) |
| `apiVersion` | API-Version; Airsonic benötigt `1.15.0` |
| `artistCoverViaCoverArt` | Artist-Cover via `getCoverArt`-Endpunkt (Madsonic) |
| `responseKey` | Response-Root-Key (`subsonic-response` oder `madsonic-response`) |

**Navidrome** verwendet `useArtistsEndpoint: true` (ID3-Modus via `getArtists`), da dieser Endpunkt `albumCount` zuverlässig liefert. `getIndexes` gibt `albumCount` laut Subsonic-Spec nicht zurück.

**Madsonic** verwendet einen Version-Dispatcher (`madsonic.ts`): anhand der konfigurierten `MADSONIC_API_VERSION` wird automatisch entweder `madsonicV1.ts` (Major < 2) oder `madsonicV2.ts` (Major ≥ 2) gewählt. Beide Module exportieren dieselbe öffentliche API.

**Madsonic v1** (`madsonicV1.ts`) — Madsonic ≤ 1.x, Subsonic-Factory-basiert:
- `browseArtists` — `getIndexes` liefert Filesystem-IDs (für `getCoverArt?size=300`); `albumCount` per parallelem `getMusicDirectory`-Aufruf (zählt `isDir`-Kinder = Albenordner)
- `search3` — benötigt zwingend `musicFolderId`; Fallback auf `'0'`
- `getArtistAlbums` / `getAlbumTracks` — Filesystem-Modus mit Fallback auf ID3
- Home-Sections: `getNewAddedSongs`, `getMostPlayedSongs`, `getLastPlayedSongs` (CamelCase Endpunktnamen)

**Madsonic v2** (`madsonicV2.ts`) — Madsonic ≥ 2.x, vollständig eigene Implementierung:
- Endpunkte unter `/rest2/` statt `/rest/` — Response-Root ist `subsonic-response`
- Endpunktnamen in camelCase ohne Großbuchstaben: `getMostplayedSongs`, `getLastplayedSongs`, `getTopplayedSongs`, `getAlbumListID3` für Zufällige Alben
- `getNewaddedSongs` wird **nicht** verwendet: der Server ignoriert den `count`-Parameter und liefert immer die komplette Bibliothek → Timeout; kein clientseitiger Workaround möglich
- **Cover-Art: Album-IDs benötigen `al-`-Prefix** (z. B. `al-46803`), da Madsonic v2 bei `getCoverArt` zwischen Song-Embedded-Art (nackte ID) und Album-Cover-Datei (`al-<id>`) unterscheidet. Track-Cover werden mit `al-<albumId>?size=300` abgerufen
- Cover-Proxy: Madsonic gibt manchmal `200 image/jpeg` mit leerem Body zurück — wird explizit abgefangen (Buffer-Länge 0 → 404), damit CSS-Platzhalter greift

**Jellyfin** liefert `albumCount` nicht direkt im `/Artists/AlbumArtists`-Response. Stattdessen wird für alle Künstler der aktuellen Seite parallel `/Items?albumArtistIds={id}&IncludeItemTypes=MusicAlbum&Recursive=true&Limit=0` aufgerufen — `Limit=0` liefert nur `TotalRecordCount` ohne Items und ist damit sehr leichtgewichtig.

### musicFolderId

Alle vier Subsonic-kompatiblen Services unterstützen eine optionale `musicFolderId`, die eine bestimmte Musikbibliothek auswählt. Die ID wird über `SUBSONIC_MUSIC_FOLDER_ID` (bzw. `NAVIDROME_`, `MADSONIC_`, `AIRSONIC_`) in der `.env` konfiguriert oder im UI unter **Einstellungen → Dienste konfigurieren → Musikbibliothek** gesetzt. Die verfügbaren IDs und Namen werden per `/musicfolders`-Route direkt vom Service geladen.

Die ID fließt in alle relevanten API-Calls ein: Browse, Home, Discover, Suche und Index-Endpunkte.
