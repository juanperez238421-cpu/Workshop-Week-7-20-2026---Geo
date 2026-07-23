# Triad Territory Rush — Gameplay v20 · Reporting v18 · Geometry v19

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

## Gameplay v20

Gameplay v20 restores the responsive dynamics from the strongest earlier projectile/interpolation versions while keeping the current stable connection and reporting stack.

### Movement and camera

- local player movement is predicted visually between authoritative snapshots;
- remote players are interpolated and briefly extrapolated instead of jumping between state packets;
- the camera follows smoothly with movement and aiming look-ahead;
- player speed is **620 units/s**;
- dash speed is **1900 units/s** for **210 ms**;
- dash cooldown is **1.8 seconds**;
- movement dust, dash trails, player shadows and elimination particles improve motion readability.

Prediction is visual only. Position, collision, territory and eliminations remain server-authoritative.

### Visible projectile combat

- hold right click to aim;
- tap **Space** to fire normally;
- normal human fire remains semi-automatic;
- the Rapid power permits held automatic fire;
- bullets travel visibly at **2850 units/s**;
- bullet lifetime is **2350 ms**;
- collision uses a relative-motion swept segment against the target's movement segment;
- a small bounded long-shot allowance compensates for network and snapshot spacing without turning the hitbox into a large circle;
- immediate local muzzle feedback hides input latency, while the server decides every real hit;
- authoritative projectile x/y/velocity data drives bullet streaks on every client.

Five ammunition charges and one-charge-per-five-seconds regeneration remain unchanged. The three-life and geometry-respawn structure also remains unchanged.

### Cooldown feedback

The server now includes the actual shot and dash cooldown durations in each player state. The student HUD animates both progress bars continuously from server time instead of using old hard-coded durations.

## Stable classroom infrastructure preserved

Gameplay v20 does not replace the stable control path:

- registration-first rendering and writable full-name fields;
- one existing WebSocket per student browser;
- reconnect tokens and stale-socket protection;
- soft full-state recovery before hard reconnect;
- delta territory snapshots on the same **40×25** grid;
- server-verified master authentication;
- immediate teacher registration inbox;
- 1–9-player flexible start and optional AI fill;
- complete automatic metadata export and cumulative global scoring.

`student-gameplay-v20.js` observes the existing socket. It never creates a second multiplayer connection.

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

## Protected master actions

A valid teacher token is required for creating/restoring rooms, approving/rejecting registrations, assigning teams, changing readiness, locking registration, managing AI, and starting/ending/resetting matches. Student movement, shooting and geometry answers remain authoritative-engine operations.

## Real-test launch sequence

1. Open `master.html` and enter `9109`.
2. Wait for Protocol 3 to report online.
3. Create a room and share its six-character PIN.
4. Each PC registers exactly three full student names.
5. Review and approve each registration, assigning its team.
6. Confirm every included real player is connected and Ready.
7. Start with 1–9 approved players; AI fill is optional.
8. At the end, retain the automatic complete metadata JSON before resetting.

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

The suite checks syntax, student/master separation, authentication, registration and reconnect behavior, v9/v12 compatibility foundations, visible swept projectile combat, movement/cooldown telemetry, Reporting v18, Geometry v19, flexible match start and the largest-territory winner rule.
