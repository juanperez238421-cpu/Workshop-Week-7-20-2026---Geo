# Triad Territory Rush — Classroom Build

A five-minute geometry and trigonometry territory game designed for **9 players divided into 3 teams of 3**.

## Confirmed match rules

1. The match lasts exactly **5:00 minutes**.
2. The arena always contains **9 fighters**: three Cyan, three Magenta, and three Amber.
3. When a fighter is eliminated, that fighter is locked out of movement and combat.
4. The eliminated fighter receives an individual right-triangle question using Pythagoras, sine, cosine, or tangent.
5. **Only a correct answer unlocks respawn.** A wrong answer or timeout keeps the fighter eliminated and generates another question.
6. Combat points, eliminations, and objectives may remain visible as supporting statistics, but they do not decide the match.
7. The winner is determined strictly by the team that owns the **largest territory** when the five-minute timer reaches zero.

## Questionnaire dataset

At the end of every match, the game compiles one report for all nine fighters. Each player summary contains:

- player name and team;
- human or bot status;
- deaths and respawn-question attempts;
- correct answers, wrong answers, and timeouts;
- accuracy percentage;
- average response time;
- complete answer history, including question type, prompt, selected answer, correct answer, correctness, and response time.

The final report can be downloaded as **CSV** or **JSON** for grading or later analysis.

## Current GitHub Pages mode

The repository root is a static GitHub Pages build. It runs one student-controlled fighter and eight autonomous fighters entirely in the browser. This mode already implements the trigonometry-gated respawn, territory-only winner, and nine-player questionnaire report.

Run locally with:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Real online multiplayer requirement

GitHub Pages cannot run an authoritative WebSocket server. A real match in which nine students connect from nine browsers requires a separately hosted Node.js/WebSocket backend. The production architecture should use:

- GitHub Pages or another static host for the client;
- a Node.js authoritative game server for rooms, movement, combat, territory, questions, and final reports;
- secure `wss://` communication;
- one room code shared by all nine students;
- server-side validation of answers and territory;
- automatic bot filling only when fewer than nine students join;
- CSV/JSON report generation from server-authoritative data.

Until that backend is deployed, the GitHub Pages URL is a functional single-browser classroom simulation rather than true nine-browser synchronous multiplayer.

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move
- Mouse: aim
- `Space` or left click: fire
- `Shift`: dash

## Validation

```bash
npm test
```

The smoke test validates the five-minute duration, nine-player structure, three teams, trigonometry-only respawn gate, territory-only winner, and assessment export logic.
