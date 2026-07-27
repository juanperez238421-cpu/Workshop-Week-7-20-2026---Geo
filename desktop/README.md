# Triad Territory Rush Local — Windows EXE v27

This directory adds a **local-first Windows desktop edition** to the existing classroom game.

The local edition preserves the current v26 mechanics:

- one real PC team representing exactly three students;
- five optimized authoritative bots;
- three balanced teams with two fighters per team;
- territory painting, projectiles, powers, three lives and five ammunition charges;
- right-click aim, Space fire and Shift dash;
- geometry recovery questions;
- private per-student question records;
- 2.50–5.00 group score.

The gameplay server runs on `127.0.0.1`, so movement, combat, bots, timer and questions do not depend on classroom internet. Internet is used only for optional final-result delivery.

## What the EXE contains

The packaged application starts these components automatically:

1. Electron desktop shell.
2. Local secure WebSocket gateway.
3. Local authoritative game engine.
4. Hidden local teacher controller that creates the room, approves the three-student registration and starts the channel.
5. Existing student renderer and current game assets.
6. Local JSON/CSV result writer.
7. Authenticated HTTPS delivery queue.

The desktop runtime uses 30 Hz authoritative physics and 20 Hz loopback snapshots. Match duration is configurable from 5 to 20 minutes; the default remains 10 minutes.

## Result workflow

At match completion the application immediately:

1. creates a deterministic result ID;
2. writes the complete JSON report to the local results folder;
3. writes an Excel-compatible per-student CSV summary;
4. attempts an authenticated HTTPS POST to the teacher result endpoint;
5. moves failed deliveries into the local outbox;
6. retries queued results every 30 seconds and whenever the teacher requests a manual retry.

A network failure never deletes the local result and never blocks gameplay.

### Local storage location

On Windows, use **LOCAL SETTINGS → OPEN LOCAL RESULTS**. The physical folder is inside Electron's user-data directory, normally under:

```text
%APPDATA%\Triad Territory Rush Local\results
```

Queued reports are stored under:

```text
%APPDATA%\Triad Territory Rush Local\outbox
```

## Teacher server configuration

The updated secure gateway exposes:

```text
POST /api/local-results
```

The app sends the shared secret in:

```text
X-Triad-Report-Key: <shared key>
```

Configure the deployed server with:

```text
TEACHER_PASSWORD=9109
REPORT_INGEST_KEY=<a long random secret of at least 12 characters>
LOCAL_RESULTS_DIR=/var/data/triad-results
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
```

For durable Render storage, mount a persistent disk and point `LOCAL_RESULTS_DIR` to that disk. Without persistent storage, reports can be lost when the service restarts even though each PC retains its local copy.

The authenticated `master.html` page receives a new **Local game results** inbox. It can:

- receive new result notifications immediately;
- refresh the server result list;
- inspect score and per-student questionnaire statistics;
- download the complete JSON;
- download a summary CSV;
- delete a server copy without deleting the originating PC's local file.

## Configure every classroom EXE

### Option A — settings screen

Open **LOCAL SETTINGS** in the game and enter:

- Teacher results endpoint.
- Shared delivery access key.
- Computer label.
- Match duration.

The key is encrypted with Windows secure storage before it is written to disk.

### Option B — portable classroom configuration

Copy `desktop/triad-local-config.example.json` beside the installed or portable executable and rename it:

```text
triad-local-config.json
```

Update its values before copying the package to classroom PCs. Portable configuration takes precedence over per-user settings. Because the key is then stored as plain text beside the EXE, restrict file permissions and do not publish that configured file in GitHub.

## Build on Windows

Install Node.js 20 or newer, then run from the repository root:

```powershell
npm install
npm install --prefix server
npm test
npm run desktop:dist:win
```

Artifacts are created in:

```text
dist\windows\
```

The build creates:

- an NSIS Windows installer;
- a portable x64 `.exe` that can run without installation.

The project does not include a commercial code-signing certificate. Windows SmartScreen may therefore show an unknown-publisher warning until the executable is signed.

## Build with GitHub Actions

Run the workflow:

```text
Build Windows Local EXE
```

The workflow installs root and server dependencies, runs all runtime and packaging validations, builds the installer and portable executable on `windows-latest`, and uploads them as a workflow artifact.

## Local development

```powershell
npm install
npm install --prefix server
npm run desktop:start
```

The app allocates local ports dynamically. Do not open the local gateway URL manually; the desktop shell creates and controls it.

## Validation

```powershell
npm test
```

The v27 tests verify:

- fair question rotation independent from the three-life death cycle;
- configurable local duration;
- 20 Hz local snapshots;
- secure Electron isolation (`contextIsolation`, sandbox and no Node integration);
- local server startup and automatic channel control wiring;
- local result files and queued delivery;
- result-ingestion endpoint and Master inbox wiring;
- desktop build configuration.

## Privacy and operational notes

- Student names and complete question histories are private educational records.
- The student screen does not expose the teacher inbox.
- The report key must not be committed to the public repository.
- Use HTTPS for remote delivery.
- Keep the local results folder until the teacher confirms receipt.
- CSV cells beginning with spreadsheet formula characters are neutralized before export.
