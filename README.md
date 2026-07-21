# Triad Territory Rush — Teacher-Controlled Real Multiplayer

This repository deploys three coordinated components:

1. **Student game client** on GitHub Pages: `index.html`
2. **Teacher master console** on GitHub Pages: `master.html`
3. **Authoritative Node.js WebSocket server** on Render: `server/server-v2.js`

The Render URL is an API/WebSocket endpoint. Opening it directly shows JSON; it is **not** the visual game. Students must open the GitHub Pages student link.

## Live URLs

- Student game: `https://juanperez238421-cpu.github.io/Workshop-Week-7-20-2026---Geo/`
- Teacher console: `https://juanperez238421-cpu.github.io/Workshop-Week-7-20-2026---Geo/master.html`
- Render server: `https://triad-territory-rush-server.onrender.com`

## Classroom workflow

1. Teacher opens `master.html` and selects **CREATE MASTER ROOM**.
2. The server creates a six-character room code and a student entry link.
3. Teacher shares the student link with the nine computers.
4. Each student enters a group name and selects a team preference, then selects **REGISTER AND WAIT FOR TEACHER**.
5. Registrations appear in the teacher console as pending.
6. Teacher approves each registration and assigns the final team.
7. Approved students select **I AM READY**.
8. Start is enabled only with exactly nine connected and ready students, balanced 3–3–3.
9. Teacher selects **START 5-MINUTE MATCH**.
10. Teacher monitors territory, eliminations, connection state, and trigonometry status from the master console.

The teacher controller is not counted as one of the nine players.

## Match rules

- Exactly 9 real student browsers.
- Exactly 3 players per team.
- Five-minute server-authoritative timer.
- Movement, shooting, dashing, collisions, territory and winner are validated by the server.
- Eliminated students remain blocked until they answer an individual trigonometry question correctly.
- Wrong answers and timeouts keep the player eliminated and generate another question.
- The winner is determined only by largest territory.
- Teacher and students receive CSV/JSON reports at match end.

## Render deployment

The existing Render Blueprint uses `render.yaml` and the current service:

`https://triad-territory-rush-server.onrender.com`

Environment variable:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
```

Render automatically deploys updates from `main`. The server health endpoint is `/health` and protocol information is available at `/`.

## Local validation

```bash
npm test
```

Server only:

```bash
cd server
npm install
npm test
npm start
```
