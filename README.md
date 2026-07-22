# Triad Territory Rush — Protocol 3 + Secure Teacher Gateway

[![Validate classroom game](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml/badge.svg)](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml)

A real-time classroom territory game for **nine PC-player slots**. Each real PC represents **exactly three registered students**, so a complete all-human match can involve 27 students.

## Live pages

- **Student game:** `index.html`
- **Teacher control:** `teacher.html`
- **Legacy teacher URL:** `master.html` redirects to `teacher.html`
- **Secure public gateway:** `server/secure-gateway.js`
- **Authoritative game engine:** `server/server-v3.js`
- **Match:** 5 minutes, 3 teams × 3 player slots
- **Winner:** largest server-counted territory

The student page does not display a teacher-console link. The teacher password is verified by the Render WebSocket gateway before the console is unlocked. The browser receives a temporary random teacher token; every privileged command includes that token and is rejected by the gateway when the token is missing, invalid, or expired.

The classroom password is currently `9109`. It is not stored by the browser. Reloading or logging out requires entering it again.

## Protected teacher actions

The gateway requires a valid teacher token for:

- creating or restoring a master room;
- approving or rejecting registrations;
- moving or removing player groups;
- locking registration;
- adding or removing AI replacements;
- starting, ending, or resetting a match.

Student registration, team-name voting, movement, shooting, and trigonometry answers continue to be processed by the authoritative engine.

## Real-test launch sequence

1. Open `teacher.html` on the teacher computer and enter `9109`.
2. Wait until the server accepts the password and the status reads **PROTOCOL 3 ONLINE**.
3. Select **CREATE MASTER ROOM**.
4. Copy the generated student link and open it on each student PC.
5. Each PC registers exactly three students and waits for teacher approval.
6. Approve registrations and balance teams at 3–3–3.
7. Complete team-name suggestions, voting, and ready confirmation.
8. Start only when the teacher console reports that all gates are complete.
9. After the match, download the CSV or JSON report before resetting the room.

## Registration workflow

1. The teacher creates a master room and shares the generated student link.
2. Every real PC registers a PC/group label, exactly three different student names, and a preferred team slot.
3. The teacher verifies the names, approves the PC, and assigns its final team.
4. Each student on that PC submits one team-name suggestion.
5. When all nine students in a team have suggested names, each student casts one vote.
6. The highest-vote proposal becomes the team name. Ties use the earliest valid proposal.
7. The server rejects prohibited or disguised profanity in student, PC-group, and team names.
8. Each team receives a unique random color when the room is created.

## AI replacement players

The teacher can select **FILL ALL MISSING SLOTS WITH AI** when fewer than nine real PCs are available. AI players fill teams to 3–3–3, register virtual students, vote, remain ready, play automatically, and are identified in the lobby, live monitor, and final report.

## Start gate

The teacher can start only when all nine slots are filled, teams are balanced 3–3–3, all real PCs are connected and ready, and all team-name suggestions and votes are complete.

## Gameplay and assessment

- Real eliminated PC groups must solve a server-validated trigonometry question to respawn.
- AI players reboot automatically after elimination.
- The final CSV/JSON report includes PC-group labels, student names, real/AI status, team names, territory, eliminations, deaths, and trigonometry response history.

## Render deployment

Render uses `server/package.json`, whose start command runs:

```bash
node secure-gateway.js
```

Recommended environment variables:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
TEACHER_PASSWORD=9109
```

For immediate compatibility, the gateway falls back to `9109` when `TEACHER_PASSWORD` is not configured.

Expected health response:

```json
{
  "status": "ok",
  "protocol": 3,
  "gatewayProtocol": 1,
  "teacherAuthRequired": true
}
```

## Validation

```bash
npm test
```

The validation suite checks JavaScript syntax, student/teacher page separation, server-verified teacher authentication, protected teacher commands, three-student registration, profanity filtering, team voting, random colors, AI fill, ready gates, and the largest-territory winner rule.
