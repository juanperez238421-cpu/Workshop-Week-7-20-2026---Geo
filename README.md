# Triad Territory Rush — Protocol 4 classroom release

A real-time classroom territory game for **nine PC-player slots**. Each real PC represents **exactly three registered students**, so a complete all-human match can involve 27 students.

## Live pages

- **Student page:** `student.html`
- **Teacher page:** `teacher.html`
- **Root URL:** redirects to the student page and preserves the room code query parameter.
- **Legacy teacher URL:** `master.html` redirects to `teacher.html`.
- **Authoritative engine:** `server/server-v3.js`
- **Secure gateway:** `server/secure-gateway.js`

The student page does not contain a teacher-console link. The teacher page is unlocked with the classroom PIN and all privileged WebSocket commands are blocked by the server gateway until authentication succeeds.

## Teacher access

The current classroom password is:

```text
9109
```

The gateway reads `TEACHER_PASSWORD` from the Render environment. For immediate compatibility it falls back to `9109`, but the Render environment variable should be set before changing the classroom PIN.

The password is held only in the teacher page's memory for the active browser session. It is not written to `localStorage`. The existing room code and controller token remain in `localStorage` so the teacher can restore a disconnected room after entering the password again.

## Registration workflow

1. Open `teacher.html`, enter the teacher password, and create a master room.
2. Share the generated `student.html?room=XXXXXX` link.
3. Every real PC registers:
   - a PC/group label;
   - exactly three different student names;
   - a preferred team slot.
4. The teacher verifies the names, approves the PC, and assigns its final team.
5. Each student submits one respectful team-name suggestion and one vote.
6. The teacher can fill missing PC-player slots with server-controlled AI.
7. The match starts only when the teams are 3–3–3, naming is complete, and every real PC is ready.

## Security boundary

`secure-gateway.js` proxies every browser connection to the existing authoritative engine. It protects these teacher-only commands:

- room creation and restoration;
- registration approval and rejection;
- team movement and player removal;
- registration locking;
- AI fill and removal;
- match start, forced end, and round reset.

Student registration, voting, movement, shooting, and trigonometry answers continue to use the authoritative engine unchanged.

## Match and assessment

- Match duration: 5 minutes.
- Teams: 3 teams × 3 player slots.
- Winner: largest server-counted territory.
- Real eliminated PC groups solve a server-validated trigonometry question to respawn.
- The final CSV/JSON report includes PC-group labels, all three student names, real/AI status, team names, territory, eliminations, deaths, and trigonometry response history.

## Render deployment

Render uses the repository `render.yaml` and the `server` directory.

Required environment values:

```text
ALLOWED_ORIGINS=https://juanperez238421-cpu.github.io
TEACHER_PASSWORD=9109
```

The service starts with:

```bash
node secure-gateway.js
```

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

The test suite checks JavaScript syntax, HTML/JS DOM contracts, separate role pages, teacher PIN validation, protected commands, origin checks, three-student registration, profanity filtering, team voting, random colors, AI fill, ready gates, and the largest-territory winner rule.
