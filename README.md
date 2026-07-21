# Triad Territory Rush — Real Online Multiplayer

This repository now contains two deployable components:

1. **GitHub Pages client** in the repository root.
2. **Authoritative Node.js WebSocket server** in `server/`.

The online edition is designed for **exactly nine real student computers**, divided into **three teams of three**. There are no gameplay bots in the real multiplayer room.

## Match rules

- One student creates a room and becomes the host.
- The host shares a six-character room code with the other eight computers.
- Each team has exactly three seats.
- The server starts a five-minute authoritative timer only when all nine players are connected.
- Movement, firing, dashing, projectile collisions, eliminations, territory ownership, questions, respawns, and the final winner are validated by the server.
- An eliminated player cannot move, fire, dash, or capture territory.
- The eliminated player receives an individual trigonometry question.
- Only a correct server-validated answer allows respawn.
- Incorrect answers and timeouts keep the player eliminated and generate another question.
- The winner is determined strictly by the largest territory when the five-minute timer reaches zero.
- Every client receives the final nine-player questionnaire report and can download CSV and JSON files.

## 1. Deploy the multiplayer server

The included `render.yaml` can deploy the server on Render.

1. Create a Render account.
2. Choose **New → Blueprint**.
3. Select this GitHub repository.
4. Render detects `render.yaml` and creates `triad-territory-rush-server`.
5. Set the `ALLOWED_ORIGINS` environment variable to your GitHub Pages origin:

```text
https://juanperez238421-cpu.github.io
```

6. Deploy and copy the public HTTPS address, for example:

```text
https://triad-territory-rush-server.onrender.com
```

The browser game automatically converts an `https://` server address to `wss://`.

### Alternative local server

```bash
cd server
npm install
npm start
```

The local server runs at:

```text
ws://localhost:8080
```

All nine computers must be able to reach the machine running that address. For a school LAN, use the host computer's LAN IP instead of `localhost`, and allow port `8080` through the firewall.

## 2. Configure the GitHub Pages client

Either paste the deployed server address into the game's **Multiplayer server URL** field, or set it permanently in `config.js`:

```js
window.TRIAD_CONFIG = Object.freeze({
  serverUrl: "wss://triad-territory-rush-server.onrender.com"
});
```

Commit the change to `main` so GitHub Pages republishes it.

## 3. Enable GitHub Pages

In the repository:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

Then run the **Deploy GitHub Pages** workflow from the Actions tab. The expected client address is:

```text
https://juanperez238421-cpu.github.io/Workshop-Week-7-20-2026---Geo/
```

## 4. Start a nine-computer classroom match

On computer 1:

1. Open the GitHub Pages game.
2. Enter the server URL, student name, and team.
3. Select **CREATE ROOM**.
4. Share the displayed room code.

On computers 2–9:

1. Open the same GitHub Pages game.
2. Enter the same server URL.
3. Enter the student name and assigned team.
4. Enter the room code and select **JOIN ROOM**.

The room enforces three students per team. When the lobby shows **9/9 connected** and **3/3** for each team, computer 1 selects **START 5-MINUTE MATCH**.

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move
- Mouse: aim
- `Space` or left click: fire
- `Shift`: dash

## Reconnection

Each browser stores a temporary room session token. If Wi-Fi briefly disconnects or a tab reloads, the client attempts to reconnect to the same player seat for up to 60 seconds.

## Assessment data

At match end, both exports include per-player totals and the complete answer history:

- player and team;
- territory, eliminations, and deaths;
- attempts, correct answers, incorrect answers, and timeouts;
- accuracy and average response time;
- question type and prompt;
- selected option and correct option;
- outcome and response time.

## Validation

From the repository root:

```bash
npm test
```

From the server directory after installing dependencies:

```bash
npm test
```
