# Triad Territory Rush — GitHub Pages Build

A complete browser game for a 5-minute classroom activity:

- 9 total players.
- 3 teams with 3 players per team.
- One human-controlled player and 8 autonomous players in the static GitHub Pages build.
- Random, widely separated starting positions.
- Territory capture, projectiles, dash movement, elimination particles, minimap, and live team scoreboard.
- Every eliminated player must answer a trigonometry question correctly before respawning.
- The winner is determined **only by the largest territory** at the end of 5 minutes.
- A final assessment report compiles every answer for all 9 players.
- Reports can be downloaded as CSV or JSON.

## Play locally

Use a local HTTP server; do not open `index.html` with `file://` because the game loads its compressed source through `fetch`.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move.
- Mouse: aim.
- `Space` or left click: fire.
- `Shift`: dash.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` validates and publishes the repository root.

In the repository settings, select:

```text
Settings → Pages → Source → GitHub Actions
```

After the workflow completes, use the Pages URL shown in the deployment.

## Validation

```bash
npm test
```

The automated smoke test verifies that:

- the loader and decompressed game source parse successfully;
- every DOM element requested by the game exists in `index.html`;
- the required 5-minute, 9-player, 3-team, trigonometry-respawn, territory-winner, CSV, and JSON logic is present.

## Deployment architecture

GitHub Pages is static hosting and cannot run an authoritative WebSocket server. This version is intentionally self-contained: one student controls one player and eight autonomous players complete the 9-player arena. It works immediately from the Pages URL and produces a full 9-player questionnaire report.

A true 9-browser synchronous multiplayer edition requires a separately hosted backend service.
