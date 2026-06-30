# Dokumentation: Suchsyntax und Filter

Diese Übersicht zeigt, wie Suchbegriffe und logische Operatoren verwendet werden, um Mediendateien gezielt zu filtern.

## Allgemeine Suchbegriffe und Operatoren

| Suchbegriff / Operator | Beschreibung | Beispiel / Details |
| :--- | :--- | :--- |
| **A** | Mediendateien mit *A* oder *á*. | Eine Suche nach `Derulo` findet Dateien von 'Jason Derulo' und 'Derülo'. |
| **+A** | Mediendateien mit exakt *A* (case-sensitive). | Eine Suche nach `Derulo` findet 'Jason Derulo', aber **nicht** 'Derülo'. |
| **"A b"** | Mediendateien mit exakt *A B*. | Nützlich für exakte Treffer bei mehreren Wörtern (z. B. `"The The"`). |
| **A B** <br> **A AND B** | Mediendateien, die sowohl *A* als auch *B* enthalten. | Um Mediendateien von 'U2' mit dem Genre 'Pop' zu finden, suche nach `U2 AND Pop`. |
| **A OR B** <br> **A ; B** | Mediendateien, die entweder *A* oder *B* enthalten. | Um 'Children' oder 'Kids' im Genre zu finden, suche nach `Children OR Kids`. |
| **A NOT B** <br> **A -B** | Mediendateien mit *A*, aber ohne *B*. | Um Pop-Musik ohne Weihnachtslieder zu finden, suche nach `Pop NOT Christmas`. |
| **A OR B C OR D -E** | Komplexe Verknüpfung. | Entspricht: `(A OR B) AND (C OR D) NOT E`. <br> *Hinweis: `OR` hat Vorrang vor `AND` und `NOT`.* |
| **\<Field\>:** | Begrenzt die Suche auf ein bestimmtes Feld. | Siehe Details im Abschnitt "Verfügbare Suchfelder". |

---

## Filterung nach Feldern

### Verfügbare Suchfelder
Gültige Felder für die allgemeine Feldsuche (`<Field>:`) sind:
* **Personen & Mitwirkende:** Actor, Actors, Artist, AlbumArtist, Album Artist, Composer, Conductor, Director, Lyricist, OriginalArtist, Original Artist, Producer, Screenwriter, InvolvedPeople, Involved People
* **Album & Titel:** Album, Title, OriginalTitle, Original Title, Series, Track, Track#, Disc#, Disc number
* **Metadaten:** Genre, Grouping, Lyrics, OriginalLyricist, Original Lyricist, Comment, Copyright, Encoder, Publisher
* **Eigenschaften:** Mood, Tempo, Occasion, Quality, Year, Origdate, Original Date, Rating, Bpm, Length, Bitrate, Frequency, Channels, Leveling
* **System & Verlauf:** Path, Played, Played #, Lastplayed, Last Played
* **Eigene Felder:** custom 1 bis custom 10 (auch zusammengeschrieben als `custom1` etc.)

### Spezifische Feld-Filter

#### Textbasierte Felder (`Field:A`)
Findet Mediendateien, bei denen das Feld exakt den Wert *A* hat (z. B. `Artist:A`). 

**Unterstützte Felder:**
* Artist, Album, Album Artist / AlbumArtist, Title, Genre, Path, Composer, Disc#, Lyricist, Conductor, Grouping, Lyrics, Comment
* Original Artist / OriginalArtist, Original Title / OriginalTitle, Original Lyricist / OriginalLyricist
* Publisher, Encoder, Copyright, Mood, Tempo, Occasion, Quality, Involved People / InvolvedPeople
* Eigene Felder (`custom1` bis `custom10`)

#### Bereichssuche für Jahre (`Year:X..Y`)
Findet Mediendateien in einem bestimmten Jahresbereich von *X* bis *Y*.

**Unterstützte Felder:**
* Year, Original Date / origdate, Rating, bpm, Disc, Track, Length, Bitrate, Frequency, Played# / played, Last Played / lastplayed, Channels, Leveling

#### Bewertung (`Rating:X..`)
Findet Mediendateien mit einer Bewertung von *X* Sternen oder höher.

---

## Sonderzeichen

Folgende Sonderzeichen können gezielt gesucht werden:
` , ` ` : ` ` . ` ` _ ` ` ( ` ` ) ` ` [ ` ` ] ` ` & ` ` @ ` ` # ` `   ` ` * ` ` ! ` ` - ` ` ; `

### Regeln für Sonderzeichen:
* **Eingebettet im Text (z. B. `Help!`):** Das Sonderzeichen wird ignoriert. Es werden alle Dateien zurückgegeben, die `Help` enthalten.
* **In Anführungszeichen (z. B. `"Help!"`):** Findet eine exakte Übereinstimmung inklusive des Sonderzeichens.
* **Ausnahme Laufwerksbuchstaben:** Bei der Suche nach Laufwerken (z. B. `C:` oder `C:\`) wird der Doppelpunkt `:` **nicht** ignoriert.



  ┌──────────────────┬───────────────────────────────────┬─────────────────────────────┐
  │      Syntax      │             Funktion              │          Beispiel           │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ A B / A AND B    │ Beide Begriffe müssen vorkommen   │ Jason Derulo                │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ A OR B / A ; B   │ Einer der Begriffe muss vorkommen │ Pop OR Rock                 │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ A NOT B / A -B   │ A ohne B                          │ Pop -Christmas              │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ "A B"            │ Exakter Phrasen-Match             │ "The The"                   │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ +A               │ Ohne Akzent-Folding (ü ≠ u)       │ +Derulo                     │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Artist:X         │ Nur Künstler-Feld                 │ Artist:Queen                │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Album:X          │ Nur Album-Feld                    │ Album:Innuendo              │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Title:X          │ Nur Titel-Feld                    │ Title:Bohemian              │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Year:1990        │ Exaktes Jahr                      │ Year:1990                   │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Year:1970..1980  │ Jahresbereich                     │ Year:1970..1980             │
  ├──────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ A OR B C OR D -E │ Komplex                           │ (A OR B) AND (C OR D) NOT E │
  └──────────────────┴───────────────────────────────────┴─────────────────────────────┘