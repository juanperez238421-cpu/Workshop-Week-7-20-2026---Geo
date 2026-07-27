# Triad Territory Rush — Local Windows v27 + Online Classroom Server

Triad Territory Rush is a real-time classroom territory game for Geometry. Each real PC represents **exactly three students** and controls one shared fighter against five authoritative server bots.

Release v27 adds:

- a local-first Windows installer and portable `.exe`;
- an embedded authoritative server on `127.0.0.1`;
- automatic local room creation, approval and match start;
- fair question rotation independent from the three-life death cycle;
- local JSON and CSV result files;
- authenticated instant delivery to the teacher server;
- an offline outbox with automatic retry;
- a password-protected Master inbox for local EXE results.

## Current gameplay architecture

### Online classroom mode

- One Master room PIN.
- Up to nine isolated PC channels.
- One real PC + five bots in each channel.
- Six combatants arranged as two fighters per team.
- 30 Hz authoritative physics.
- 10 Hz student snapshots.
- One-hertz aggregate Master telemetry.
- Ten-minute default match.
- Independent channel start, end, reconnect and reset.

### Local Windows mode

- One local PC channel per EXE instance.
- No internet required for gameplay.
- Local gateway and authoritative engine start automatically.
- Hidden local controller approves the registration and starts the channel.
- 20 Hz loopback snapshots for lower visible latency.
- Match duration configurable from 5 to 20 minutes.
- Internet is used only for optional final-result delivery.

## Pages

- Student game: `index.html`
- Master teacher control: `master.html`
- Teacher alias: `teacher.html`
- Secure gateway: `server/secure-gateway.js`
- Authoritative base engine: `server/server-v3.js`
- Effective online runtime: `server/runtime-v22.js`
- Local desktop runtime: `desktop/runtime-local.js`
- Electron main process: `desktop/main.js`

## Core mechanics

- Three teams.
- Territory ownership on a 40 × 25 grid.
- Server-authoritative movement, collisions, projectiles, eliminations and timer.
- Right-click aim and release-to-lock direction.
- Spacebar fire.
- Shift dash.
- Five ammunition charges with one charge regenerated every five seconds.
- Three lives.
- Ammunition, shield, speed, rapid-fire and paint powers.
- Geometry recovery after the final life.
- Score range from 2.50 to 5.00.

## Geometry question records

Each PC registers three students. v27 maintains two independent rotations:

1. assigned deaths rotate Student 1 → Student 2 → Student 3;
2. actual geometry questions rotate Student 1 → Student 2 → Student 3.

This avoids the previous three-life bias where every question could be assigned to the third student.

The Master report stores, per student:

- assigned deaths;
- attempts;
- correct answers;
- wrong answers;
- timeouts;
- accuracy;
- average response time;
- complete question and answer history.

Kills, territory and shooting accuracy remain shared PC-group values and are labelled as shared values.

## Local result delivery

At the end of a local match, the EXE:

1. saves a complete JSON result;
2. saves a per-student CSV summary;
3. sends the report to `POST /api/local-results` using `X-Triad-Report-Key`;
4. queues the report if delivery fails;
5. retries automatically every 30 seconds.

The Master page receives live notifications and provides a private result inbox.

Detailed Windows setup is documented in [`desktop/README.md`](desktop/README.md).

## Windows build

```powershell
npm install
npm install --prefix server
npm test
npm run desktop:dist:win
```

Output:

```text
dist\windows\
```

The build creates an NSIS installer and a portable x64 EXE.

## Local development

```powershell
npm install
npm install --prefix server
npm run desktop:start
```

## Online server deployment

Run:

```bash
cd server
npm install
npm start
```

Recommended environment variables:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
TEACHER_PASSWORD=9109
REPORT_INGEST_KEY=<long random shared secret>
LOCAL_RESULTS_DIR=/var/data/triad-results
GLOBAL_SCORE_FILE=/var/data/global-score.json
```

`REPORT_INGEST_KEY` must contain at least 12 characters. Use a persistent disk for `LOCAL_RESULTS_DIR` if server-side result durability is required.

## Teacher workflow

1. Open `master.html`.
2. Unlock with the configured teacher password.
3. Create or restore the Master room.
4. Review online PC registrations or the Local Windows result inbox.
5. For online play, approve registrations and start the selected channels.
6. For local EXE play, configure every app with the same result endpoint and report key.
7. Retain local result files until server receipt is confirmed.

## Validation

```bash
npm test
```

The suite checks:

- existing v26 authoritative movement and timer recovery;
- five-bot 2–2–2 channel balance;
- fair v27 question rotation;
- configurable local match duration;
- 20 Hz loopback snapshots;
- Electron process isolation;
- automatic local channel control;
- result files and queued delivery;
- authenticated server ingestion;
- Master result inbox wiring;
- Windows packaging configuration.

## Security and privacy

- Teacher commands require a temporary server-issued token.
- Local result ingestion requires a separate shared report key.
- The Windows app encrypts its saved report key with Electron safe storage.
- Remote delivery must use HTTPS except local development on `localhost`.
- CSV formula-like cells are neutralized before export.
- Student names and answer histories are private educational records.
- Do not commit `triad-local-config.json` or a configured report key.

## Windows signing

The repository does not contain a commercial code-signing certificate. Unsigned builds may trigger Windows SmartScreen. Sign production classroom builds before broad distribution.
