# Kundenkartei · Piano Atelier

Webapp (PWA) zur Kundenorganisation auf Basis der Gerätekontakte – mit Karte, Farbkategorien und dem Abschnitt **„Stimmung bald fällig“**.

## Funktionen

- **Kunden** – Liste mit Sortier-Reitern: A–Z, Nachname, Ort, PLZ, Farbe, Nächste Stimmung (jeweils gruppiert).
- **Farben/Kategorien** – pro Kunde eine Anzeigefarbe wählen (Kunde antippen). Kategorien (Name + Farbe) sind unter *Import* frei definierbar. Die Farb-Chips oben filtern Liste, Stimmungsliste und Karte.
- **Stimmung bald fällig** – liest die Angabe `NS` aus den Kontaktnotizen, z. B. `NS26.08` = nächste Stimmung August 2026. Zeitraum wählbar (dieser Monat, 1/3/6/12 Monate oder frei von–bis), Überfällige optional. „Auf Karte anzeigen“ zeigt genau diese Kunden auf der Karte.
- **Karte** – OpenStreetMap; Marker in der Kundenfarbe, überfällige/diesen Monat fällige mit schwarzem Rand. Adressen werden automatisch über Nominatim verortet (1 Anfrage/Sekunde, Ergebnis wird gespeichert).
- **Suche** über Name, Firma, Adresse, Telefon, E-Mail und Notizen.
- Offline nutzbar (Service Worker), installierbar auf dem Homescreen, Hell/Dunkel-Modus.

### Erkannte NS-Schreibweisen

`NS26.08`, `NS 26.8`, `NS: 26/08`, `ns 26-08`, `NS2026.08` – Format **Jahr.Monat**. Stehen mehrere NS-Angaben in einer Notiz, zählt die späteste.

## Verknüpfung mit den Gerätekontakten

Browser erlauben einer Webapp **keinen** dauerhaften Zugriff auf das Adressbuch. Die App übernimmt die Kontakte deshalb per Import und gleicht bei jedem erneuten Import ab (Name, Telefon, Adresse, Notizen werden aktualisiert, die in der App vergebenen Farben bleiben erhalten):

1. **vCard-Datei (.vcf)** – empfohlen, enthält auch die Notizen (und damit NS):
   - iPhone: Kontakte → Listen → „Alle Kontakte“ lange drücken → Exportieren.
   - Android: Kontakte → Einstellungen → Kontakte exportieren.
   - Google/iCloud am PC: Export als vCard.
2. **Kontakte auswählen** (nur Chrome auf Android, Contact Picker API) – liefert Name, Telefon, E-Mail, Adresse, aber **keine Notizen**.

Wer eine echte Live-Verknüpfung braucht, müsste die App als native App verpacken (z. B. Capacitor). Unter iOS benötigt das Lesen der Kontaktnotizen zusätzlich eine spezielle Apple-Berechtigung (`com.apple.developer.contacts.notes`).

Alle Daten bleiben lokal im Browser des Geräts (localStorage). Unter *Import → Daten* gibt es Sicherung/Wiederherstellung als JSON.

## Starten

Die App braucht keinen Build-Schritt – es sind statische Dateien.

```sh
npm start          # startet http://localhost:8080
npm test           # Tests für vCard- und NS-Parser
```

Für die Installation auf dem Handy muss die App über **HTTPS** erreichbar sein, z. B. mit GitHub Pages: *Settings → Pages → Deploy from a branch* und den Branch mit diesen Dateien wählen.

## Design

Gestaltet nach der Visitenkarte von *Piano Atelier François Rosselet*: Schwarz auf Weiss, Schrift Baskervville (lokal eingebunden unter `fonts/`, SIL Open Font License), Logo (Flügel mit Katze) als Vektorgrafik in `piano.svg`. Dunkelmodus folgt der Systemeinstellung.
