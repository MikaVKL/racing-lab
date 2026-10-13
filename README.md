# Racing Lab

Einfaches 3D-Rennspiel im Browser (Three.js + Vite + TypeScript, ohne Server) in Neon/Low-Poly-Optik.

## Steuerung

| Taste | Aktion |
| --- | --- |
| ↑ / W | Gas |
| ↓ / S | Bremse / Rückwärts |
| ← → / A D | Lenken |
| Leertaste | Handbremse (mehr Rutschen) |
| R | Neustart |
| M | Ton an/aus (wird gespeichert) |

Die Zeit startet mit dem ersten Gasgeben. Eine Runde zählt nur, wenn alle drei Checkpoints durchfahren wurden.
Die Bestzeit und das Geisterauto der Bestrunde werden im `localStorage` des Browsers gespeichert. In den folgenden Runden fährt das Geisterauto (durchsichtig) die Bestrunde nach.

## Entwicklung

```sh
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run build    # Typprüfung + Produktions-Build nach dist/
```

### Tests (Playwright, laufendes Spiel)

Bei laufendem `npm run dev`:

```sh
npm test
```

- `tests/drive.mjs` – Gas, Lenken, Rutschen, Bremsen, Reset
- `tests/laps.mjs` – Rundenzählung, Checkpoints, Bestzeit, Persistenz
- `tests/effects.mjs` – Driftspuren und Qualm
- `tests/sound.mjs` – Motorsound, Gänge, Stummschalten
- `tests/ghost.mjs` – Geisterauto: Aufzeichnung, Wiedergabe, Speicherung
- `tests/lap-bot.mjs` – ein Bot fährt per Tastatur eine komplette Runde
- `tests/smoke.mjs` / `tests/camera.mjs` – Screenshots

Eigenen Chromium-Pfad setzen mit `CHROMIUM_PATH=...`.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und veröffentlicht `dist/`.
Einmalig im Repository unter **Settings → Pages → Source** den Eintrag **GitHub Actions** wählen.
