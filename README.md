# Racing Lab

Einfaches 3D-Rennspiel im Browser (Three.js + Vite + TypeScript, ohne Server) in Neon/Low-Poly-Optik.

## Steuerung

| Taste | Aktion |
| --- | --- |
| ↑ / W | Gas |
| ↓ / S | Bremse / Rückwärts |
| ← → / A D | Lenken |
| Leertaste | Handbremse (mehr Rutschen) |
| R | Neustart (mit Countdown) |
| P / Esc | Pause (auch automatisch beim Tab-Wechsel) |
| T | nächste Strecke (wird gespeichert) |
| M | Ton an/aus (wird gespeichert) |

Nach dem Countdown (3, 2, 1, GO!) startet die Zeit. Eine Runde zählt nur, wenn alle drei Checkpoints durchfahren wurden.
Oben rechts zeigt eine Minikarte Strecke, Auto und Geisterauto; fährst du gegen die Streckenrichtung, erscheint eine Warnung. Es gibt zwei Strecken (*Neon Lab*, *Serpentine*), per Taste **T** oder `?track=serpentine` wählbar. Die Bestzeit und das Geisterauto (je Strecke) der Bestrunde werden im `localStorage` des Browsers gespeichert. In den folgenden Runden fährt das Geisterauto (durchsichtig) die Bestrunde nach.

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

- `tests/countdown.mjs` – Countdown, Pause, Neustart
- `tests/hud-extras.mjs` – Warnung „Falsche Richtung“, Minikarte
- `tests/drift-release.mjs` – Handbremse loslassen: Rutschen baut sich weich ab
- `tests/drive.mjs` – Gas, Lenken, Rutschen, Bremsen, Reset
- `tests/laps.mjs` – Rundenzählung, Checkpoints, Bestzeit, Persistenz
- `tests/effects.mjs` – Driftspuren und Qualm
- `tests/sound.mjs` – Motorsound, Gänge, Stummschalten
- `tests/ghost.mjs` – Geisterauto: Aufzeichnung, Wiedergabe, Speicherung
- `tests/tracks.mjs` – Streckenauswahl, getrennte Bestzeiten
- `tests/lap-bot.mjs [url]` – ein Bot fährt per Tastatur eine komplette Runde
- `tests/smoke.mjs` / `tests/camera.mjs` – Screenshots

Die Tests setzen `window.__NO_COUNTDOWN` und starten damit ohne Countdown (Zeit startet beim ersten Gasgeben); nur `countdown.mjs` testet den echten Ablauf.

Eigenen Chromium-Pfad setzen mit `CHROMIUM_PATH=...` (Standard: `tests/launch.mjs`).

Der Workflow `.github/workflows/test.yml` führt `npm test` bei jedem Pull Request und bei Pushes auf `claude/**` aus.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und veröffentlicht `dist/`.
Einmalig im Repository unter **Settings → Pages → Source** den Eintrag **GitHub Actions** wählen.
