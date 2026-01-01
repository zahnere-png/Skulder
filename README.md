# SkuldKoll (PWA)

Enkel, snabb och snygg PWA för att hålla koll på skulder. All data lagras lokalt i webbläsaren (IndexedDB) och fungerar offline via Service Worker.

## Funktioner
- Lägg in skulder med person, belopp, datum, tid, kategori, plats och anteckning
- Markera som betald/obetald
- Filter, sortering och fritextsök
- **Per person-summering** med snabbfilter
- **Påminnelser/notiser** för obetalda skulder efter X dagar (lokalt)
- **PIN-lås** (4–8 siffror) för att skydda öppningen av appen
- Export/Import till JSON/CSV
- PWA: Installera som app och använd offline

> Notera: Ingen geolokalisering används. "Plats" är en manuell textruta.

## Publicera på GitHub Pages
1. Skapa ett repo och lägg alla filer i rotmappen.
2. Gå till **Settings → Pages** och sätt **Deploy from a branch** på `main` (root).
3. Öppna `https://<ditt-användarnamn>.github.io/<repo>/`.

## Licens
MIT
