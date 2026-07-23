# Triad Territory Rush — Master View Gameplay v21 · Server v20 · Reporting v18 · Geometry v19

[![Validate classroom game](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml/badge.svg)](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml)

A real-time classroom territory game for **1–9 PC-player slots**. Each real PC represents **exactly three registered students**. The teacher controls registration, approval, team assignment, match start and final reporting from a separate password-protected page.

## Live pages

- **Student game:** `index.html`
- **Master teacher control:** `master.html`
- **Teacher alias:** `teacher.html` redirects to `master.html`
- **Secure public gateway:** `server/secure-gateway.js`
- **Authoritative engine:** `server/server-v3.js`, extended by `server/runtime-v15.js`
- **Match duration:** 5 minutes
- **Winner:** team controlling the largest territory

The student page contains no master-console link. The teacher password is verified by the secure WebSocket gateway, and protected commands require a temporary server-issued teacher token. The current classroom password is `9109`.

## Master View Gameplay v21

The active student renderer is `student-master-view-v21.js`. It intentionally uses the same visual language as the current teacher live panel in `master-live-v9.js`:

- blue-gray outer canvas `#e8eef6`;
- white arena `#fbfcfe`;
- 34% team-colored territory cells;
- fine 40×25 grid;
- compact triangular players with white outlines;
- visible player hitbox rings and invulnerability rings;
- white player-name cards;
- `L# · A#` life/ammunition telemetry;
- colored supply boxes with white letter symbols;
- white-core projectiles with team-colored trails.

The student version keeps this visual style but uses a **player-centered camera** so it remains practical for active gameplay instead of fitting the entire map into a teacher overview panel.

## Reliable mouse aiming

The right-click aiming behavior is based on the proven `gameplay-v8.js` interaction design:

1. Hold the **right mouse button** directly over the arena.
2. Move the mouse to rotate the character continuously toward the cursor.
3. Release the right mouse button to lock the last direction.
4. Tap **Space** to fire in that locked direction.
5. Hold right click again to adjust the direction.

Implementation safeguards:

- pointer input is handled in capture phase;
- the gameplay canvas receives pointer events only during countdown/play;
- pointer capture prevents aim loss during fast mouse movement;
- the browser context menu is suppressed only over the playable arena;
- form fields and interface panels remain excluded from gameplay pointer handling;
- initialized aim angle is inserted into outgoing input packets even after right click is released;
- the renderer observes the existing student WebSocket and never creates a second connection.

## Movement and camera

- local movement is predicted visually between authoritative snapshots;
- remote players are interpolated and briefly extrapolated;
- the camera follows smoothly with movement and aim look-ahead;
- player speed is **620 units/s**;
- dash speed is **1900 units/s** for **210 ms**;
- dash cooldown is **1.8 seconds**;
- large correction errors snap back to the authoritative server position;
- elimination bursts and subtle camera shake communicate combat events.

Prediction is visual only. Position, collision, territory and eliminations remain server-authoritative.

## Authoritative projectile server v20

The backend remains `server/runtime-v15.js`:

- bullets travel visibly at **2850 units/s**;
- bullet lifetime is **2350 ms**;
- normal human fire remains semi-automatic;
- Rapid power permits held automatic fire;
- collision uses relative-motion swept segments against moving targets;
- bounded long-shot padding compensates for snapshot spacing;
- the server records shots, hits, eliminations and combat accuracy;
- shot and dash cooldown durations are sent in authoritative player state.

Five ammunition charges, one-charge-per-five-seconds recovery and the three-life respawn structure remain unchanged.

## Stable classroom infrastructure preserved

Gameplay v21 does not replace the stable classroom control path:

- registration-first rendering and writable full-name fields;
- exactly three students represented by each real PC;
- one existing WebSocket per student browser;
- reconnect tokens and stale-socket protection;
- soft full-state recovery before hard reconnect;
- delta territory snapshots on the same **40×25** grid;
- server-verified master authentication;
- immediate teacher registration inbox;
- teacher-controlled team assignment;
- 1–9-player flexible start and optional AI fill;
- complete automatic metadata export and cumulative global scoring.

## Focused Geometry v19

Respawn questions remain restricted to:

1. sine or cosine ratio recognition with all three sides shown and no decimal calculation;
2. one unknown right-triangle side using the Pythagorean theorem;
3. one unknown height using Thales' theorem and similar triangles.

## Full-name registration

Student fields isolate typing from combat controls. Spaces, accents, arrow keys and clipboard shortcuts work normally. Each of the three names may contain up to 60 characters on client and server.

## Automatic classroom report

When the fight ends, the teacher browser automatically downloads one complete JSON file containing:

- room and match identifiers;
- start/end timestamps and duration;
- winner and team territory totals;
- every real and AI player;
- the three students represented by each PC;
- territory, eliminations and deaths;
- shots fired, hits and combat accuracy;
- questions presented and answered;
- correct, wrong and timed-out attempts;
- every question prompt, answer option, selected answer, correct answer and response time;
- match score and cumulative global score.

Manual **DOWNLOAD CSV** and **DOWNLOAD JSON** controls remain available.

## Global score model

```text
score = territory cells
      + 25 × eliminations
      + 20 × correct answers
      - 5 × deaths
      + 100 when the player's team wins
```

The score cannot become negative. Global-score durability uses the server file when writable, the teacher browser's per-match local ledger and the automatic final JSON export.

## Real-test launch sequence

1. Open `master.html` and enter `9109`.
2. Wait for Protocol 3 to report online.
3. Create a room and share its six-character PIN.
4. Each PC registers exactly three full student names.
5. Review and approve each registration, assigning its team.
6. Confirm every included real player is connected and Ready.
7. Start with 1–9 approved players; AI fill is optional.
8. Test right-click mouse rotation before firing.
9. At the end, retain the automatic complete metadata JSON before resetting.

## Render deployment

`server/package.json` starts:

```bash
node --require ./runtime-v15.js secure-gateway.js
```

Recommended environment variables:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
TEACHER_PASSWORD=9109
```

Optional persistent score path:

```text
GLOBAL_SCORE_FILE=/persistent/path/global-score.json
```

## Validation

```bash
npm test
```

The suite checks syntax, student/master separation, authentication, registration and reconnect behavior, v9/v12 networking foundations, Master View visual parity, captured right-click aiming, outgoing angle locking, the v20 swept-projectile server, Reporting v18, Geometry v19, flexible match start and the largest-territory winner rule.
