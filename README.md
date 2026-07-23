# Triad Territory Rush — Combat and Reporting v18

[![Validate classroom game](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml/badge.svg)](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml)

A real-time classroom territory game for **1–9 PC-player slots**. Each real PC represents **exactly three registered students**. The teacher controls registration, approval, match start and final reporting from a separate password-protected page.

## Live pages

- **Student game:** `index.html`
- **Master teacher control:** `master.html`
- **Teacher alias:** `teacher.html` redirects to `master.html`
- **Secure public gateway:** `server/secure-gateway.js`
- **Authoritative game engine:** `server/server-v3.js`, extended at runtime by `server/runtime-v13.js`
- **Match duration:** 5 minutes
- **Winner:** team controlling the largest territory

The student page contains no link to the master console. The teacher password is verified by the secure WebSocket gateway. The browser receives a temporary teacher token, and protected commands are rejected when the token is missing, invalid or expired.

The classroom password is currently `9109`. It is not stored by the browser. Reloading or logging out requires entering it again.

## What changed in v18

### Fast top-down shooting

Combat now uses **server-authoritative semi-automatic hitscan**:

- hold right click to aim;
- **tap Space once per shot**;
- the server resolves the shot immediately along the aim ray;
- a short tracer and muzzle flash communicate the shot to the player;
- holding Space does not create uncontrolled automatic fire for human players;
- ammunition remains limited to five charges and recovers by one charge every five seconds;
- the existing three-life and geometry-respawn structure is preserved.

The implementation is inspired by the responsiveness of fast top-down action games. It does not copy proprietary art, audio, maps or source code.

### Full-name registration

Student fields isolate keyboard input from gameplay controls. Students can type or paste names and surnames using:

- spaces;
- accents;
- arrow keys;
- normal clipboard shortcuts.

Gameplay canvases remain lazy until the match begins, preserving the registration-first recovery introduced in v17. Names may contain up to 60 characters on both client and server.

### Automatic classroom report

When the fight ends, the teacher browser automatically downloads one complete JSON file containing:

- room and match identifiers;
- start/end timestamps and duration;
- winner and team territory totals;
- every real and AI player;
- the three students represented by each PC;
- territory, eliminations and deaths;
- shots fired, hits and combat accuracy;
- number of questions presented and answered;
- correct, wrong and timed-out attempts;
- every question prompt and answer option;
- selected and correct options;
- response time and outcome for each attempt;
- match score and cumulative global score.

Manual **DOWNLOAD CSV** and **DOWNLOAD JSON** buttons remain available.

## Global score model

Each real student's cumulative record is keyed by a normalized version of the registered full name. One PC's match performance is credited to each of its three represented students.

Current per-match score:

```text
score = territory cells
      + 25 × eliminations
      + 20 × correct answers
      - 5 × deaths
      + 100 when the player's team wins
```

The score is never allowed to become negative.

Global score durability uses three layers:

1. **Server process/file:** `server/global-score.json` is updated when the deployment filesystem permits it.
2. **Teacher browser backup:** every unique `matchId` is stored once in `localStorage` and aggregated independently.
3. **Automatic JSON export:** the complete match and global-score snapshot is downloaded after every fight.

The browser backup and downloaded JSON are important because some cloud deployment filesystems may be ephemeral across restarts or redeployments.

## Protected master actions

The gateway requires a valid teacher token for:

- creating or restoring a master room;
- approving or rejecting registrations;
- removing player groups;
- changing ready state;
- locking registration;
- adding or removing AI replacements;
- starting, ending or resetting a match.

Student registration, movement, shooting and geometry answers continue to be processed by the authoritative engine.

## Real-test launch sequence

1. Open `master.html` on the teacher computer and enter `9109`.
2. Wait until the server reports Protocol 3 online.
3. Select **CREATE ROOM**.
4. Copy the six-character PIN to the students.
5. Each PC registers exactly three full student names.
6. Review each request under **Student registration requests** and approve or reject it.
7. Ensure every included real player is connected and Ready.
8. Start the match with 1–9 approved players; AI fill remains optional.
9. At the end, confirm the complete metadata JSON downloads automatically.
10. Keep the automatic file before resetting the room.

## Render deployment

`server/package.json` starts:

```bash
node --require ./runtime-v13.js secure-gateway.js
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

Expected health response includes Protocol 3 and teacher authentication.

## Validation

From the repository root:

```bash
npm test
```

The validation suite checks JavaScript syntax, student/master separation, server-verified teacher authentication, registration behavior, runtime patch compatibility, authoritative hitscan markers, tracer metadata, complete report fields, automatic export integration, flexible match start and the largest-territory winner rule.
