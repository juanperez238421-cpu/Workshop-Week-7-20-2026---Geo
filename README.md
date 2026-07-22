# Triad Territory Rush — Protocol 3

[![Validate classroom game](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml/badge.svg)](https://github.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/actions/workflows/validate.yml)

A real-time classroom territory game for **nine PC-player slots**. Each real PC represents **exactly three registered students**, so a complete all-human match can involve 27 students.

## Live pages

- **Student game:** `index.html`
- **Teacher control:** `teacher.html`
- **Legacy teacher URL:** `master.html` redirects to `teacher.html`
- **Authoritative server:** Render, using `server/server-v3.js`
- **Match:** 5 minutes, 3 teams × 3 player slots
- **Winner:** largest server-counted territory

The student page does not display a teacher-console link. The teacher page is protected by a four-digit classroom password and keeps access only in the current browser tab through `sessionStorage`. The password is verified against a SHA-256 hash in `teacher-auth.js`; the plain password is not stored in the repository.

> Important: GitHub Pages is a static host. This password gate prevents casual or accidental student access, but it is not equivalent to server-side authentication. A technically skilled user with source-code access could still bypass it. The authoritative room token and match actions remain controlled by the multiplayer server.

## Real-test launch sequence

1. Open `teacher.html` on the teacher computer and enter the teacher password.
2. Wait until the status reads **PROTOCOL 3 ONLINE**.
3. Select **CREATE MASTER ROOM**.
4. Copy the generated student link and open it on each student PC.
5. Each PC registers exactly three students and waits for teacher approval.
6. Approve registrations and balance teams at 3–3–3.
7. Complete team-name suggestions, voting and ready confirmation.
8. Start only when the teacher console reports that all gates are complete.
9. After the match, download the CSV or JSON report before resetting the room.

## Registration workflow

1. The teacher creates a master room and shares the generated student link.
2. Every real PC registers:
   - a PC/group label;
   - exactly three different student names;
   - a preferred team slot.
3. The teacher verifies the three names, approves the PC, and assigns its final team.
4. Each of the three students on that PC submits one team-name suggestion.
5. When all nine students in a team have suggested names, each student casts one vote.
6. The highest-vote proposal becomes the team name. Ties use the earliest valid proposal.
7. The server rejects prohibited or disguised profanity in student, PC-group and team names.
8. Each team receives a unique random color when the room is created.

## AI replacement players

The teacher can select **FILL ALL MISSING SLOTS WITH AI** when fewer than nine real PCs are available.

AI players:

- fill each team to exactly three slots;
- register three virtual students;
- submit safe team-name suggestions and votes;
- remain ready automatically;
- move, target opponents, shoot, dash, capture territory and respawn automatically;
- are marked clearly as AI in the lobby, live monitor and final report.

Bots can be removed from the lobby before the match.

## Start gate

The teacher can start only when:

- all 9 player slots are filled by real PCs and/or AI;
- teams are balanced 3–3–3;
- all real PCs are connected;
- every real PC has completed its three suggestions and three votes;
- all team names are finalized;
- every real PC is ready.

## Gameplay and assessment

- Real eliminated PC groups must solve a server-validated trigonometry question to respawn.
- AI players reboot automatically after elimination.
- The final CSV/JSON report includes PC-group labels, all three student names, real/AI status, voted team names, territory, eliminations, deaths and trigonometry response history.

## Deployment

The current Render service is reused. Render reads `server/package.json`, whose start command runs:

```bash
node server-v3.js
```

The existing environment variable remains:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
```

Expected server response after deployment:

```json
{
  "status": "ok",
  "protocol": 3,
  "architecture": "teacher-controller-nine-pc-groups-voting-and-ai"
}
```

## Validation

```bash
npm test
```

The test suite checks JavaScript syntax, student/teacher page separation, teacher authentication DOM contracts, three-student registration, profanity filtering, team voting, random colors, AI fill, ready gates and the largest-territory winner rule.
